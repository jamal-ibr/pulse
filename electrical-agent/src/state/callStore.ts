import type { ExtractedJob } from "../extraction/jobSchema.js";
import type { TransferReason } from "../retell/transfer.js";

/**
 * In-memory per-call state.
 *
 * TODO(scale): replace with Redis (per-call hash keyed by callId with TTL)
 * or Postgres once running more than one instance. Every read/write goes
 * through this module, so the swap is contained here.
 */

export interface TranscriptTurn {
  role: "agent" | "user";
  content: string;
}

export interface ActionsTriggered {
  leadSent: boolean;
  bookingSent: boolean;
  urgentAlertSent: boolean;
  /** Outbound call placed to the owner (escalation fallback). */
  ownerCalled: boolean;
  summarySent: boolean;
}

export interface CallState {
  callId: string;
  transcript: TranscriptTurn[];
  extractedJob: ExtractedJob | null;
  actionsTriggered: ActionsTriggered;
  callStartedAt: string;
  callEndedAt: string | null;
  lastClaudeResponse: string;
  callDetails: Record<string, unknown> | null;
  userTurnsSinceExtraction: number;
  extractionInFlight: boolean;
  availabilityContext: string | null;

  /**
   * Latest caller utterance we have already evaluated. Retell streams
   * partial transcripts, so a turn's text grows in place - we must
   * re-check on every content change, not only on a new turn.
   */
  lastUserUtterance: string;

  /** Set when a transfer is warranted but not yet spoken/executed. */
  pendingTransferReason: TransferReason | null;
  /**
   * "collecting_address" - emergency spotted, get the address first so the
   * alert is actionable; "ready" - transfer on the next response.
   */
  transferStage: "collecting_address" | "ready" | null;
  /** Set once transfer_number has actually been sent to Retell. */
  transferInitiatedAt: string | null;
  /** True when the caller came back after a transfer attempt (it failed). */
  transferFailed: boolean;
}

const calls = new Map<string, CallState>();
const FINISHED_CALL_TTL_MS = 30 * 60 * 1000;

function newCallState(callId: string): CallState {
  return {
    callId,
    transcript: [],
    extractedJob: null,
    actionsTriggered: {
      leadSent: false,
      bookingSent: false,
      urgentAlertSent: false,
      ownerCalled: false,
      summarySent: false,
    },
    callStartedAt: new Date().toISOString(),
    callEndedAt: null,
    lastClaudeResponse: "",
    callDetails: null,
    userTurnsSinceExtraction: 0,
    extractionInFlight: false,
    availabilityContext: null,
    lastUserUtterance: "",
    pendingTransferReason: null,
    transferStage: null,
    transferInitiatedAt: null,
    transferFailed: false,
  };
}

export function getOrCreateCall(callId: string): CallState {
  const existing = calls.get(callId);
  if (existing) return existing;
  const fresh = newCallState(callId);
  calls.set(callId, fresh);
  return fresh;
}

export function getCall(callId: string): CallState | undefined {
  return calls.get(callId);
}

/** Immutable-style update: replaces the stored state with a patched copy. */
export function updateCall(callId: string, patch: Partial<CallState>): CallState {
  const current = getOrCreateCall(callId);
  const next = { ...current, ...patch };
  calls.set(callId, next);
  return next;
}

export function markCallEnded(callId: string): boolean {
  const current = getCall(callId);
  if (!current || current.callEndedAt !== null) return false;
  updateCall(callId, { callEndedAt: new Date().toISOString() });
  const timer = setTimeout(() => calls.delete(callId), FINISHED_CALL_TTL_MS);
  timer.unref?.();
  return true;
}

/** Atomically claim a one-shot action so it can never fire twice per call. */
export function claimAction(callId: string, action: keyof ActionsTriggered): boolean {
  const current = getOrCreateCall(callId);
  if (current.actionsTriggered[action]) return false;
  updateCall(callId, {
    actionsTriggered: { ...current.actionsTriggered, [action]: true },
  });
  return true;
}

export function resetStore(): void {
  calls.clear();
}
