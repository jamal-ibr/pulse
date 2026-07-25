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
const { getOrCreateCall, resetStore, updateCall } = await import("../state/callStore.js");
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
  confirmed_slot_iso: null,
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
  });

  test("staff alert fires on an ordinary booking once details are captured", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableLead);
    expect(make.sendStaffAlertToMake).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(make.sendStaffAlertToMake).mock.calls[0][0];
    expect(payload.caller_phone).toBe("07700 900123");
    expect(payload.is_urgent).toBe(false);
  });

  test("staff alert waits while no contact details have been given", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", {
      ...bookableLead,
      caller_phone: null,
      caller_email: null,
      next_action: "answer_question",
      urgency: "flexible",
    });
    expect(make.sendStaffAlertToMake).not.toHaveBeenCalled();
  });

  test("falls back to the Retell caller ID when no number was stated", () => {
    // Caller gave an email but never read out a phone number - the clinic
    // should still get the number they rang from.
    getOrCreateCall("call-1");
    updateCall("call-1", { callDetails: { from_number: "+447700900999" } });
    dispatchActions("call-1", {
      ...bookableLead,
      caller_phone: null,
      caller_email: "sophie@example.com",
    });
    const payload = vi.mocked(make.sendStaffAlertToMake).mock.calls[0][0];
    expect(payload.caller_phone).toBe("+447700900999");
  });

  test("reports the call at hangup even with no details at all", () => {
    getOrCreateCall("call-1");
    updateCall("call-1", { callEndedAt: new Date().toISOString() });
    dispatchActions("call-1", {
      ...bookableLead,
      caller_phone: null,
      caller_email: null,
      next_action: "answer_question",
      urgency: "flexible",
    });
    expect(make.sendStaffAlertToMake).toHaveBeenCalledTimes(1);
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
