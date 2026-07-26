import { config } from "../config.js";
import { isWithinWorkingHours } from "../scheduling/openingHours.js";

/**
 * Deciding when to put a caller through to the business owner.
 *
 * This runs instantly on the caller's own words - no API call, no added
 * latency - because an emergency must not wait for an extraction pass.
 * Detection is deliberately conservative: a false transfer sends a routine
 * caller to the owner's mobile, which is worse than a missed one.
 */

/** Hazards where the caller should be put through, not booked in. */
const EMERGENCY_PATTERN = new RegExp(
  [
    "\\bfire\\b",
    "\\bflames?\\b",
    "\\bsmoke\\b|\\bsmoking\\b",
    "burning smell|smell(?:s|ing)? (?:of |like )?burning|burnt smell",
    "\\bsparks?\\b|\\bsparking\\b|\\barcing\\b",
    "\\bexplod(?:ed|ing)\\b|\\bbang(?:ed|ing)?\\b.*\\b(?:fuse|board|socket|wire)",
    "electrocut(?:ed|ion)|electric shock|got a shock|had a shock|been shocked",
    "live wires?|exposed wires?|bare wires?",
    "water.*(?:fuse ?board|consumer unit|socket|electric)|(?:fuse ?board|consumer unit).*(?:water|leak|flood)",
    "melting|melted|scorch(?:ed|ing)?|burn(?:ed|t) out",
  ].join("|"),
  "i",
);

/** Caller explicitly asking for a human. */
const HUMAN_REQUEST_PATTERN = new RegExp(
  [
    "speak (?:to|with) (?:a |an )?(?:real )?(?:person|human|someone|somebody)",
    "talk (?:to|with) (?:a |an )?(?:real )?(?:person|human|someone|somebody)",
    "speak (?:to|with) (?:the )?(?:owner|boss|manager|electrician|engineer)",
    "put me through|transfer me|get me through",
    "is (?:there )?(?:a |any )?(?:real )?(?:person|human)",
    "are you (?:a )?(?:robot|bot|ai|computer|machine)",
  ].join("|"),
  "i",
);

export type TransferReason = "emergency" | "human_requested";

export interface TransferDecision {
  shouldTransfer: boolean;
  reason: TransferReason | null;
  /** False when we detected the need but cannot actually connect them. */
  canConnect: boolean;
}

export function detectTransferNeed(utterance: string): TransferDecision {
  const emergency = EMERGENCY_PATTERN.test(utterance);
  const humanRequested = HUMAN_REQUEST_PATTERN.test(utterance);

  if (!emergency && !humanRequested) {
    return { shouldTransfer: false, reason: null, canConnect: false };
  }

  const reason: TransferReason = emergency ? "emergency" : "human_requested";
  return { shouldTransfer: true, reason, canConnect: canConnectNow() };
}

/** Whether a live transfer is actually possible right now. */
export function canConnectNow(now: Date = new Date()): boolean {
  if (!config.ownerTransferNumber) return false;
  if (config.transferWorkingHoursOnly && !isWithinWorkingHours(now)) return false;
  return true;
}

/**
 * Turn-scoped instruction appended to the system prompt so the words the
 * agent speaks match the action the backend is about to take. Without
 * this the agent might carry on qualifying while the call is transferred.
 */
export function transferTurnInstruction(reason: TransferReason, canConnect: boolean): string {
  if (!canConnect) {
    return [
      "URGENT - CANNOT CONNECT:",
      reason === "emergency"
        ? "This is an emergency. Give the one most important safety instruction in a single short sentence."
        : "The caller has asked for a person.",
      `You cannot reach ${config.ownerName} right now. Do not promise to put them through.`,
      "Tell them you are getting an urgent message to him straight away, then ask for their name, number and the address with postcode if you do not already have them.",
    ].join(" ");
  }

  return [
    "TRANSFER IN PROGRESS - the call will be transferred the moment you finish speaking.",
    reason === "emergency"
      ? "This is an emergency. Give the single most important safety instruction in one short sentence first."
      : "The caller has asked to speak to a person.",
    `Then tell them plainly that you are putting them through to ${config.ownerName} now and to stay on the line.`,
    "Keep it to two short sentences. Do not ask any further questions - there is no time for another answer.",
  ].join(" ");
}
