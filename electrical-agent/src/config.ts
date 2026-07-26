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

  // --- Business identity (makes this repo reusable for other trades) ---
  BUSINESS_NAME: z.string().default("the office"),
  OWNER_NAME: z.string().default("the owner"),

  // --- Emergency escalation ---
  /** Number a live call is transferred to for genuine emergencies. */
  OWNER_TRANSFER_NUMBER: z.string().default(""),
  /**
   * Restrict NON-emergency handovers to working hours. Emergencies always
   * transfer, whatever the time - that is the entire point of an emergency.
   *
   * Parsed explicitly, NOT with z.coerce.boolean(): coercion follows JS
   * truthiness, so the string "false" would come out TRUE and silently
   * switch this on.
   */
  TRANSFER_WORKING_HOURS_ONLY: z
    .string()
    .optional()
    .transform((v) => ["true", "1", "yes", "on"].includes((v ?? "").trim().toLowerCase())),

  /**
   * A Retell number you own, used as the caller ID when the backend rings
   * the owner directly. Required for the outbound escalation fallback.
   */
  RETELL_FROM_NUMBER: z.string().default(""),
  /** Optional Retell agent that reads the briefing to the owner. */
  OWNER_NOTIFY_AGENT_ID: z.string().default(""),

  /** How many engineers can be on jobs at once (diary capacity per slot). */
  ENGINEER_CAPACITY: z.coerce.number().int().positive().default(3),

  // --- Workflow webhooks (n8n) ---
  AVAILABILITY_WEBHOOK_URL: z.string().default(""),
  LEAD_WEBHOOK_URL: z.string().default(""),
  JOB_BOOKING_WEBHOOK_URL: z.string().default(""),
  URGENT_ALERT_WEBHOOK_URL: z.string().default(""),
  CALL_SUMMARY_WEBHOOK_URL: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
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

  businessName: env.BUSINESS_NAME,
  ownerName: env.OWNER_NAME,

  ownerTransferNumber: env.OWNER_TRANSFER_NUMBER,
  transferWorkingHoursOnly: env.TRANSFER_WORKING_HOURS_ONLY,
  retellFromNumber: env.RETELL_FROM_NUMBER,
  ownerNotifyAgentId: env.OWNER_NOTIFY_AGENT_ID,
  engineerCapacity: env.ENGINEER_CAPACITY,

  availabilityWebhookUrl: env.AVAILABILITY_WEBHOOK_URL,

  webhooks: {
    lead: env.LEAD_WEBHOOK_URL,
    booking: env.JOB_BOOKING_WEBHOOK_URL,
    urgentAlert: env.URGENT_ALERT_WEBHOOK_URL,
    callSummary: env.CALL_SUMMARY_WEBHOOK_URL,
  },
} as const;

export type WebhookKind = keyof typeof config.webhooks;

export function validateRequiredSecrets(warn: (msg: string) => void): void {
  if (!config.anthropicApiKey) {
    warn("ANTHROPIC_API_KEY is not set - Claude calls will fail. Set it in .env");
  }
  if (!config.ownerTransferNumber) {
    warn(
      "OWNER_TRANSFER_NUMBER is not set - emergency calls cannot be transferred and will fall back to an urgent alert",
    );
  }
  const missing = (Object.keys(config.webhooks) as WebhookKind[]).filter((k) => !config.webhooks[k]);
  if (missing.length > 0) {
    warn(`Workflow webhook URLs not configured (sends will be skipped): ${missing.join(", ")}`);
  }
}
