import { config, escalationNumberIsSelf } from "../config.js";
import { logger } from "../logger.js";
import type { ExtractedJob } from "../extraction/jobSchema.js";

/**
 * Ring the business owner directly via Retell's outbound call API.
 *
 * This is the belt-and-braces escalation. Bridging the live caller across
 * (transfer_number) is the nicer experience when it works, but it depends
 * on Retell's transfer behaviour, which is undocumented for the Custom LLM
 * path. An outbound call is a plain, well-documented REST call - so if the
 * bridge does not connect, the owner's phone still rings with the details.
 *
 * Endpoint verified from Retell's published SDK:
 *   POST https://api.retellai.com/v2/create-phone-call
 */

const CREATE_CALL_URL = "https://api.retellai.com/v2/create-phone-call";
const REQUEST_TIMEOUT_MS = 8000;

export interface OwnerCallContext {
  callId: string;
  job: ExtractedJob | null;
  callerNumber: string | null;
}

/** Short spoken summary passed to the notification agent. */
export function buildOwnerBriefing(context: OwnerCallContext): string {
  const { job, callerNumber } = context;
  const where = job?.job_address ?? job?.postcode ?? "an address we did not capture";
  const fault = job?.job_description ?? "an electrical emergency";
  const hazards = job?.safety_flags?.filter((f) => f !== "none") ?? [];

  const parts = [
    `Urgent call just came in. ${fault}.`,
    `The address is ${where}.`,
    hazards.length > 0 ? `Reported hazards: ${hazards.join(", ")}.` : "",
    callerNumber ? `Call them back on ${callerNumber}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export interface OutboundCallResult {
  ok: boolean;
  /** Why it did not happen, in plain terms. */
  reason: string;
  /** HTTP status from Retell, when a request was actually made. */
  status?: number;
  /** Retell's own error body - the thing that actually explains failures. */
  retellResponse?: string;
  briefing?: string;
}

/**
 * Place the call. Never throws - escalation failing must not break the
 * live conversation.
 */
export async function callOwnerWithBriefing(
  context: OwnerCallContext,
): Promise<OutboundCallResult> {
  const { callId } = context;

  const missing = [
    !config.retellApiKey ? "RETELL_API_KEY" : "",
    !config.retellFromNumber ? "RETELL_FROM_NUMBER" : "",
    !config.ownerTransferNumber ? "OWNER_TRANSFER_NUMBER" : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    logger.warn({ callId, missing }, "owner callback not configured - skipping outbound call");
    return { ok: false, reason: `missing config: ${missing.join(", ")}` };
  }

  if (escalationNumberIsSelf()) {
    logger.error(
      { callId, number: config.ownerTransferNumber },
      "OWNER_TRANSFER_NUMBER equals RETELL_FROM_NUMBER - the agent would ring its own number",
    );
    return {
      ok: false,
      reason:
        "OWNER_TRANSFER_NUMBER is the same as RETELL_FROM_NUMBER. Set OWNER_TRANSFER_NUMBER to the owner's mobile, not the number callers dial.",
    };
  }

  const briefing = buildOwnerBriefing(context);

  try {
    const res = await fetch(CREATE_CALL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.retellApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from_number: config.retellFromNumber,
        to_number: config.ownerTransferNumber,
        // Dynamic variables are injected into the notifying agent's prompt.
        retell_llm_dynamic_variables: {
          briefing,
          job_address: context.job?.job_address ?? "",
          postcode: context.job?.postcode ?? "",
          caller_number: context.callerNumber ?? "",
          fault: context.job?.job_description ?? "",
        },
        metadata: { source_call_id: callId, reason: "emergency_escalation" },
        ...(config.ownerNotifyAgentId ? { override_agent_id: config.ownerNotifyAgentId } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await res.text().catch(() => "");

    if (!res.ok) {
      logger.error(
        { callId, status: res.status, detail: body.slice(0, 500) },
        "outbound owner call rejected by Retell",
      );
      return {
        ok: false,
        reason: "Retell rejected the request",
        status: res.status,
        retellResponse: body.slice(0, 500),
        briefing,
      };
    }

    logger.info({ callId, status: res.status }, "outbound owner call placed");
    return {
      ok: true,
      reason: "Retell accepted the call",
      status: res.status,
      retellResponse: body.slice(0, 300),
      briefing,
    };
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ callId, err: message }, "outbound owner call failed");
    return { ok: false, reason: `network/timeout error: ${message}`, briefing };
  }
}
