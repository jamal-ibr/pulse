import type { WebSocket } from "ws";
import { config } from "../config.js";
import { logger, preview } from "../logger.js";
import { streamReply } from "../claude/claudeService.js";
import { BEGIN_GREETING } from "../claude/systemPrompt.js";
import { onCallEnded, onTransferAttempted, onUserTurn } from "../actions/actionEngine.js";
import { getOrCreateCall, updateCall } from "../state/callStore.js";
import type { TranscriptTurn } from "../state/callStore.js";
import { loadAvailability } from "../scheduling/availability.js";
import { detectTransferNeed, transferTurnInstruction } from "./transfer.js";
import { configEvent, pingPongEvent, responseChunk, retellInboundEventSchema } from "./types.js";

/**
 * Per-connection handler for Retell's Custom LLM WebSocket
 * (wss://<host>/retell/llm/:callId).
 *
 * Latency rules:
 * - The ONLY awaited work on this path is the Claude stream itself.
 * - Extraction, availability and webhooks are fire-and-forget.
 * - Claude deltas are forwarded as they arrive, minimising time-to-first-audio.
 */
export function handleRetellConnection(ws: WebSocket, callId: string): void {
  logger.info({ callId }, "retell websocket opened");
  getOrCreateCall(callId);

  let activeResponseId = -1;
  let abortController: AbortController | null = null;

  const send = (payload: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  send(configEvent());

  // Look up the diary in the background. The fixed greeting and the
  // caller's opening sentence buy several seconds, and this never blocks
  // the response path.
  void loadAvailability(callId).then((snapshot) => {
    updateCall(callId, { availabilityContext: snapshot.promptContext });
  });

  ws.on("message", (raw) => {
    let event;
    try {
      event = retellInboundEventSchema.parse(JSON.parse(raw.toString()));
    } catch (err) {
      logger.warn({ callId, err: (err as Error).message }, "unparseable retell event ignored");
      return;
    }

    switch (event.interaction_type) {
      case "ping_pong":
        send(pingPongEvent(event.timestamp));
        return;

      case "call_details":
        updateCall(callId, { callDetails: event.call ?? null });
        // Agent speaks first: Custom LLM hands the opening line to the
        // backend. Fixed text = no Claude round-trip = zero delay.
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

        // If we already fired a transfer and Retell is still asking us for
        // responses, the transfer did not connect. Recover rather than
        // leaving the caller with dead air.
        const current = getOrCreateCall(callId);
        if (current.transferInitiatedAt && !current.transferFailed) {
          logger.warn({ callId }, "transfer did not connect - recovering call");
          updateCall(callId, { transferFailed: true, pendingTransferReason: null });
          void onTransferAttempted(callId, "failed");
        }

        if (responseId <= activeResponseId) return;
        activeResponseId = responseId;
        abortController?.abort();
        abortController = new AbortController();

        void respond(
          responseId,
          event.interaction_type === "reminder_required",
          abortController.signal,
        );
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

  async function respond(
    responseId: number,
    isReminder: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const call = getOrCreateCall(callId);
    const startedAt = Date.now();
    let firstDeltaLogged = false;

    // A transfer flagged on the last caller turn is executed on THIS
    // response: the agent announces the handoff, then Retell transfers
    // once the line has been fully spoken.
    const reason = call.pendingTransferReason;
    const canConnect = Boolean(reason) && Boolean(config.ownerTransferNumber) && !call.transferFailed;
    const turnInstruction = reason ? transferTurnInstruction(reason, canConnect) : null;

    // Attach transfer_number to the FIRST chunk, never the closing one -
    // transfers set on the final chunk have been reported to be dropped.
    let transferPending = canConnect;

    const full = await streamReply({
      callId,
      transcript: call.transcript,
      isReminder,
      availabilityContext: call.availabilityContext,
      turnInstruction,
      signal,
      onDelta: (delta) => {
        if (signal.aborted || responseId !== activeResponseId) return;
        if (!firstDeltaLogged) {
          firstDeltaLogged = true;
          logger.info({ callId, responseId, ttfbMs: Date.now() - startedAt }, "first token sent");
        }
        if (transferPending) {
          transferPending = false;
          send(
            responseChunk(responseId, delta, false, {
              transferNumber: config.ownerTransferNumber,
              noInterruptionAllowed: true,
            }),
          );
          updateCall(callId, {
            transferInitiatedAt: new Date().toISOString(),
            pendingTransferReason: null,
          });
          logger.info({ callId, reason }, "transfer initiated");
          void onTransferAttempted(callId, "initiated");
          return;
        }
        send(responseChunk(responseId, delta, false));
      },
    });

    if (signal.aborted || responseId !== activeResponseId) return;

    send(responseChunk(responseId, "", true));
    updateCall(callId, { lastClaudeResponse: full });

    // Nothing was streamed (e.g. the model errored) but a transfer was due:
    // clear the flag so we don't strand the caller waiting for a handoff.
    if (transferPending) {
      updateCall(callId, { pendingTransferReason: null });
    }
    logger.debug({ callId, responseId, reply: preview(full) }, "response complete");
  }
}

/**
 * Retell sends the full transcript on each event; treat it as the source
 * of truth. New caller turns drive transfer detection and the action engine.
 */
function syncTranscript(callId: string, transcript: TranscriptTurn[]): void {
  const call = getOrCreateCall(callId);
  const previousUserTurns = call.transcript.filter((t) => t.role === "user").length;
  updateCall(callId, { transcript });

  const userTurns = transcript.filter((t) => t.role === "user");
  if (userTurns.length <= previousUserTurns) return;

  const latest = userTurns[userTurns.length - 1];

  // Instant, no-API transfer triage so an emergency never waits for an
  // extraction pass. Only ever arm it once per call.
  if (!call.transferInitiatedAt && !call.pendingTransferReason && !call.transferFailed) {
    const decision = detectTransferNeed(latest.content);
    if (decision.shouldTransfer && decision.reason) {
      logger.info(
        { callId, reason: decision.reason, canConnect: decision.canConnect },
        "transfer flagged",
      );
      updateCall(callId, { pendingTransferReason: decision.reason });
      // Get the details to the owner immediately, whether or not the live
      // transfer connects.
      void onTransferAttempted(callId, "flagged");
    }
  }

  void onUserTurn(callId, latest.content);
}
