import { logger } from "../logger.js";
import { extractJob } from "../extraction/extractor.js";
import {
  isDispatchable,
  isEmergency,
  isQualifiedLead,
  type ExtractedJob,
} from "../extraction/jobSchema.js";
import {
  sendCallSummary,
  sendJobBooking,
  sendLead,
  sendUrgentAlert,
} from "../workflows/workflowClient.js";
import { claimAction, getCall, markCallEnded, updateCall } from "../state/callStore.js";
import { callOwnerWithBriefing } from "../retell/outboundCall.js";

/**
 * App-side action logic. Everything here runs OFF the caller-facing path:
 * fire-and-forget, never awaited by the WebSocket response loop.
 */

/** Run extraction at most every N caller turns unless a keyword forces it. */
const EXTRACTION_TURN_INTERVAL = 3;

/** Arrival windows are half-day, so a booked job blocks a 4-hour block. */
const DEFAULT_JOB_DURATION_MS = 4 * 60 * 60_000;

const STRUCTURED_INFO_PATTERN = new RegExp(
  [
    "\\d{4,}", // phone numbers, house numbers
    "@", // emails
    "[A-Z]{1,2}\\d{1,2}[A-Z]?\\s*\\d[A-Z]{2}", // UK postcode
    "my name is|i'?m called|this is ",
    "road|street|avenue|lane|close|drive|way|court|crescent|postcode|address|flat|house number",
    // job types
    "fuse ?board|consumer unit|rewire|rewiring|eicr|certificate|landlord",
    "ev charger|car charger|charging point",
    "socket|light(?:ing|s)?|switch|spotlight|downlight",
    "smoke alarm|pat test|test(?:ing)? (?:the )?(?:appliance|equipment)",
    "trip(?:ping|ped)?|breaker|rcd|fuse|power|electric",
    // logistics
    "book|appointment|visit|come out|call ?out|available|when can",
    "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
    "morning|afternoon|evening|next week|tomorrow|today",
    "quote|price|cost|how much|charge",
    "landlord|tenant|letting agent|rental|commercial|shop|office",
  ].join("|"),
  "i",
);

export function likelyContainsStructuredInfo(utterance: string): boolean {
  return STRUCTURED_INFO_PATTERN.test(utterance);
}

/**
 * Called after each caller turn (fire-and-forget). Decides whether to run
 * extraction now, then triggers any newly-warranted workflow actions.
 */
export async function onUserTurn(callId: string, utterance: string): Promise<void> {
  const call = getCall(callId);
  if (!call || call.callEndedAt) return;

  const turns = call.userTurnsSinceExtraction + 1;
  updateCall(callId, { userTurnsSinceExtraction: turns });

  if (!likelyContainsStructuredInfo(utterance) && turns < EXTRACTION_TURN_INTERVAL) return;
  await runExtractionAndActions(callId, "turn");
}

/**
 * Called when a transfer is flagged, initiated, or has failed.
 *
 * The urgent alert fires as soon as a transfer is FLAGGED, not after it
 * succeeds - if the owner misses the call he still gets the address and
 * the fault on his phone. Claim-gated, so it sends once per call however
 * many times this is called.
 */
export async function onTransferAttempted(
  callId: string,
  stage: "flagged" | "initiated" | "failed" | "unavailable",
): Promise<void> {
  const call = getCall(callId);
  if (!call) return;

  logger.info({ callId, stage }, "transfer stage");

  // Make sure the alert carries whatever detail we have so far.
  if (stage === "flagged" && !call.extractionInFlight && call.transcript.length > 0) {
    await runExtractionAndActions(callId, "transfer");
    return;
  }

  const job = getCall(callId)?.extractedJob ?? null;
  fireUrgentAlert(callId, job, stage);

  // The live bridge did not connect. Ring the owner directly so the
  // escalation still lands on his phone rather than only in his inbox.
  if (stage === "failed" || stage === "unavailable") {
    ringOwnerDirectly(callId, job);
  }
}

/** Outbound call to the owner - claim-gated so he is rung at most once. */
export function ringOwnerDirectly(callId: string, job: ExtractedJob | null): void {
  if (!claimAction(callId, "ownerCalled")) return;
  logger.info({ callId }, "ringing owner directly (outbound escalation)");
  const call = getCall(callId);
  void callOwnerWithBriefing({
    callId,
    job,
    callerNumber: job?.caller_phone ?? readCallerId(call?.callDetails ?? null),
  });
}

/**
 * Called exactly once when the call ends. Runs a final extraction and
 * sends the call summary.
 */
export async function onCallEnded(callId: string, source: string): Promise<void> {
  if (!markCallEnded(callId)) return;

  logger.info({ callId, source }, "call ended - running final extraction");
  await runExtractionAndActions(callId, "call_end");

  const call = getCall(callId);
  if (!call) return;

  if (claimAction(callId, "summarySent")) {
    void sendCallSummary({
      callId,
      callStartedAt: call.callStartedAt,
      callEndedAt: call.callEndedAt,
      turnCount: call.transcript.length,
      transferAttempted: Boolean(call.transferInitiatedAt),
      transferFailed: call.transferFailed,
      job: call.extractedJob,
      summary: call.extractedJob?.summary_for_office ?? null,
    });
  }
}

async function runExtractionAndActions(
  callId: string,
  trigger: "turn" | "transfer" | "call_end",
): Promise<void> {
  const call = getCall(callId);
  if (!call || call.extractionInFlight || call.transcript.length === 0) return;

  updateCall(callId, { extractionInFlight: true, userTurnsSinceExtraction: 0 });
  try {
    const job = await extractJob(callId, call.transcript, call.availabilityContext);
    if (job) {
      updateCall(callId, { extractedJob: job });
      dispatchActions(callId, job);
    }
  } finally {
    updateCall(callId, { extractionInFlight: false });
  }
  logger.debug({ callId, trigger }, "extraction pass complete");
}

