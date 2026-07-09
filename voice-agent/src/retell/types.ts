import { z } from "zod";

/**
 * Retell Custom LLM WebSocket protocol types.
 *
 * TODO(retell): verify these shapes against the current Retell Custom LLM
 * docs (https://docs.retellai.com -> Custom LLM). Parsing below is
 * deliberately loose (passthrough + optional fields) so minor payload
 * changes degrade gracefully instead of crashing a live call.
 */

export const transcriptTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  content: z.string().default(""),
});

/** One event arriving from Retell over the Custom LLM WebSocket. */
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

/** Config event we send right after the socket opens. */
export function configEvent() {
  return {
    response_type: "config",
    config: {
      auto_reconnect: true,
      call_details: true,
    },
  };
}

/**
 * Streaming response chunk back to Retell.
 * TODO(retell): confirm the exact streaming event format (field names below
 * follow the documented {response_type, response_id, content,
 * content_complete, end_call} shape).
 */
export function responseChunk(
  responseId: number,
  content: string,
  contentComplete: boolean,
  endCall = false,
) {
  return {
    response_type: "response",
    response_id: responseId,
    content,
    content_complete: contentComplete,
    end_call: endCall,
  };
}

export function pingPongEvent(timestamp?: number) {
  return { response_type: "ping_pong", timestamp: timestamp ?? Date.now() };
}

/** Retell call-events webhook body (POST /retell/webhook). */
export const retellWebhookSchema = z
  .object({
    event: z.string(),
    call: z
      .object({
        call_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type RetellWebhookEvent = z.infer<typeof retellWebhookSchema>;
