import type { ExtractedLead } from "../extraction/leadSchema.js";

/**
 * In-memory per-call state.
 *
 * TODO(scale): replace with Redis (per-call hash keyed by callId with TTL)
 * or Postgres once running more than one server instance. Every read/write
 * below goes through this module, so the swap is contained here.
 */

export interface TranscriptTurn {
  role: "agent" | "user";
  content: string;
}

export interface ActionsTriggered {
  leadSent: boolean;
  bookingSent: boolean;
  staffAlertSent: boolean;
  summarySent: boolean;
}

export interface CallState {
  callId: string;
  transcript: TranscriptTurn[];
  extractedLead: ExtractedLead | null;
  actionsTriggered: ActionsTriggered;
  callStartedAt: string;
  callEndedAt: string | null;
  lastClaudeResponse: string;
  /** Retell call metadata from the call_details event (from_number, etc.). */
  callDetails: Record<string, unknown> | null;
  /** Number of user turns since the last extraction ran (extraction cadence). */
  userTurnsSinceExtraction: number;
  /** Guards against overlapping extraction calls for the same call. */
  extractionInFlight: boolean;
}

const calls = new Map<string, CallState>();

/** Evict finished calls after this long so memory doesn't grow unbounded. */
const FINISHED_CALL_TTL_MS = 30 * 60 * 1000;

function newCallState(callId: string): CallState {
  return {
    callId,
    transcript: [],
    extractedLead: null,
    actionsTriggered: {
      leadSent: false,
      bookingSent: false,
      staffAlertSent: false,
      summarySent: false,
    },
    callStartedAt: new Date().toISOString(),
    callEndedAt: null,
    lastClaudeResponse: "",
    callDetails: null,
    userTurnsSinceExtraction: 0,
    extractionInFlight: false,
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

/** Marks a call ended (idempotent) and schedules eviction. Returns true on first call. */
export function markCallEnded(callId: string): boolean {
  const current = getCall(callId);
  if (!current || current.callEndedAt !== null) return false;
  updateCall(callId, { callEndedAt: new Date().toISOString() });
  const timer = setTimeout(() => calls.delete(callId), FINISHED_CALL_TTL_MS);
  timer.unref?.();
  return true;
}

/**
 * Atomically claim a one-shot action so it can never fire twice per call.
 * Returns true if this caller won the claim.
 */
export function claimAction(callId: string, action: keyof ActionsTriggered): boolean {
  const current = getOrCreateCall(callId);
  if (current.actionsTriggered[action]) return false;
  updateCall(callId, {
    actionsTriggered: { ...current.actionsTriggered, [action]: true },
  });
  return true;
}

/** Test helper. */
export function resetStore(): void {
  calls.clear();
}
