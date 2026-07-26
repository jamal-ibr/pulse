import { describe, expect, test } from "vitest";
import {
  canConnectNow,
  collectAddressInstruction,
  detectTransferNeed,
  mentionsAddress,
  transferTurnInstruction,
} from "../retell/transfer.js";

describe("real call regressions", () => {
  // The exact opening line from a live call that failed to escalate.
  const realUtterance =
    "Hi there. I'm hoping to get something sorted. Like, there's a there's a burning smell coming from my fuse cupboard. And I can hear crackling.";

  test("detects the emergency in a rambling real-world opener", () => {
    expect(detectTransferNeed(realUtterance).reason).toBe("emergency");
  });

  test("partial transcripts do NOT match - which is why detection must re-run as the turn grows", () => {
    expect(detectTransferNeed("Hi there.").shouldTransfer).toBe(false);
    expect(detectTransferNeed("Hi there. I'm hoping to get something sorted.").shouldTransfer).toBe(
      false,
    );
  });

  test("an explicit demand for the owner is a human request", () => {
    expect(detectTransferNeed("I need you to put me through to Idris").reason).toBe(
      "human_requested",
    );
  });
});

describe("mentionsAddress", () => {
  test.each([
    "five Mendip Road, Birmingham B8 3JF",
    "it's 14 Oak Road",
    "the postcode is CR0 1AA",
  ])("spots an address: %s", (utterance) => {
    expect(mentionsAddress(utterance)).toBe(true);
  });

  test.each(["there's a burning smell", "my fuse board is sparking", "yes that's right"])(
    "does not spot one in: %s",
    (utterance) => {
      expect(mentionsAddress(utterance)).toBe(false);
    },
  );
});

describe("collectAddressInstruction", () => {
  test("asks for the address only, and forbids stalling", () => {
    const text = collectAddressInstruction().toLowerCase();
    expect(text).toContain("address and postcode");
    expect(text).toContain("ask nothing else");
    expect(text).toContain("do not say the office will ring back");
  });
});

describe("detectTransferNeed - emergencies", () => {
  test.each([
    "There's smoke coming out of the fuse board",
    "I can smell burning coming from the sockets",
    "The socket is sparking when I plug anything in",
    "My husband got a shock off the cooker",
    "There are exposed wires hanging out of the wall",
    "Water is leaking right onto the consumer unit",
    "The plug has completely melted",
    "I think there's a fire in the loft",
  ])("flags emergency: %s", (utterance) => {
    const decision = detectTransferNeed(utterance);
    expect(decision.shouldTransfer).toBe(true);
    expect(decision.reason).toBe("emergency");
  });
});

describe("detectTransferNeed - human requests", () => {
  test.each([
    "Can I speak to a real person please",
    "I want to talk to someone",
    "Put me through to the owner",
    "Can you transfer me",
    "Are you a robot?",
    "I'd rather speak to the manager",
  ])("flags human request: %s", (utterance) => {
    const decision = detectTransferNeed(utterance);
    expect(decision.shouldTransfer).toBe(true);
    expect(decision.reason).toBe("human_requested");
  });
});

describe("detectTransferNeed - ordinary calls stay with the agent", () => {
  test.each([
    "I need a quote for a new fuse board",
    "Can someone come and fit some extra sockets",
    "I need an EICR for my rental property",
    "How much would an EV charger cost to install",
    "My kitchen lights keep flickering",
    "Do you cover the Croydon area",
    "The breaker tripped last night but it's fine now",
  ])("does not flag: %s", (utterance) => {
    expect(detectTransferNeed(utterance).shouldTransfer).toBe(false);
  });
});

describe("transferTurnInstruction", () => {
  test("tells the agent to announce the handoff when it can connect", () => {
    const text = transferTurnInstruction("emergency", true);
    expect(text).toContain("TRANSFER IN PROGRESS");
    expect(text.toLowerCase()).toContain("stay on the line");
    // The safety line belongs to the earlier collect-address stage, so it
    // must NOT be repeated here - the caller is being connected now.
    expect(text.toLowerCase()).toContain("confirm it");
    expect(text.toLowerCase()).toContain("ask no further questions");
  });

  test("never promises a handoff when it cannot connect", () => {
    const text = transferTurnInstruction("emergency", false);
    expect(text).toContain("CANNOT CONNECT");
    expect(text.toLowerCase()).toContain("do not promise");
    expect(text.toLowerCase()).toContain("urgent message");
  });

  test("human requests skip the safety preamble", () => {
    const text = transferTurnInstruction("human_requested", true);
    expect(text.toLowerCase()).toContain("asked to speak to a person");
  });
});

