import { describe, expect, test } from "vitest";
import {
  extractedJobSchema,
  hasCriticalSafetyFlag,
  isDispatchable,
  isEmergency,
  isQualifiedLead,
  type ExtractedJob,
} from "../extraction/jobSchema.js";

const baseJob: ExtractedJob = {
  caller_name: "Sarah Nolan",
  caller_phone: "07700 900123",
  caller_email: null,
  job_address: "14 Oak Road, Croydon",
  postcode: "CR0 1AA",
  access_notes: "Dog in the garden, park on the drive",
  property_type: "domestic",
  customer_type: "homeowner",
  job_type: "fault_finding",
  job_description: "Kitchen sockets stopped working after the breaker tripped",
  power_status: "partial_power",
  safety_flags: ["none"],
  urgency: "same_day",
  preferred_date: "2026-07-28",
  preferred_window: "morning",
  confirmed_window_iso: null,
  quote_or_price_question: null,
  how_they_heard: "Google",
  summary_for_office: "Partial power loss to kitchen sockets, wants someone out today.",
  next_action: "book_visit",
};

describe("extractedJobSchema", () => {
  test("accepts a fully populated job", () => {
    expect(extractedJobSchema.safeParse(baseJob).success).toBe(true);
  });

  test("rejects an unknown job_type", () => {
    const result = extractedJobSchema.safeParse({ ...baseJob, job_type: "plumbing" });
    expect(result.success).toBe(false);
  });

  test("rejects an unknown safety flag", () => {
    const result = extractedJobSchema.safeParse({ ...baseJob, safety_flags: ["asbestos"] });
    expect(result.success).toBe(false);
  });

  test("accepts nulls for anything not yet mentioned", () => {
    const result = extractedJobSchema.safeParse({
      ...baseJob,
      caller_name: null,
      job_address: null,
      postcode: null,
      access_notes: null,
      summary_for_office: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("safety and emergency detection", () => {
  test("critical flags are recognised", () => {
    expect(hasCriticalSafetyFlag({ ...baseJob, safety_flags: ["burning_smell"] })).toBe(true);
    expect(hasCriticalSafetyFlag({ ...baseJob, safety_flags: ["electric_shock"] })).toBe(true);
    expect(hasCriticalSafetyFlag(baseJob)).toBe(false);
  });

  test("a vulnerable occupant alone is not treated as a hazard", () => {
    // Important for the office, but not a reason to transfer the call.
    expect(hasCriticalSafetyFlag({ ...baseJob, safety_flags: ["vulnerable_occupant"] })).toBe(false);
  });

  test("isEmergency covers hazards, urgency and explicit handover", () => {
    expect(isEmergency({ ...baseJob, safety_flags: ["sparks_or_arcing"] })).toBe(true);
    expect(isEmergency({ ...baseJob, urgency: "emergency" })).toBe(true);
    expect(isEmergency({ ...baseJob, next_action: "transfer_to_owner" })).toBe(true);
    expect(isEmergency(baseJob)).toBe(false);
  });
});

describe("lead and dispatch qualification", () => {
  test("isQualifiedLead needs contact plus intent", () => {
    expect(isQualifiedLead(baseJob)).toBe(true);
    expect(isQualifiedLead({ ...baseJob, caller_phone: null, caller_email: null })).toBe(false);
    expect(
      isQualifiedLead({ ...baseJob, job_type: "unknown", next_action: "answer_question" }),
    ).toBe(false);
  });

  test("a job is not dispatchable without somewhere to send the engineer", () => {
    expect(isDispatchable(baseJob)).toBe(true);
    expect(isDispatchable({ ...baseJob, job_address: null, postcode: null })).toBe(false);
  });

  test("a postcode alone is enough to dispatch", () => {
    expect(isDispatchable({ ...baseJob, job_address: null })).toBe(true);
  });

  test("dispatch requires a name and number", () => {
    expect(isDispatchable({ ...baseJob, caller_name: null })).toBe(false);
    expect(isDispatchable({ ...baseJob, caller_phone: null })).toBe(false);
  });

  test("only book_visit is dispatchable", () => {
    expect(isDispatchable({ ...baseJob, next_action: "quote_request" })).toBe(false);
  });
});
