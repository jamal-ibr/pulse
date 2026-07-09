import pino from "pino";
import { config } from "./config.js";

/**
 * Structured logger. Never log full secrets or complete transcripts -
 * log call IDs, event types and short previews only.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "pulse-voice-agent" },
  transport:
    config.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

/** Truncate potentially long/sensitive text before logging. */
export function preview(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
