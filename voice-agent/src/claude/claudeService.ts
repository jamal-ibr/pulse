import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { logger, preview } from "../logger.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import type { TranscriptTurn } from "../state/callStore.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Hard cap on reply length - a safeguard against rambling on a voice line.
 * ~250 tokens is roughly 45 seconds of speech, well above a normal turn.
 */
const MAX_REPLY_TOKENS = 250;

/**
 * Convert a Retell transcript into Claude-compatible messages.
 * Retell roles: "agent" (our AI) -> assistant, "user" (caller) -> user.
 * The Messages API requires the first message to be from the user, so a
 * leading agent greeting gets a synthetic user opener prepended.
 */
export function transcriptToMessages(transcript: TranscriptTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = transcript
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: turn.content.trim(),
    }));

  if (messages.length === 0 || messages[0].role === "assistant") {
    messages.unshift({ role: "user", content: "(The call has just connected.)" });
  }
  // Claude must respond next, so the last message must be a user turn.
  if (messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: "(The caller is waiting for you to continue.)" });
  }
  return messages;
}

export interface StreamReplyOptions {
  callId: string;
  transcript: TranscriptTurn[];
  /** Set for reminder_required: nudges the model to gently re-engage. */
  isReminder?: boolean;
  signal?: AbortSignal;
  /** Called with each text delta as it streams from Claude. */
  onDelta: (text: string) => void;
}

/**
 * Stream a conversational reply. Resolves with the full reply text.
 * Errors resolve with a safe fallback line instead of throwing, so the
 * caller-facing path never crashes mid-call.
 */
export async function streamReply(options: StreamReplyOptions): Promise<string> {
  const { callId, transcript, isReminder, signal, onDelta } = options;
  const messages = transcriptToMessages(transcript);

  if (isReminder) {
    messages.push({
      role: "user",
      content:
        "(The caller has gone quiet. Gently check they are still there and repeat your last question briefly.)",
    });
  }

  try {
    const stream = client.messages.stream(
      {
        model: config.claudeModel,
        max_tokens: MAX_REPLY_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      },
      { signal },
    );

    let full = "";
    stream.on("text", (delta) => {
      full += delta;
      onDelta(delta);
    });

    await stream.finalMessage();
    logger.debug({ callId, reply: preview(full) }, "claude reply complete");
    return full;
  } catch (err) {
    if (signal?.aborted) {
      logger.debug({ callId }, "claude stream aborted (superseded by newer turn)");
      return "";
    }
    logger.error({ callId, err }, "claude conversation call failed");
    const fallback =
      "Sorry, I didn't quite catch that. Could you say that again for me, please?";
    onDelta(fallback);
    return fallback;
  }
}

/** Shared Anthropic client for other modules (extraction). */
export { client as anthropicClient };
