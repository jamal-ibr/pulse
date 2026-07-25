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
import { SLOT_MINUTES } from "../scheduling/openingHours.js";

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
    const lead = await extractLead(callId, call.transcript, call.availabilityContext);
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
 * Retell tells us the number the caller rang from in the call_details
 * event. Use it as the fallback contact number so the clinic always has
 * someone to ring back, even when the caller never states a number.
 */
export function readCallerId(callDetails: Record<string, unknown> | null): string | null {
  if (!callDetails) return null;
  // TODO(retell): confirm the field name - observed as from_number.
  const candidates = ["from_number", "from", "caller_number"];
  for (const key of candidates) {
    const value = callDetails[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Gate every webhook send on actionsTriggered via claimAction so nothing
 * fires more than once per callId. All sends are fire-and-forget.
 */
export function dispatchActions(callId: string, lead: ExtractedLead): void {
  const call = getCall(callId);
  const callerId = readCallerId(call?.callDetails ?? null);

  // Fall back to the caller ID for the phone number so payloads are never
  // left with a blank contact. Keep the raw lead for the "have they
  // actually given us details yet?" decision below.
  const enriched: ExtractedLead = { ...lead, caller_phone: lead.caller_phone ?? callerId };

  if (isQualifiedLead(enriched) && claimAction(callId, "leadSent")) {
    void sendLeadToMake({ callId, lead: enriched });
  }

  if (isBookable(enriched) && claimAction(callId, "bookingSent")) {
    void sendBookingRequestToMake({
      callId,
      caller_name: enriched.caller_name,
      caller_phone: enriched.caller_phone,
      caller_email: enriched.caller_email,
      treatment_interest: enriched.treatment_interest,
      preferred_date: enriched.preferred_date,
      preferred_time: enriched.preferred_time,
      // Set when the agent confirmed a real diary slot. n8n should create
      // the calendar event at this exact time; fall back to the free-text
      // preference only when it is null.
      confirmed_start: enriched.confirmed_slot_iso,
      confirmed_end: enriched.confirmed_slot_iso
        ? new Date(new Date(enriched.confirmed_slot_iso).getTime() + SLOT_MINUTES * 60_000).toISOString()
        : null,
      is_confirmed: Boolean(enriched.confirmed_slot_iso),
      new_or_existing_patient: enriched.new_or_existing_patient,
      clinic_location_requested: enriched.clinic_location_requested,
      notes: enriched.summary_for_staff,
    });
  }

  // Staff notification now fires for EVERY call, not just emergencies and
  // callbacks - but it waits until the call is actually worth reporting:
  //   - the caller has given contact details (phone or email), or
  //   - it is urgent (emergency/handover/callback - report immediately,
  //     even with no details, because they may hang up), or
  //   - the call has ended (last chance: report it with whatever we have,
  //     so no call ever goes unreported).
  const detailsCaptured = Boolean(lead.caller_phone || lead.caller_email);
  const urgent = needsStaffAlert(lead);
  const callOver = Boolean(call?.callEndedAt);

  if ((detailsCaptured || urgent || callOver) && claimAction(callId, "staffAlertSent")) {
    void sendStaffAlertToMake({
      callId,
      reason: enriched.next_action,
      urgency: enriched.urgency,
      is_urgent: urgent,
      caller_name: enriched.caller_name,
      caller_phone: enriched.caller_phone,
      caller_email: enriched.caller_email,
      treatment_interest: enriched.treatment_interest,
      preferred_date: enriched.preferred_date,
      preferred_time: enriched.preferred_time,
      new_or_existing_patient: enriched.new_or_existing_patient,
      pain_or_symptoms: enriched.pain_or_symptoms,
      summary: enriched.summary_for_staff,
    });
  }
}
