import { buildServer } from "./server.js";
import { config, validateRequiredSecrets } from "./config.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  validateRequiredSecrets((msg) => logger.warn(msg));

  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });

  logger.info(
    {
      port: config.port,
      business: config.businessName,
      model: config.claudeModel,
      env: config.nodeEnv,
      transferConfigured: Boolean(config.ownerTransferNumber),
    },
    "pulse electrical agent listening",
  );
  logger.info(`Retell Custom LLM WebSocket URL: ws://localhost:${config.port}/retell/llm/{call_id}`);
  logger.info(`Retell webhook URL:              http://localhost:${config.port}/retell/webhook`);
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start server");
  process.exit(1);
});
