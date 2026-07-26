import { z } from "zod";

export const JOB_TYPES = [
  "emergency_callout",
  "fault_finding",
  "tripping_breaker",
  "fuse_board_upgrade",
  "rewire",
  "eicr_landlord_certificate",
  "ev_charger",
  "sockets_and_lighting",
  "outdoor_electrics",
  "smoke_alarms",
  "pat_testing",
  "other",
  "unknown",
] as const;

export const URGENCY_LEVELS = ["emergency", "same_day", "this_week", "flexible", "unknown"] as const;

export const PROPERTY_TYPES = ["domestic", "commercial", "landlord_rental", "new_build", "unknown"] as const;

export const CUSTOMER_TYPES = [
  "homeowner",
  "tenant",
  "landlord",
  "letting_agent",
  "business",
  "unknown",
] as const;

export const POWER_STATUS = ["full_power", "partial_power", "no_power", "unknown"] as const;

export const NEXT_ACTIONS = [
  "book_visit",
  "transfer_to_owner",
  "callback",
  "quote_request",
  "answer_question",
  "not_our_job",
  "unclear",
] as const;

/**
 * Safety hazards mentioned by the caller. These drive the urgent alert and
 * are recorded verbatim for the office - never used to diagnose.
 */
export const SAFETY_FLAGS = [
  "fire_or_smoke",
  "burning_smell",
  "sparks_or_arcing",
  "exposed_live_wiring",
  "water_near_electrics",
  "electric_shock",
  "vulnerable_occupant",
  "none",
] as const;

export const extractedJobSchema = z.object({
  caller_name: z.string().nullable(),
  caller_phone: z.string().nullable(),
  caller_email: z.string().nullable(),

  /** Callouts are useless without these - the engineer has to drive there. */
  job_address: z.string().nullable(),
  postcode: z.string().nullable(),
  access_notes: z.string().nullable(),

  property_type: z.enum(PROPERTY_TYPES),
  customer_type: z.enum(CUSTOMER_TYPES),

  job_type: z.enum(JOB_TYPES),
  job_description: z.string().nullable(),
  power_status: z.enum(POWER_STATUS),
  safety_flags: z.array(z.enum(SAFETY_FLAGS)),

  urgency: z.enum(URGENCY_LEVELS),
  preferred_date: z.string().nullable(),
  preferred_window: z.string().nullable(),
  /** ISO start of the arrival window the agent actually confirmed. */
  confirmed_window_iso: z.string().nullable(),

  quote_or_price_question: z.string().nullable(),
  /** Marketing attribution - the owner spends on Google Ads. */
  how_they_heard: z.string().nullable(),

  summary_for_office: z.string().nullable(),
  next_action: z.enum(NEXT_ACTIONS),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const extractedJobJsonSchema = {
  type: "object",
  properties: {
    caller_name: { type: ["string", "null"] },
    caller_phone: { type: ["string", "null"] },
    caller_email: { type: ["string", "null"] },
    job_address: { type: ["string", "null"] },
    postcode: { type: ["string", "null"] },
    access_notes: { type: ["string", "null"] },
    property_type: { type: "string", enum: [...PROPERTY_TYPES] },
    customer_type: { type: "string", enum: [...CUSTOMER_TYPES] },
    job_type: { type: "string", enum: [...JOB_TYPES] },
    job_description: { type: ["string", "null"] },
    power_status: { type: "string", enum: [...POWER_STATUS] },
    safety_flags: { type: "array", items: { type: "string", enum: [...SAFETY_FLAGS] } },
    urgency: { type: "string", enum: [...URGENCY_LEVELS] },
    preferred_date: { type: ["string", "null"] },
    preferred_window: { type: ["string", "null"] },
    confirmed_window_iso: { type: ["string", "null"] },
    quote_or_price_question: { type: ["string", "null"] },
    how_they_heard: { type: ["string", "null"] },
    summary_for_office: { type: ["string", "null"] },
    next_action: { type: "string", enum: [...NEXT_ACTIONS] },
  },
  required: [
    "caller_name",
    "caller_phone",
    "caller_email",
    "job_address",
    "postcode",
    "access_notes",
    "property_type",
    "customer_type",
    "job_type",
    "job_description",
    "power_status",
    "safety_flags",
    "urgency",
    "preferred_date",
    "preferred_window",
    "confirmed_window_iso",
    "quote_or_price_question",
    "how_they_heard",
    "summary_for_office",
    "next_action",
  ],
  additionalProperties: false,
} as const;

/** Hazards that mean the office needs to know immediately, call still live. */
const CRITICAL_FLAGS = new Set([
  "fire_or_smoke",
  "burning_smell",
  "sparks_or_arcing",
  "exposed_live_wiring",
  "water_near_electrics",
  "electric_shock",
]);

export function hasCriticalSafetyFlag(job: ExtractedJob): boolean {
  return job.safety_flags.some((flag) => CRITICAL_FLAGS.has(flag));
}

/** A genuine emergency: hazard present, or the caller/agent called it one. */
export function isEmergency(job: ExtractedJob): boolean {
  return (
    hasCriticalSafetyFlag(job) ||
    job.urgency === "emergency" ||
    job.job_type === "emergency_callout" ||
    job.next_action === "transfer_to_owner"
  );
}

/** Worth logging as a lead once we know who they are and what they want. */
export function isQualifiedLead(job: ExtractedJob): boolean {
  const hasContact = Boolean(job.caller_phone || job.caller_email);
  const hasIntent = job.job_type !== "unknown" || job.next_action === "book_visit";
  return hasContact && hasIntent;
}

/**
 * Enough to send an engineer. The address is non-negotiable - a booking
 * without one cannot be attended.
 */
export function isDispatchable(job: ExtractedJob): boolean {
  return (
    job.next_action === "book_visit" &&
    Boolean(job.caller_name) &&
    Boolean(job.caller_phone) &&
    Boolean(job.job_address || job.postcode)
  );
}
