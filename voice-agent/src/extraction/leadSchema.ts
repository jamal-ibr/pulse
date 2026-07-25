import { z } from "zod";

export const TREATMENT_INTERESTS = [
  "invisalign",
  "whitening",
  "veneers",
  "emergency",
  "check-up",
  "hygienist",
  "implant",
  "other",
  "unknown",
] as const;

export const URGENCY_LEVELS = ["emergency", "soon", "flexible", "unknown"] as const;

export const NEXT_ACTIONS = [
  "book",
  "callback",
  "answer_question",
  "emergency_triage",
  "transfer_to_staff",
  "unclear",
] as const;

export const PATIENT_STATUS = ["new", "existing", "unknown"] as const;

/**
 * Structured data extracted from a call transcript.
 * Nullable string fields mean "not mentioned yet".
 */
export const extractedLeadSchema = z.object({
  caller_name: z.string().nullable(),
  caller_phone: z.string().nullable(),
  caller_email: z.string().nullable(),
  clinic_location_requested: z.string().nullable(),
  treatment_interest: z.enum(TREATMENT_INTERESTS),
  urgency: z.enum(URGENCY_LEVELS),
  preferred_date: z.string().nullable(),
  preferred_time: z.string().nullable(),
  /**
   * ISO timestamp of the slot the receptionist actually confirmed, copied
   * from the LIVE AVAILABILITY list. Null when nothing was confirmed.
   */
  confirmed_slot_iso: z.string().nullable(),
  budget_or_price_question: z.string().nullable(),
  pain_or_symptoms: z.string().nullable(),
  new_or_existing_patient: z.enum(PATIENT_STATUS),
  consent_to_callback: z.boolean().nullable(),
  summary_for_staff: z.string().nullable(),
  next_action: z.enum(NEXT_ACTIONS),
});

export type ExtractedLead = z.infer<typeof extractedLeadSchema>;

/**
 * JSON Schema mirror of extractedLeadSchema, sent to Claude as a structured
 * output format so the model is constrained to valid JSON. Keep the two in
 * sync (the zod schema is still the source of truth for runtime validation).
 */
export const extractedLeadJsonSchema = {
  type: "object",
  properties: {
    caller_name: { type: ["string", "null"] },
    caller_phone: { type: ["string", "null"] },
    caller_email: { type: ["string", "null"] },
    clinic_location_requested: { type: ["string", "null"] },
    treatment_interest: { type: "string", enum: [...TREATMENT_INTERESTS] },
    urgency: { type: "string", enum: [...URGENCY_LEVELS] },
    preferred_date: { type: ["string", "null"] },
    preferred_time: { type: ["string", "null"] },
    confirmed_slot_iso: { type: ["string", "null"] },
    budget_or_price_question: { type: ["string", "null"] },
    pain_or_symptoms: { type: ["string", "null"] },
    new_or_existing_patient: { type: "string", enum: [...PATIENT_STATUS] },
    consent_to_callback: { type: ["boolean", "null"] },
    summary_for_staff: { type: ["string", "null"] },
    next_action: { type: "string", enum: [...NEXT_ACTIONS] },
  },
  required: [
    "caller_name",
    "caller_phone",
    "caller_email",
    "clinic_location_requested",
    "treatment_interest",
    "urgency",
    "preferred_date",
    "preferred_time",
    "confirmed_slot_iso",
    "budget_or_price_question",
    "pain_or_symptoms",
    "new_or_existing_patient",
    "consent_to_callback",
    "summary_for_staff",
    "next_action",
  ],
  additionalProperties: false,
} as const;

/** A lead is "qualified" once we know why they called and how to reach them. */
export function isQualifiedLead(lead: ExtractedLead): boolean {
  const hasContact = Boolean(lead.caller_phone || lead.caller_email);
  const hasIntent = lead.treatment_interest !== "unknown" || lead.next_action === "book";
  return hasContact && hasIntent;
}

/** Enough detail captured to send a booking request to the clinic team. */
export function isBookable(lead: ExtractedLead): boolean {
  return (
    lead.next_action === "book" &&
    Boolean(lead.caller_name) &&
    Boolean(lead.caller_phone || lead.caller_email)
  );
}

/** The caller asked for a human, a callback, or needs urgent triage. */
export function needsStaffAlert(lead: ExtractedLead): boolean {
  return (
    lead.next_action === "transfer_to_staff" ||
    lead.next_action === "callback" ||
    lead.next_action === "emergency_triage" ||
    lead.urgency === "emergency"
  );
}