/**
 * Retell tells us the number the caller rang from in the call_details
 * event. Use it as the fallback contact number so the office always has
 * someone to ring back.
 */
export function readCallerId(callDetails: Record<string, unknown> | null): string | null {
  if (!callDetails) return null;
  // TODO(retell): confirm the field name - observed as from_number.
  for (const key of ["from_number", "from", "caller_number"]) {
    const value = callDetails[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Send the office an urgent alert - once per call.
 *
 * Held back until it is actually actionable: an alert with no address is
 * nearly useless to an engineer. It goes the moment we have an address,
 * the transfer fires, or the call ends - whichever comes first, so nothing
 * is ever lost.
 */
function fireUrgentAlert(callId: string, job: ExtractedJob | null, stage: string): void {
  const pending = getCall(callId);
  const hasAddress = Boolean(job?.job_address || job?.postcode);
  // Deliberately NOT gated on the transfer firing: at that instant the
  // extraction carrying the address may still be in flight, and sending
  // early would claim the one-shot send with a blank alert.
  const readyToSend = hasAddress || Boolean(pending?.callEndedAt);
  if (!readyToSend) {
    logger.debug({ callId, stage }, "urgent alert held - no address captured yet");
    return;
  }

  if (!claimAction(callId, "urgentAlertSent")) return;
  const call = getCall(callId);
  const phone = job?.caller_phone ?? readCallerId(call?.callDetails ?? null);

  void sendUrgentAlert({
    callId,
    stage,
    reason: call?.pendingTransferReason ?? job?.next_action ?? "emergency",
    caller_name: job?.caller_name ?? null,
    caller_phone: phone,
    job_address: job?.job_address ?? null,
    postcode: job?.postcode ?? null,
    job_type: job?.job_type ?? null,
    job_description: job?.job_description ?? null,
    safety_flags: job?.safety_flags ?? [],
    power_status: job?.power_status ?? null,
    property_type: job?.property_type ?? null,
    summary: job?.summary_for_office ?? null,
  });
}

/**
 * Second safety net for escalation.
 *
 * The keyword detector is fast but literal, and speech-to-text mangles the
 * exact words ("sparking" came through as "sparkling" on a live call and
 * was missed). The extraction pass reads the whole conversation with the
 * model's understanding, so if IT concludes this is an emergency we arm
 * the transfer too. Slower than the keyword path, but it catches what
 * pattern matching cannot.
 */
function armTransferFromExtraction(callId: string, job: ExtractedJob): void {
  const call = getCall(callId);
  if (!call) return;
  if (call.transferInitiatedAt || call.pendingTransferReason || call.transferFailed) return;

  const hasAddress = Boolean(job.job_address || job.postcode);
  logger.info({ callId, jobType: job.job_type, hasAddress }, "transfer armed from extraction");
  updateCall(callId, {
    pendingTransferReason: "emergency",
    transferStage: hasAddress ? "ready" : "collecting_address",
  });
}

/**
 * Gate every webhook send on actionsTriggered via claimAction so nothing
 * fires more than once per callId. All sends are fire-and-forget.
 */
export function dispatchActions(callId: string, job: ExtractedJob): void {
  const call = getCall(callId);
  const callerId = readCallerId(call?.callDetails ?? null);
  const enriched: ExtractedJob = { ...job, caller_phone: job.caller_phone ?? callerId };

  if (isQualifiedLead(enriched) && claimAction(callId, "leadSent")) {
    void sendLead({ callId, job: enriched });
  }

  if (isDispatchable(enriched) && claimAction(callId, "bookingSent")) {
    const start = enriched.confirmed_window_iso;
    void sendJobBooking({
      callId,
      caller_name: enriched.caller_name,
      caller_phone: enriched.caller_phone,
      caller_email: enriched.caller_email,
      job_address: enriched.job_address,
      postcode: enriched.postcode,
      access_notes: enriched.access_notes,
      job_type: enriched.job_type,
      job_description: enriched.job_description,
      property_type: enriched.property_type,
      customer_type: enriched.customer_type,
      urgency: enriched.urgency,
      preferred_date: enriched.preferred_date,
      preferred_window: enriched.preferred_window,
      // Set when the agent confirmed a real arrival window. n8n should
      // create the diary entry at this exact time; fall back to the
      // free-text preference only when it is null.
      confirmed_start: start,
      confirmed_end: start
        ? new Date(new Date(start).getTime() + DEFAULT_JOB_DURATION_MS).toISOString()
        : null,
      is_confirmed: Boolean(start),
      how_they_heard: enriched.how_they_heard,
      notes: enriched.summary_for_office,
    });
  }

  // Emergencies alert the office even when the caller never asked to be
  // put through (e.g. they described a burning smell in passing).
  if (isEmergency(enriched)) {
    fireUrgentAlert(callId, enriched, "extracted");
    armTransferFromExtraction(callId, enriched);

    // Ring the owner from HERE, not from the WebSocket transfer path.
    // Extraction is the one escalation step proven to run reliably on
    // live calls, so the owner's phone ringing must not depend on the
    // in-call bridge, which has repeatedly failed to connect.
    const hasAddress = Boolean(enriched.job_address || enriched.postcode);
    if (hasAddress || getCall(callId)?.callEndedAt) {
      ringOwnerDirectly(callId, enriched);
    }
  }
}
