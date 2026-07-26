import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../workflows/workflowClient.js", () => ({
  sendLead: vi.fn().mockResolvedValue(true),
  sendJobBooking: vi.fn().mockResolvedValue(true),
  sendUrgentAlert: vi.fn().mockResolvedValue(true),
  sendCallSummary: vi.fn().mockResolvedValue(true),
}));

const workflows = await import("../workflows/workflowClient.js");
const { dispatchActions, likelyContainsStructuredInfo, readCallerId } = await import(
  "../actions/actionEngine.js"
);
const { getOrCreateCall, resetStore, updateCall } = await import("../state/callStore.js");
const { extractedJobSchema } = await import("../extraction/jobSchema.js");

const bookableJob = extractedJobSchema.parse({
  caller_name: "Sarah Nolan",
  caller_phone: "07700 900123",
  caller_email: null,
  job_address: "14 Oak Road, Croydon",
  postcode: "CR0 1AA",
  access_notes: null,
  property_type: "domestic",
  customer_type: "homeowner",
  job_type: "fault_finding",
  job_description: "Kitchen sockets dead",
  power_status: "partial_power",
  safety_flags: ["none"],
  urgency: "same_day",
  preferred_date: null,
  preferred_window: "morning",
  confirmed_window_iso: "2026-07-28T07:00:00.000Z",
  quote_or_price_question: null,
  how_they_heard: "Google",
  summary_for_office: "Kitchen sockets dead, wants someone out.",
  next_action: "book_visit",
});

describe("likelyContainsStructuredInfo", () => {
  test.each([
    "My name is Sarah",
    "it's 14 Oak Road",
    "the postcode is CR0 1AA",
    "I need an EICR for my rental",
    "can someone come out tomorrow morning",
    "how much for an EV charger",
    "the breaker keeps tripping",
  ])("matches structured info: %s", (utterance) => {
    expect(likelyContainsStructuredInfo(utterance)).toBe(true);
  });

  test.each(["hello there", "yes please", "okay thanks", "hmm let me think"])(
    "ignores small talk: %s",
    (utterance) => {
      expect(likelyContainsStructuredInfo(utterance)).toBe(false);
    },
  );
});

describe("readCallerId", () => {
  test("reads the Retell caller ID", () => {
    expect(readCallerId({ from_number: "+447700900999" })).toBe("+447700900999");
  });

  test("returns null when absent", () => {
    expect(readCallerId(null)).toBeNull();
    expect(readCallerId({ direction: "inbound" })).toBeNull();
  });
});

describe("dispatchActions", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  test("sends lead and booking once for a dispatchable job", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableJob);
    expect(workflows.sendLead).toHaveBeenCalledTimes(1);
    expect(workflows.sendJobBooking).toHaveBeenCalledTimes(1);
    expect(workflows.sendUrgentAlert).not.toHaveBeenCalled();
  });

  test("booking carries the confirmed arrival window", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableJob);
    const payload = vi.mocked(workflows.sendJobBooking).mock.calls[0][0];
    expect(payload.is_confirmed).toBe(true);
    expect(payload.confirmed_start).toBe("2026-07-28T07:00:00.000Z");
    expect(payload.confirmed_end).toBe("2026-07-28T11:00:00.000Z");
    expect(payload.postcode).toBe("CR0 1AA");
  });

  test("never fires the same action twice for one call", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", bookableJob);
    dispatchActions("call-1", bookableJob);
    dispatchActions("call-1", bookableJob);
    expect(workflows.sendLead).toHaveBeenCalledTimes(1);
    expect(workflows.sendJobBooking).toHaveBeenCalledTimes(1);
  });

  test("separate calls each get their own sends", () => {
    getOrCreateCall("call-1");
    getOrCreateCall("call-2");
    dispatchActions("call-1", bookableJob);
    dispatchActions("call-2", bookableJob);
    expect(workflows.sendLead).toHaveBeenCalledTimes(2);
  });

  test("a hazard raises an urgent alert even without a handover request", () => {
    getOrCreateCall("call-1");
    dispatchActions("call-1", { ...bookableJob, safety_flags: ["burning_smell"] });
    expect(workflows.sendUrgentAlert).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(workflows.sendUrgentAlert).mock.calls[0][0];
    expect(payload.postcode).toBe("CR0 1AA");
    expect(payload.safety_flags).toContain("burning_smell");
  });

  test("falls back to the Retell caller ID when no number was stated", () => {
    getOrCreateCall("call-1");
    updateCall("call-1", { callDetails: { from_number: "+447700900999" } });
    dispatchActions("call-1", { ...bookableJob, caller_phone: null });
    const payload = vi.mocked(workflows.sendJobBooking).mock.calls[0][0];
    expect(payload.caller_phone).toBe("+447700900999");
  });
});
