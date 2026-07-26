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

/**
 * Hazards where the caller should be put through, not booked in.
 *
 * Written against SPEECH-TO-TEXT output, not clean prose. Transcription
 * regularly mangles the exact words a caller uses - a live call came
 * through as "sparkling" rather than "sparking" and slipped past an
 * earlier, tighter pattern - so stems are deliberately loose.
 */
const EMERGENCY_PATTERN = new RegExp(
  [
    "\\bfire\\b|\\bflames?\\b|\\bsmoke\\b|\\bsmoking\\b|\\bsmouldering\\b",
    // spark / sparks / sparking / sparkle / sparkling (common mishearing)
    "\\bspark\\w*|\\barc(?:s|ing|ed)?\\b|\\bcrackl\\w*|\\bbuzz\\w*|\\bpopping\\b|\\bfizz\\w*",
    "burn\\w* smell|smell\\w* (?:of |like )?burn\\w*|burnt smell|smells? hot",
    "\\bexplod\\w*|\\bbang\\w*\\b.{0,20}\\b(?:fuse|board|socket|wire)",
    "electrocut\\w*|electric shock|got a shock|had a shock|been shocked|shocked me",
    "live wires?|exposed wires?|bare wires?|wires?\\s+(?:are\\s+|is\\s+)?(?:hanging|showing|sticking|out\\b)",
    "water.{0,40}(?:fuse ?bo(?:ard|x)|consumer unit|socket|electric)",
    "(?:fuse ?bo(?:ard|x)|consumer unit).{0,40}(?:water|leak|flood|damp)",
    "melt\\w*|scorch\\w*|burn(?:ed|t) out|too hot to touch|red hot",
  ].join("|"),
  "i",
);

/**
 * Words that flip the meaning of a hazard mention. "There's no burning or
 * smoke" must not escalate, but "no power, and it's sparking" must.
 */
const NEGATION_WINDOW = 28;
const NEGATION_PATTERN = /\b(?:no|not|isn'?t|aren'?t|wasn'?t|without|nothing|never|hasn'?t|don'?t)\b/i;

/** True when this specific match is preceded by a negation. */
function isNegated(utterance: string, matchIndex: number): boolean {
  const before = utterance.slice(Math.max(0, matchIndex - NEGATION_WINDOW), matchIndex);
  // A clause break resets the negation: "no smoke, but it's sparking".
  const lastClause = before.split(/[,;.]|\bbut\b|\bthough\b/i).pop() ?? before;
  return NEGATION_PATTERN.test(lastClause);
}

/** Any non-negated hazard mention in the utterance. */
function hasUnnegatedHazard(utterance: string): boolean {
  const pattern = new RegExp(EMERGENCY_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(utterance)) !== null) {
    if (!isNegated(utterance, match.index)) return true;
  }
  return false;
}

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

/**
 * Rough check for whether the caller has already given us somewhere to
 * send an engineer. Used to skip the "what's the address?" step when they
 * volunteered it up front, so an emergency transfers a turn sooner.
 */
const ADDRESS_PATTERN = new RegExp(
  [
    "\\b[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}\\b", // written postcode, e.g. B8 3JF
    "\\b\\d+[a-z]?\\s+\\w+\\s+(road|street|avenue|lane|close|drive|way|court|crescent|terrace|gardens)\\b",
  ].join("|"),
  "i",
);

export function mentionsAddress(utterance: string): boolean {
  return ADDRESS_PATTERN.test(utterance);
}

export interface TransferDecision {
  shouldTransfer: boolean;
  reason: TransferReason | null;
  /** False when we detected the need but cannot actually connect them. */
  canConnect: boolean;
}

export function detectTransferNeed(utterance: string): TransferDecision {
  const emergency = hasUnnegatedHazard(utterance);
  const humanRequested = HUMAN_REQUEST_PATTERN.test(utterance);

  if (!emergency && !humanRequested) {
    return { shouldTransfer: false, reason: null, canConnect: false };
  }

  const reason: TransferReason = emergency ? "emergency" : "human_requested";
  return { shouldTransfer: true, reason, canConnect: canConnectNow(reason) };
}

/**
 * Whether a live transfer is actually possible right now.
 *
 * Emergencies ignore the working-hours restriction entirely. A burning
 * smell at 9pm on a Sunday is precisely when the owner most needs the
 * call - gating that behind office hours defeats the purpose.
 */
export function canConnectNow(
  reason: TransferReason = "emergency",
  now: Date = new Date(),
): boolean {
  if (!config.ownerTransferNumber) return false;
  if (reason === "emergency") return true;
  if (config.transferWorkingHoursOnly && !isWithinWorkingHours(now)) return false;
  return true;
}

/**
 * Turn-scoped instruction appended to the system prompt so the words the
 * agent speaks match the action the backend is about to take. Without
 * this the agent might carry on qualifying while the call is transferred.
 */
/**
 * Spoken while we get the one detail that makes an emergency alert
 * actionable. Kept to a single question so the caller is put through fast.
 */
export function collectAddressInstruction(): string {
  return [
    "EMERGENCY - ESCALATING NOW.",
    "Give the single most important safety instruction in one short sentence.",
    "Then ask ONLY for the address and postcode. Ask nothing else - not their name, not their number, not when someone is home.",
    `You will be putting them through to ${config.ownerName} on the very next turn, so do not offer to book anything and do not say the office will ring back.`,
  ].join(" ");
}

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
      ? "This is an emergency. If they have just given an address, repeat it back in a few words to confirm it."
      : "The caller has asked to speak to a person.",
    `Then tell them plainly that you are putting them through to ${config.ownerName} now and to stay on the line.`,
    "Keep it to two short sentences. Ask no further questions - there is no time for another answer, and do not say the office will ring back.",
  ].join(" ");
}
