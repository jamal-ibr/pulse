import type { WebSocket } from "ws";
import { logger, preview } from "../logger.js";
import { streamReply } from "../claude/claudeService.js";
import { BEGIN_GREETING } from "../claude/systemPrompt.js";
import { onCallEnded, onUserTurn } from "../actions/actionEngine.js";
import { getOrCreateCall, updateCall } from "../state/callStore.js";
import type { TranscriptTurn } from "../state/callStore.js";
import {
  configEvent,
  pingPongEvent,
  responseChunk,
  retellInboundEventSchema,
} from "./types.js";

/**
 * Per-connection handler for Retell's Custom LLM WebSocket
 * (wss://<host>/retell/llm/:callId).
 *
 * Latency rules:
 * - The ONLY awaited work on this path is the Claude stream itself.
 * - Extraction and Make webhooks are fire-and-forget (actionEngine).
 * - Claude deltas are forwarded to Retell as they arrive (streaming),
 *   minimising time-to-first-audio.
 */
export function handleRetellConnection(ws: WebSocket, callId: string): void {
  logger.info({ callId }, "retell websocket opened");
  getOrCreateCall(callId);

  // Track the newest response_id; when Retell asks for a newer response
  // (caller interrupted), abort the in-flight Claude stream.
  let activeResponseId = -1;
  let abortController: AbortController | null = null;

  const send = (payload: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  send(configEvent());

  ws.on("message", (raw) => {
    let event;
    try {
      event = retellInboundEventSchema.parse(JSON.parse(raw.toString()));
    } catch (err) {
      logger.warn({ callId, err: (err as Error).message }, "unparseable retell event ignored");
      return;
    }

    logger.debug({ callId, interactionType: event.interaction_type }, "retell event");

    switch (event.interaction_type) {
      case "ping_pong":
        send(pingPongEvent(event.timestamp));
        return;

      case "call_details":
        updateCall(callId, { callDetails: event.call ?? null });
        // Agent speaks first. Custom LLM hands the opening line to the
        // backend, so emit the greeting the instant the call connects.
        // Fixed text = no Claude round-trip = zero delay on the opener.
        // Claim response_id 0 so a duplicate begin prompt can't double-greet;
        // real caller turns arrive with higher ids and supersede normally.
        if (activeResponseId < 0) {
          activeResponseId = 0;
          send(responseChunk(0, BEGIN_GREETING, true));
          updateCall(callId, { transcript: [{ role: "agent", content: BEGIN_GREETING }] });
          logger.info({ callId }, "sent begin greeting");
        }
        return;

      case "update_only":
        if (event.transcript) syncTranscript(callId, event.transcript);
        return;

      case "response_required":
      case "reminder_required": {
        const responseId = event.response_id ?? 0;
        if (event.transcript) syncTranscript(callId, event.transcript);

        // Interruption handling: newer turn supersedes any in-flight reply.
        if (responseId <= activeResponseId) return;
        activeResponseId = responseId;
        abortController?.abort();
        abortController = new AbortController();

        void respond(responseId, event.interaction_type === "reminder_required", abortController.signal);
        return;
      }
    }
  });

  ws.on("close", () => {
    logger.info({ callId }, "retell websocket closed");
    abortController?.abort();
    void onCallEnded(callId, "websocket_close");
  });

  ws.on("error", (err) => {
    logger.error({ callId, err }, "retell websocket error");
  });

  async function respond(responseId: number, isReminder: boolean, signal: AbortSignal): Promise<void> {
    const call = getOrCreateCall(callId);
    const startedAt = Date.now();
    let firstDeltaLogged = false;

    const full = await streamReply({
      callId,
      transcript: call.transcript,
      isReminder,
      signal,
      onDelta: (delta) => {
        if (signal.aborted || responseId !== activeResponseId) return;
        if (!firstDeltaLogged) {
          firstDeltaLogged = true;
          logger.info({ callId, responseId, ttfbMs: Date.now() - startedAt }, "first token sent");
        }
        send(responseChunk(responseId, delta, false));
      },
    });

    if (signal.aborted || responseId !== activeResponseId) return;

    // Final chunk marks the response complete for Retell.
    send(responseChunk(responseId, "", true));
    updateCall(callId, { lastClaudeResponse: full });
    logger.debug({ callId, responseId, reply: preview(full) }, "response complete");
  }
}

/**
 * Retell sends the full transcript on each event; treat it as the source
 * of truth. Fires action-engine processing when a new caller turn lands.
 */
function syncTranscript(callId: string, transcript: TranscriptTurn[]): void {
  const call = getOrCreateCall(callId);
  const previousUserTurns = call.transcript.filter((t) => t.role === "user").length;
  updateCall(callId, { transcript });

  const userTurns = transcript.filter((t) => t.role === "user");
  if (userTurns.length > previousUserTurns) {
    const latest = userTurns[userTurns.length - 1];
    // Fire-and-forget: never blocks the response path.
    void onUserTurn(callId, latest.content);
  }
}
