import "dotenv/config";
import { z } from "zod";

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  ANTHROPIC_API_KEY: z.string().default(""),
  CLAUDE_MODEL: z.string().default(""),

  RETELL_API_KEY: z.string().default(""),
  RETELL_WEBHOOK_SECRET: z.string().default(""),

  // Workflow webhook URLs - works with n8n, Make.com, Zapier, or anything
  // that accepts a JSON POST. Generic names preferred; MAKE_* kept as
  // legacy aliases.
  // Returns busy calendar blocks so the agent can offer real slots.
  AVAILABILITY_WEBHOOK_URL: z.string().default(""),
  LEAD_WEBHOOK_URL: z.string().default(""),
  BOOKING_WEBHOOK_URL: z.string().default(""),
  STAFF_ALERT_WEBHOOK_URL: z.string().default(""),
  CALL_SUMMARY_WEBHOOK_URL: z.string().default(""),
  MAKE_LEAD_WEBHOOK_URL: z.string().default(""),
  MAKE_BOOKING_WEBHOOK_URL: z.string().default(""),
  MAKE_STAFF_ALERT_WEBHOOK_URL: z.string().default(""),
  MAKE_CALL_SUMMARY_WEBHOOK_URL: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast on malformed env vars (e.g. non-numeric PORT).
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,

  anthropicApiKey: env.ANTHROPIC_API_KEY,
  claudeModel: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,

  retellApiKey: env.RETELL_API_KEY,
  retellWebhookSecret: env.RETELL_WEBHOOK_SECRET,

  availabilityWebhookUrl: env.AVAILABILITY_WEBHOOK_URL,

  makeWebhooks: {
    lead: env.LEAD_WEBHOOK_URL || env.MAKE_LEAD_WEBHOOK_URL,
    booking: env.BOOKING_WEBHOOK_URL || env.MAKE_BOOKING_WEBHOOK_URL,
    staffAlert: env.STAFF_ALERT_WEBHOOK_URL || env.MAKE_STAFF_ALERT_WEBHOOK_URL,
    callSummary: env.CALL_SUMMARY_WEBHOOK_URL || env.MAKE_CALL_SUMMARY_WEBHOOK_URL,
  },
} as const;

export type MakeWebhookKind = keyof typeof config.makeWebhooks;

/**
 * Startup validation: warn loudly (but don't crash in development) when
 * required secrets are missing, so a demo box misconfiguration is obvious.
 */
export function validateRequiredSecrets(warn: (msg: string) => void): void {
  if (!config.anthropicApiKey) {
    warn("ANTHROPIC_API_KEY is not set - Claude calls will fail. Set it in .env");
  }
  const missingHooks = (Object.keys(config.makeWebhooks) as MakeWebhookKind[]).filter(
    (k) => !config.makeWebhooks[k],
  );
  if (missingHooks.length > 0) {
    warn(`Workflow webhook URLs not configured (sends will be skipped): ${missingHooks.join(", ")}`);
  }
}
