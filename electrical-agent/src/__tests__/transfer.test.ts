import { describe, expect, test } from "vitest";
import {
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
