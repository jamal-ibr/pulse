import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { registerRetellWebhook } from "./retell/webhook.js";
import { handleRetellConnection } from "./retell/llmWebSocket.js";
import { postToWorkflow } from "./workflows/workflowClient.js";
import { extractJob } from "./extraction/extractor.js";
import { getCall } from "./state/callStore.js";
import { loadAvailability } from "./scheduling/availability.js";
import { canConnectNow, detectTransferNeed } from "./retell/transfer.js";

const WS_PATH_PATTERN = /^\/retell\/llm\/([^/?#]+)/;

export async function buildServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    status: "ok",
    service: "pulse-electrical-agent",
    business: config.businessName,
    model: config.claudeModel,
    transferConfigured: Boolean(config.ownerTransferNumber),
    uptimeSeconds: Math.round(process.uptime()),
  }));

  registerRetellWebhook(app);

  // Confirms the escalation path is wired, and shows how a given phrase
  // would be classified - so you can test detection from a browser.
  app.get("/internal/transfer-check", async (request) => {
    const phrase = (request.query as Record<string, string>)?.phrase;
    const number = config.ownerTransferNumber;
    return {
      transferConfigured: Boolean(number),
      numberLooksValid: /^\+\d{10,15}$/.test(number),
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