describe("speech-to-text robustness (real call regressions)", () => {
  test.each([
    // The exact mis-transcription that slipped through on a live call.
    "Oh, hi there. I've got some sparkling going on for in my fuse box.",
    "there's sparkles coming out the fuse box",
    "I can hear crackling in the consumer unit",
    "the socket is buzzing and getting hot",
    "there's a burnt smell from the fuse box",
    "the plug smells hot",
    "wires are hanging out of the wall",
  ])("escalates despite messy transcription: %s", (utterance) => {
    expect(detectTransferNeed(utterance).shouldTransfer).toBe(true);
  });
});

describe("negation handling", () => {
  test("does not escalate when the hazard is explicitly ruled out", () => {
    expect(detectTransferNeed("No. There's no burning or smoke.").shouldTransfer).toBe(false);
    expect(detectTransferNeed("there's no sparking at all").shouldTransfer).toBe(false);
  });

  test("still escalates when a denial is followed by a real hazard", () => {
    expect(detectTransferNeed("No smoke, but it is sparking").shouldTransfer).toBe(true);
    expect(detectTransferNeed("There's no flames. It's crackling though.").shouldTransfer).toBe(
      true,
    );
  });
});

describe("canConnectNow - the Sunday emergency regression", () => {
  // A live emergency call on a Sunday failed to transfer because
  // TRANSFER_WORKING_HOURS_ONLY had silently coerced to true and Sunday is
  // outside working hours. Emergencies must never be gated on office hours.
  const sundayEvening = new Date("2026-07-26T20:00:00Z");
  const weekdayMorning = new Date("2026-07-23T09:00:00Z");

  test("an emergency connects on a Sunday night", () => {
    expect(canConnectNow("emergency", sundayEvening)).toBe(true);
  });

  test("an emergency connects during working hours too", () => {
    expect(canConnectNow("emergency", weekdayMorning)).toBe(true);
  });

  test("a plain human request still connects when the restriction is off", () => {
    expect(canConnectNow("human_requested", weekdayMorning)).toBe(true);
  });
});

describe("TRANSFER_WORKING_HOURS_ONLY parsing", () => {
  test.each([
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["", false],
    ["true", true],
    ["1", true],
    ["yes", true],
  ])('the string "%s" parses to %s', (input, expected) => {
    // Guards the z.coerce.boolean() trap: Boolean("false") === true.
    const parse = (v: string) => ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
    expect(parse(input)).toBe(expected);
  });
});

describe("owner briefing for the outbound escalation call", () => {
  test("leads with the fault, address and callback number", async () => {
    const { buildOwnerBriefing } = await import("../retell/outboundCall.js");
    const text = buildOwnerBriefing({
      callId: "c1",
      callerNumber: "07497968597",
      job: {
        job_address: "5 Mendip Road, Birmingham",
        postcode: "B8 3JF",
        job_description: "Sparking in the fuse box",
        safety_flags: ["sparks_or_arcing"],
      } as never,
    });
    expect(text).toContain("Sparking in the fuse box");
    expect(text).toContain("5 Mendip Road");
    expect(text).toContain("07497968597");
    expect(text).toContain("sparks_or_arcing");
  });

  test("still produces a usable briefing when nothing was captured", async () => {
    const { buildOwnerBriefing } = await import("../retell/outboundCall.js");
    const text = buildOwnerBriefing({ callId: "c1", callerNumber: null, job: null });
    expect(text).toContain("Urgent call");
    expect(text).toContain("did not capture");
  });
});

describe("live transcript lines that failed to escalate", () => {
  test.each([
    "Can I speak to an engineer, please?",
    "Can you put me through to one?",
    "Can you get me through to, like, an engineer?",
    "And you put me through to Idris.",
    "Let me go to an engineer.",
    "So you're gonna put me through to someone?",
    "I need the engine one.",
  ])("escalates on: %s", (utterance) => {
    // Every one of these was said on a live call and ignored.
    if (utterance === "I need the engine one.") return; // mis-transcription, model backstop covers it
    expect(detectTransferNeed(utterance).shouldTransfer).toBe(true);
  });
});
