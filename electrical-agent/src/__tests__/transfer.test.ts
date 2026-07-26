import { describe, expect, test } from "vitest";
import { detectTransferNeed, transferTurnInstruction } from "../retell/transfer.js";

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
    expect(text.toLowerCase()).toContain("safety");
    expect(text.toLowerCase()).toContain("stay on the line");
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
