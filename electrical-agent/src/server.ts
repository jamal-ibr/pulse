import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { config, escalationNumberIsSelf } from "./config.js";
import { logger } from "./logger.js";
import { registerRetellWebhook } from "./retell/webhook.js";
import { handleRetellConnection } from "./retell/llmWebSocket.js";
import { postToWorkflow } from "./workflows/workflowClient.js";
import { extractJob } from "./extraction/extractor.js";
import { getCall } from "./state/callStore.js";
import { loadAvailability } from "./scheduling/availability.js";
import { canConnectNow, detectTransferNeed } from "./retell/transfer.js";
import { BUILD_TAG } from "./buildInfo.js";
import { callOwnerWithBriefing } from "./retell/outboundCall.js";

const WS_PATH_PATTERN = /^\/retell\/llm\/([^/?#]+)/;

/**
 * Retell's outbound errors are terse ("Not Found"), so translate the ones
 * we have actually hit into the dashboard setting that causes them.
 */
function hintForStatus(status: number | undefined, hasNotifyAgent: boolean): string | undefined {
  if (status === 404) {
    return [
      "Retell could not find something it needs to place the call. Most likely one of:",
      hasNotifyAgent
        ? "(1) OWNER_NOTIFY_AGENT_ID does not match a real agent in this Retell account;"
        : "(1) no OUTBOUND agent is bound to your Retell number - bind one in Retell > Phone Numbers, or set OWNER_NOTIFY_AGENT_ID to an agent ID;",
      "(2) RETELL_FROM_NUMBER is not a number owned/imported in this Retell account;",
      "(3) the destination country is not enabled on the number (allowed_outbound_country_list must include GB for UK mobiles).",
    ].join(" ");
  }
  if (status === 401 || status === 403) {
    return "RETELL_API_KEY is wrong or lacks permission for outbound calls.";
  }
  if (status === 422 || status === 400) {
    return "Payload rejected - check both numbers are E.164 (+44...) and that from_number is owned in Retell.";
  }
  return undefined;
}

export async function buildServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    status: "ok",
    service: "pulse-electrical-agent",
    // If this is not the tag you just deployed, the build did not land.
    buildTag: BUILD_TAG,
    business: config.businessName,
    model: config.claudeModel,
    transferConfigured: Boolean(config.ownerTransferNumber),
    outboundCallConfigured: Boolean(config.retellApiKey && config.retellFromNumber),
    // Loud, because it silently breaks every escalation path.
    ...(escalationNumberIsSelf()
      ? {
          CONFIG_ERROR:
            "OWNER_TRANSFER_NUMBER equals RETELL_FROM_NUMBER - escalation cannot work. Set OWNER_TRANSFER_NUMBER to the owner's mobile.",
        }
      : {}),
    uptimeSeconds: Math.round(process.uptime()),
  }));

  registerRetellWebhook(app);

  /**
   * Places a REAL outbound call to the owner, right now, and returns
   * Retell's verbatim response.
   *
   * This exists to separate "our code is wrong" from "Retell won't do it".
   * Open it in a browser: if the phone rings, outbound calling works and
   * the problem is upstream in detection. If it doesn't, the JSON contains
   * Retell's own error message explaining why.
   */
  app.get("/internal/test-owner-call", async () => {
    const result = await callOwnerWithBriefing({
      callId: "manual-test",
      callerNumber: "+447700900123",
      job: {
        job_address: "TEST - 1 Example Street",
        postcode: "B1 1AA",
        job_description: "This is a test of the emergency escalation call",
        safety_flags: ["sparks_or_arcing"],
      } as never,
    });
    return {
      ...result,
      config: {
        hasApiKey: Boolean(config.retellApiKey),
        fromNumber: config.retellFromNumber || null,
        toNumber: config.ownerTransferNumber || null,
        notifyAgentId: config.ownerNotifyAgentId || null,
      },
      hint: hintForStatus(result.status, Boolean(config.ownerNotifyAgentId)),
    };
  });

  // Confirms the escalation path is wired, and shows how a given phrase
  // would be classified - so you can test detection from a browser.
  app.get("/internal/transfer-check", async (request) => {
    const phrase = (request.query as Record<string, string>)?.phrase;
    const number = config.ownerTransferNumber;
    return {
      transferConfigured: Boolean(number),
      numberLooksValid: /^\+\d{10,15}$/.test(number),
      ownerNumberIsOurOwnNumber: escalationNumberIsSelf(),
      numberPreview: number ? `${number.slice(0, 4)}…${number.slice(-3)}` : null,
      transferWorkingHoursOnly: config.transferWorkingHoursOnly,
      canConnectNow: canConnectNow(),
      ...(phrase ? { phrase, detection: detectTransferNeed(phrase) } : {}),
    };
  });

  // Check what the agent would currently offer - useful when setting up
  // the availability workflow, and for a quick demo sanity check.
  app.get("/internal/availability", async () => {
    const snapshot = await loadAvailability("manual-check");
    return {
      isLive: snapshot.isLive,
      windowCount: snapshot.windows.length,
      promptContext: snapshot.promptContext,
    };
  });

  const workflowTestSchema = z.object({
    webhook: z.enum(["lead", "booking", "urgentAlert", "callSummary"]).default("lead"),
    payload: z.record(z.string(), z.unknown()).default({}),
  });

  app.post("/workflow/test", async (request, reply) => {
    const parsed = workflowTestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.issues });
    }
    const delivered = await postToWorkflow(parsed.data.webhook, {
      test: true,
      ...parsed.data.payload,
    });
    return reply.send({ ok: true, delivered });
  });

  app.post("/internal/extract-call-summary", async (request, reply) => {
    const bodySchema = z.object({ callId: z.string().min(1) });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "callId required" });
    }
    const call = getCall(parsed.data.callId);
    if (!call) return reply.code(404).send({ ok: false, error: "unknown callId" });

    const job = await extractJob(call.callId, call.transcript, call.availabilityContext);
    return reply.send({ ok: true, job, cachedJob: call.extractedJob });
  });

  const wss = new WebSocketServer({ noServer: true });

  await app.ready();

  app.server.on("upgrade", (request, socket, head) => {
    const match = request.url?.match(WS_PATH_PATTERN);
    if (!match) {
      logger.warn({ url: request.url }, "rejected websocket upgrade on unknown path");
      socket.destroy();
      return;
    }
    const callId = decodeURIComponent(match[1]);
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleRetellConnection(ws, callId);
    });
  });

  return app;
}
