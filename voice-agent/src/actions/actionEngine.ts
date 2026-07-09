import { logger } from "../logger.js";
import { extractLead } from "../extraction/extractor.js";
import {
  isBookable,
  isQualifiedLead,
  needsStaffAlert,
  type ExtractedLead,
} from "../extraction/leadSchema.js";
import {
  sendBookingRequestToMake,
  sendCallSummaryToMake,
  sendLeadToMake,
  sendStaffAlertToMake,
} from "../make/makeClient.js";
import { claimAction, getCall, markCallEnded, updateCall } from "../state/callStore.js";

/**
 * App-side action logic. Everything here runs OFF the caller-facing path:
 * fire-and-forget, never awaited by the WebSocket response loop.
 */

/** Run extraction at most every N user turns unless a keyword hit forces it. */
const EXTRACTION_TURN_INTERVAL = 3;

const STRUCTURED_INFO_PATTERN = new RegExp(
  [
    // contact details
    "\\d{4,}", // phone-number-ish digit runs
    "@", // emails
    "my name is",
    "i'?m called",
    "this is [A-Z]?[a-z]+",
    // treatments
    "invisalign",
    "whiten",
    "veneer",
    "implant",
    "hygienist",
    "check\\s?-?up",
    "braces",
    "filling",
    "crown",
    // intent / logistics
    "book",
    "appointment",
    "availab",
    "callback",
    "call me back",
    "receptionist|human|real person|speak to someone|member of staff",
    // urgency
    "pain|swollen|swelling|bleed|broken|knocked|emergency|agony",
    // scheduling
    "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
    "morning|afternoon|evening|next week|tomorrow|today",
    // price
    "price|cost|how much|finance|payment plan",
  ].join("|"),
  "i",
);

/** Heuristic: does this caller utterance likely contain structured info? */
export function likelyContainsStructuredInfo(utterance: string): boolean {
  return STRUCTURED_INFO_PATTERN.test(utterance);
}

/**
 * Called after each caller turn (fire-and-forget). Decides whether to run
 * extraction now based on cadence + keyword heuristics, then triggers any
 * newly-warranted Make actions.
 */
export async function onUserTurn(callId: string, utterance: string): Promise<void> {
  const call = getCall(callId);
  if (!call || call.callEndedAt) return;

  const turns = call.userTurnsSinceExtraction + 1;
  updateCall(callId, { userTurnsSinceExtraction: turns });

  const keywordHit = likelyContainsStructuredInfo(utterance);
  const cadenceDue = turns >= EXTRACTION_TURN_INTERVAL;
  if (!keywordHit && !cadenceDue) return;

  await runExtractionAndActions(callId, "turn");
}

/**
 * Called exactly once when the call ends (WS close or Retell call_ended
 * webhook - markCallEnded makes it idempotent). Runs a final extraction
 * and sends the call summary.
 */
export async function onCallEnded(callId: string, source: string): Promise<void> {
  const wasFirst = markCallEnded(callId);
  if (!wasFirst) return;

  logger.info({ callId, source }, "call ended - running final extraction");
  await runExtractionAndActions(callId, "call_end");

  const call = getCall(callId);
  if (!call) return;

  if (claimAction(callId, "summarySent")) {
    void sendCallSummaryToMake({
      callId,
      callStartedAt: call.callStartedAt,
      callEndedAt: call.callEndedAt,
      turnCount: call.transcript.length,
      lead: call.extractedLead,
      summary: call.extractedLead?.summary_for_staff ?? null,
    });
  }
}

/**
 * Runs extraction (guarded against overlap), merges the result into state,
 * and fires any Make actions that are now warranted and not yet sent.
 */
async function runExtractionAndActions(callId: string, trigger: "turn" | "call_end"): Promise<void> {
  const call = getCall(callId);
  if (!call || call.extractionInFlight) return;
  if (call.transcript.length === 0) return;

  updateCall(callId, { extractionInFlight: true, userTurnsSinceExtraction: 0 });
  try {
    const lead = await extractLead(callId, call.transcript);
    if (lead) {
      updateCall(callId, { extractedLead: lead });
      dispatchActions(callId, lead);
    }
  } finally {
    updateCall(callId, { extractionInFlight: false });
  }
  logger.debug({ callId, trigger }, "extraction pass complete");
}

/**
 * Gate every Make send on actionsTriggered via claimAction so nothing
 * fires more than once per callId. All sends are fire-and-forget.
 */
export function dispatchActions(callId: string, lead: ExtractedLead): void {
  if (isQualifiedLead(lead) && claimAction(callId, "leadSent")) {
    void sendLeadToMake({ callId, lead });
  }

  if (isBookable(lead) && claimAction(callId, "bookingSent")) {
    void sendBookingRequestToMake({
      callId,
      caller_name: lead.caller_name,
      caller_phone: lead.caller_phone,
      caller_email: lead.caller_email,
      treatment_interest: lead.treatment_interest,
      preferred_date: lead.preferred_date,
      preferred_time: lead.preferred_time,
      new_or_existing_patient: lead.new_or_existing_patient,
      clinic_location_requested: lead.clinic_location_requested,
      notes: lead.summary_for_staff,
    });
  }

  if (needsStaffAlert(lead) && claimAction(callId, "staffAlertSent")) {
    void sendStaffAlertToMake({
      callId,
      reason: lead.next_action,
      urgency: lead.urgency,
      caller_name: lead.caller_name,
      caller_phone: lead.caller_phone,
      pain_or_symptoms: lead.pain_or_symptoms,
      summary: lead.summary_for_staff,
    });
  }
}
