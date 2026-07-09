import { config, type MakeWebhookKind } from "../config.js";
import { logger } from "../logger.js";

/**
 * Make.com webhook client.
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

export async function postToMake(
  kind: MakeWebhookKind,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const url = config.makeWebhooks[kind];
  if (!url) {
    logger.warn({ webhook: kind }, "make webhook URL not configured - send skipped");
    return false;
  }

  const body = JSON.stringify({
    ...payload,
    _meta: { source: "pulse-voice-agent", webhook: kind, sentAt: new Date().toISOString() },
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
        logger.info({ webhook: kind, status: res.status }, "make webhook triggered");
        return true;
      }
      // 4xx = our payload/config problem; retrying won't help.
      if (res.status >= 400 && res.status < 500) {
        logger.error({ webhook: kind, status: res.status }, "make webhook rejected (no retry)");
        return false;
      }
      logger.warn({ webhook: kind, status: res.status, attempt }, "make webhook failed, retrying");
    } catch (err) {
      logger.warn({ webhook: kind, attempt, err: (err as Error).message }, "make webhook error, retrying");
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }

  logger.error({ webhook: kind }, "make webhook failed after all retries (call unaffected)");
  return false;
}

export function sendLeadToMake(payload: Record<string, unknown>): Promise<boolean> {
  return postToMake("lead", payload);
}

export function sendBookingRequestToMake(payload: Record<string, unknown>): Promise<boolean> {
  return postToMake("booking", payload);
}

export function sendStaffAlertToMake(payload: Record<string, unknown>): Promise<boolean> {
  return postToMake("staffAlert", payload);
}

export function sendCallSummaryToMake(payload: Record<string, unknown>): Promise<boolean> {
  return postToMake("callSummary", payload);
}
