import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { registerRetellWebhook } from "./retell/webhook.js";
import { handleRetellConnection } from "./retell/llmWebSocket.js";
import { postToMake } from "./make/makeClient.js";
import { extractLead } from "./extraction/extractor.js";
import { getCall } from "./state/callStore.js";

const WS_PATH_PATTERN = /^\/retell\/llm\/([^/?#]+)/;

export async function buildServer() {
  const app = Fastify({ logger: false });

  // --- HTTP endpoints ---

  app.get("/health", async () => ({
    status: "ok",
    service: "pulse-voice-agent",
    model: config.claudeModel,
    uptimeSeconds: Math.round(process.uptime()),
  }));

  registerRetellWebhook(app);

  // Local test: forward an arbitrary payload to one of the Make webhooks.
  const makeTestSchema = z.object({
    webhook: z.enum(["lead", "booking", "staffAlert", "callSummary"]).default("lead"),
    payload: z.record(z.string(), z.unknown()).default({}),
  });

  app.post("/make/test", async (request, reply) => {
    const parsed = makeTestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.issues });
    }
    const delivered = await postToMake(parsed.data.webhook, {
      test: true,
      ...parsed.data.payload,
    });
    return reply.send({ ok: true, delivered });
  });

  // Internal: run extraction on-demand for a known call (debugging/demos).
  app.post("/internal/extract-call-summary", async (request, reply) => {
    const bodySchema = z.object({ callId: z.string().min(1) });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "callId required" });
    }
    const call = getCall(parsed.data.callId);
    if (!call) return reply.code(404).send({ ok: false, error: "unknown callId" });

    const lead = await extractLead(call.callId, call.transcript);
    return reply.send({ ok: true, lead, cachedLead: call.extractedLead });
  });

  // --- Retell Custom LLM WebSocket (ws://<host>/retell/llm/:callId) ---

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
