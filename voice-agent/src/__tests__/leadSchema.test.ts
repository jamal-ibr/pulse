import { describe, expect, test } from "vitest";
import {
  extractedLeadSchema,
  isBookable,
  isQualifiedLead,
  needsStaffAlert,
  type ExtractedLead,
} from "../extraction/leadSchema.js";

const validLead: ExtractedLead = {
  caller_name: "Sophie Turner",
  caller_phone: "07700 900123",
  caller_email: null,
  clinic_location_requested: null,
  treatment_interest: "whitening",
  urgency: "flexible",
  preferred_date: "2026-08-10",
  preferred_time: "morning",
  confirmed_slot_iso: null,
  budget_or_price_question: "asked about whitening cost",
  pain_or_symptoms: null,
  new_or_existing_patient: "new",
  consent_to_callback: true,
  summary_for_staff: "New patient wants whitening before graduation.",
  next_action: "book",
};

describe("extractedLeadSchema", () => {
  test("accepts a fully populated lead", () => {
    // Arrange + Act
    const result = extractedLeadSchema.safeParse(validLead);
    // Assert
    expect(result.success).toBe(true);
  });

  test("rejects an unknown treatment_interest value", () => {
    const result = extractedLeadSchema.safeParse({ ...validLead, treatment_interest: "botox" });
    expect(result.success).toBe(false);
  });

  test("rejects a missing required field", () => {
    const { next_action: _dropped, ...withoutNextAction } = validLead;
    const result = extractedLeadSchema.safeParse(withoutNextAction);
    expect(result.success).toBe(false);
  });

  test("accepts nulls for optional detail fields", () => {
    const result = extractedLeadSchema.safeParse({
      ...validLead,
      caller_name: null,
      caller_phone: null,
      consent_to_callback: null,
      summary_for_staff: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("lead qualification helpers", () => {
  test("isQualifiedLead requires contact info and intent", () => {
    expect(isQualifiedLead(validLead)).toBe(true);
    expect(isQualifiedLead({ ...validLead, caller_phone: null, caller_email: null })).toBe(false);
    expect(
      isQualifiedLead({ ...validLead, treatment_interest: "unknown", next_action: "unclear" }),
    ).toBe(false);
  });

  test("isBookable requires book intent, name and contact", () => {
    expect(isBookable(validLead)).toBe(true);
    expect(isBookable({ ...validLead, next_action: "answer_question" })).toBe(false);
    expect(isBookable({ ...validLead, caller_name: null })).toBe(false);
  });

  test("needsStaffAlert fires for handover, callback and emergencies", () => {
    expect(needsStaffAlert({ ...validLead, next_action: "transfer_to_staff" })).toBe(true);
    expect(needsStaffAlert({ ...validLead, next_action: "callback" })).toBe(true);
    expect(needsStaffAlert({ ...validLead, urgency: "emergency" })).toBe(true);
    expect(needsStaffAlert(validLead)).toBe(false);
  });
});
