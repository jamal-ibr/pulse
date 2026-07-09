import { beforeEach, describe, expect, test } from "vitest";
import {
  claimAction,
  getCall,
  getOrCreateCall,
  markCallEnded,
  resetStore,
  updateCall,
} from "../state/callStore.js";

describe("callStore", () => {
  beforeEach(() => resetStore());

  test("getOrCreateCall initialises fresh state once", () => {
    const first = getOrCreateCall("call-1");
    const second = getOrCreateCall("call-1");
    expect(second).toBe(first);
    expect(first.actionsTriggered.leadSent).toBe(false);
    expect(first.callEndedAt).toBeNull();
  });

  test("updateCall replaces state immutably", () => {
    const before = getOrCreateCall("call-1");
    const after = updateCall("call-1", { lastClaudeResponse: "Hello" });
    expect(after).not.toBe(before);
    expect(after.lastClaudeResponse).toBe("Hello");
    expect(getCall("call-1")?.lastClaudeResponse).toBe("Hello");
  });

  test("claimAction wins exactly once per action per call", () => {
    getOrCreateCall("call-1");
    expect(claimAction("call-1", "leadSent")).toBe(true);
    expect(claimAction("call-1", "leadSent")).toBe(false);
    // Other actions remain claimable.
    expect(claimAction("call-1", "bookingSent")).toBe(true);
  });

  test("markCallEnded is idempotent", () => {
    getOrCreateCall("call-1");
    expect(markCallEnded("call-1")).toBe(true);
    expect(markCallEnded("call-1")).toBe(false);
    expect(getCall("call-1")?.callEndedAt).not.toBeNull();
  });

  test("markCallEnded on unknown call is a no-op", () => {
    expect(markCallEnded("ghost")).toBe(false);
  });
});
