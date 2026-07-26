import { config } from "../config.js";
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

/**
 * Place the call. Never throws - escalation failing must not break the
 * live conversation. Returns true when Retell accepted the request.
 */
export async function callOwnerWithBriefing(context: OwnerCallContext): Promise<boolean> {
  const { callId } = context;

  if (!config.retellApiKey || !config.retellFromNumber || !config.ownerTransferNumber) {
    logger.warn(
      {
        callId,
        hasApiKey: Boolean(config.retellApiKey),
        hasFromNumber: Boolean(config.retellFromNumber),
        hasOwnerNumber: Boolean(config.ownerTransferNumber),
      },
      "owner callback not configured - skipping outbound call",
    );
    return false;
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

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error(
        { callId, status: res.status, detail: detail.slice(0, 300) },
        "outbound owner call rejected by Retell",
      );
      return false;
    }

    logger.info({ callId }, "outbound owner call placed");
    return true;
  } catch (err) {
    logger.error({ callId, err: (err as Error).message }, "outbound owner call failed");
    return false;
  }
}
