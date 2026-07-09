import type { FastifyInstance } from "fastify";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { onCallEnded } from "../actions/actionEngine.js";
import { getOrCreateCall, updateCall } from "../state/callStore.js";
import { retellWebhookSchema } from "./types.js";

/**
 * POST /retell/webhook - Retell call lifecycle events
 * (call_started, call_ended, call_analyzed).
 */
export function registerRetellWebhook(app: FastifyInstance): void {
  app.post("/retell/webhook", async (request, reply) => {
    // TODO(retell): verify the x-retell-signature header against
    // RETELL_WEBHOOK_SECRET / RETELL_API_KEY using Retell's documented
    // scheme (their SDK exposes Retell.verify). Until verified, treat
    // this endpoint as untrusted input - we only ever parse + log it.
    if (config.retellWebhookSecret && !request.headers["x-retell-signature"]) {
      logger.warn("retell webhook missing signature header");
    }

    const parsed = retellWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "invalid retell webhook payload");
      return reply.code(400).send({ ok: false, error: "invalid payload" });
    }

    const { event, call } = parsed.data;
    const callId = call?.call_id;
    logger.info({ event, callId }, "retell webhook received");

    if (!callId) return reply.send({ ok: true });

    switch (event) {
      case "call_started":
        getOrCreateCall(callId);
        break;
      case "call_ended":
        // Fire-and-forget: webhook must return fast.
        void onCallEnded(callId, "retell_webhook");
        break;
      case "call_analyzed":
        // Retell's own post-call analysis; stash it alongside our state.
        updateCall(callId, { callDetails: call ?? null });
        break;
      default:
        logger.debug({ event }, "unhandled retell webhook event");
    }

    return reply.send({ ok: true });
  });
}
