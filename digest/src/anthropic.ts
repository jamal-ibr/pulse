import type { TokenUsage } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 2_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

export interface ClaudeRequest {
  model: string;
  system: string;
  userMessage: string;
  maxTokens: number;
  webSearchMaxUses?: number;
}

export interface ClaudeResponse {
  text: string;
  usage: TokenUsage;
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal Messages API client. The system prompt carries cache_control so the
 * static context block gets the prompt-cache input discount across batches.
 */
interface ApiMessage {
  content: unknown[];
  stop_reason: string;
  usage: TokenUsage;
}

async function postMessages(body: Record<string, unknown>): Promise<ApiMessage> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as ApiMessage;
    lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`;
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
  }
  throw new Error(`Claude API call failed after retries: ${lastError}`);
}

function addUsage(total: TokenUsage, usage: TokenUsage): TokenUsage {
  return {
    input_tokens: total.input_tokens + usage.input_tokens,
    output_tokens: total.output_tokens + usage.output_tokens,
    cache_creation_input_tokens:
      (total.cache_creation_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: (total.cache_read_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    server_tool_use: {
      web_search_requests:
        (total.server_tool_use?.web_search_requests ?? 0) + (usage.server_tool_use?.web_search_requests ?? 0),
    },
  };
}

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: req.userMessage }];
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (req.webSearchMaxUses && req.webSearchMaxUses > 0) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: req.webSearchMaxUses }];
  }

  let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  // Long-running server tool turns can pause; resume until the turn is final.
  const MAX_CONTINUATIONS = 3;
  for (let round = 0; ; round += 1) {
    const data = await postMessages(body);
    usage = addUsage(usage, data.usage);
    if (data.stop_reason === "pause_turn" && round < MAX_CONTINUATIONS) {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    const text = (data.content as { type: string; text?: string }[])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    return { text, usage };
  }
}

/** Pull the first JSON array or object out of a model response. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in model response: ${text.slice(0, 200)}`);
  const openChar = candidate[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(closeChar);
  if (end <= start) throw new Error(`Unterminated JSON in model response: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
