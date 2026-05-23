import { log } from "../utils/logger.js";

const MODEL = process.env.PULSE_DRAFT_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 600;

export interface ClaudeDraftResponse {
  subject: string;
  body: string;
  raw?: unknown;
}

let client: unknown = null;
async function getClient(): Promise<unknown> {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import("@anthropic-ai/sdk")) as any;
  const Anthropic = mod.default ?? mod.Anthropic;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Send a single drafting request. The system prompt is cache-eligible so
 * batches of drafts pay for it once. Returns parsed subject/body or throws.
 */
export async function generateDraft(opts: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<ClaudeDraftResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (await getClient()) as any;
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const textBlock = (res?.content ?? []).find((b: { type: string }) => b.type === "text");
  const text = (textBlock?.text ?? "").trim();
  if (!text) throw new Error("Claude returned empty response");
  const parsed = tryParseJson(text);
  if (!parsed) throw new Error(`Claude returned non-JSON: ${text.slice(0, 200)}`);
  return { subject: String(parsed.subject ?? ""), body: String(parsed.body ?? ""), raw: res };
}

function tryParseJson(s: string): { subject?: unknown; body?: unknown } | null {
  // Strip accidental code fences if Claude misbehaves.
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-resort: extract first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export function logClaudeUsage(label: string, raw: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (raw as any)?.usage;
  if (!u) return;
  log.info(
    `claude usage ${label}: in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} cache_create=${u.cache_creation_input_tokens ?? 0}`,
  );
}
