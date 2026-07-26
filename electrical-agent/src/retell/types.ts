import { z } from "zod";

/**
 * Retell Custom LLM WebSocket protocol.
 *
 * Field names below were verified against Retell's own published demo
 * type definitions (retell-custom-llm-node-demo/src/types.ts) and the
 * generated Retell SDK types.
 *
 * TODO(retell): re-check against docs.retellai.com/api-references/llm-websocket
 * when convenient - parsing here is deliberately tolerant so a payload
 * change degrades instead of dropping a live call.
 */

export const transcriptTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  content: z.string().default(""),
});

export const retellInboundEventSchema = z
  .object({
    interaction_type: z.enum([
      "call_details",
      "ping_pong",
      "update_only",
      "response_required",
      "reminder_required",
    ]),
    response_id: z.number().optional(),
    transcript: z.array(transcriptTurnSchema).optional(),
    call: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number().optional(),
  })
  .passthrough();

export type RetellInboundEvent = z.infer<typeof retellInboundEventSchema>;

export function configEvent() {
  return {
    response_type: "config",
    config: { auto_reconnect: true, call_details: true },
  };
}

export interface ResponseChunkOptions {
  /**
   * E.164 number to transfer to once this content has been spoken.
   *
   * Retell only performs a COLD (blind) transfer from a Custom LLM - there
   * is no warm transfer or handoff message on this path, so the agent must
   * announce the handoff itself before we send this.
   *
   * Attach it to the FIRST chunk of a response, not the final empty one:
   * transfers set on the closing chunk have been reported to be silently
   * dropped.
   */
  transferNumber?: string;
  /** Stops the caller talking over a line that triggers an action. */
  noInterruptionAllowed?: boolean;
  /** Hang up once this content has been spoken. */
  endCall?: boolean;
}

export function responseChunk(
  responseId: number,
  content: string,
  contentComplete: boolean,
  options: ResponseChunkOptions = {},
) {
  const payload: Record<string, unknown> = {
    response_type: "response",
    response_id: responseId,
    content,
    content_complete: contentComplete,
  };
  if (options.transferNumber) payload.transfer_number = options.transferNumber;
  if (options.noInterruptionAllowed) payload.no_interruption_allowed = true;
  if (options.endCall) payload.end_call = true;
  return payload;
}

export function pingPongEvent(timestamp?: number) {
  return { response_type: "ping_pong", timestamp: timestamp ?? Date.now() };
}

export const retellWebhookSchema = z
  .object({
    event: z.string(),
    call: z.object({ call_id: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export type RetellWebhookEvent = z.infer<typeof retellWebhookSchema>;
