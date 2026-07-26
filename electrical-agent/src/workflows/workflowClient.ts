import { config, type WebhookKind } from "../config.js";
import { logger } from "../logger.js";

/**
 * Workflow webhook client (n8n, Make.com, Zapier - anything that accepts
 * a JSON POST).
 *
 * Design constraints:
 * - NEVER throws: webhook failures must never break or block the call.
 * - Non-blocking: callers should not await these on the voice path.
 * - Retries transient failures with backoff, then logs and gives up.
 */

const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postToWorkflow(
  kind: WebhookKind,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const url = config.webhooks[kind];
  if (!url) {
    logger.warn({ webhook: kind }, "workflow webhook URL not configured - send skipped");
    return false;
  }

  const body = JSON.stringify({
    ...payload,
    _meta: {
      source: "pulse-electrical-agent",
      business: config.businessName,
      webhook: kind,
      sentAt: new Date().toISOString(),
    },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        logger.info({ webhook: kind, status: res.status }, "workflow webhook triggered");
        return true;
      }
      if (res.status >= 400 && res.status < 500) {
        logger.error({ webhook: kind, status: res.status }, "workflow webhook rejected (no retry)");
        return false;
      }
      logger.warn(
        { webhook: kind, status: res.status, attempt },
        "workflow webhook failed, retrying",
      );
    } catch (err) {
      logger.warn(
        { webhook: kind, attempt, err: (err as Error).message },
        "workflow webhook error, retrying",
      );
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }

  logger.error({ webhook: kind }, "workflow webhook failed after all retries (call unaffected)");
  return false;
}

export function sendLead(payload: Record<string, unknown>): Promise<boolean> {
  return postToWorkflow("lead", payload);
}

export function sendJobBooking(payload: Record<string, unknown>): Promise<boolean> {
  return postToWorkflow("booking", payload);
}

/** Emergencies and human-handover requests - the one that pings a phone. */
export function sendUrgentAlert(payload: Record<string, unknown>): Promise<boolean> {
  return postToWorkflow("urgentAlert", payload);
}

export function sendCallSummary(payload: Record<string, unknown>): Promise<boolean> {
  return postToWorkflow("callSummary", payload);
}
