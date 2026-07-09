import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../make/makeClient.js", () => ({
  sendLeadToMake: vi.fn().mockResolvedValue(true),
  sendBookingRequestToMake: vi.fn().mockResolvedValue(true),
  sendStaffAlertToMake: vi.fn().mockResolvedValue(true),
  sendCallSummaryToMake: vi.fn().mockResolvedValue(true),
}));

const make = await import("../make/makeClient.js");
const { dispatchActions, likelyContainsStructuredInfo } = await import(
  "../actions/actionEngine.js"
);
const { getOrCreateCall, resetStore } = await import("../state/callStore.js");
const { extractedLeadSchema } = await import("../extraction/leadSchema.js");

const bookableLead = extractedLeadSchema.parse({
  caller_name: "Sophie Turner",
  caller_phone: "07700 900123",
  caller_email: null,
  clinic_location_requested: null,
  treatment_interest: "whitening",
  urgency: "flexible",
  preferred_date: null,
  preferred_time: "morning",
  budget_or_price_question: null,
  pain_or_symptoms: null,
  new_or_existing_patient: "new",
  consent_to_callback: true,
  summary_for_staff: "New patient wants whitening.",
  next_action: "book",
});

describe("likelyContainsStructuredInfo", () => {
  test.each([
    "My name is Sophie",
    "you can reach me on 07700 900123",
    "it's sophie@example.com",
    "I'd like to book an appointment",
    "I'm interested in Invisalign",
    "I'm in terrible pain",
    "can someone call me back",
    "how much does whitening cost",
    "Tuesday morning works",
  ])("matches structured info: %s", (utterance) => {
    expect(likelyContainsStructuredInfo(utterance)).toBe(true);
  });

  test.each(["hello there", "yes", "okay thanks", "hmm let me think"])(
    "ignores small talk: %s",
    (utterance) => {
      expect(likelyContainsStructuredInfo(utterance)).toBe(false);
    },
  );
});

describe("dispatchActions idempotency", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  test("sends lead + booking once for a bookable lead", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableLead);
    expect(make.sendLeadToMake).toHaveBeenCalledTimes(1);
    expect(make.sendBookingRequestToMake).toHaveBeenCalledTimes(1);
    expect(make.sendStaffAlertToMake).not.toHaveBeenCalled();
  });

  test("never fires the same action twice for one call", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableLead);
    dispatchActions("call-1", bookableLead);
    dispatchActions("call-1", bookableLead);
    expect(make.sendLeadToMake).toHaveBeenCalledTimes(1);
    expect(make.sendBookingRequestToMake).toHaveBeenCalledTimes(1);
  });

  test("separate calls each get their own sends", () => {
    getOrCreateCall("call-1");
    getOrCreateCall("call-2");
    dispatchActions("call-1", bookableLead);
    dispatchActions("call-2", bookableLead);
    expect(make.sendLeadToMake).toHaveBeenCalledTimes(2);
  });

  test("staff alert fires for handover requests", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", { ...bookableLead, next_action: "transfer_to_staff" });
    expect(make.sendStaffAlertToMake).toHaveBeenCalledTimes(1);
  });
});
