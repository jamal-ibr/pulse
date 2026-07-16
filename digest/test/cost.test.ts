import { describe, expect, test } from "vitest";
import { extractJson } from "../src/anthropic.js";
import { CostTracker } from "../src/cost.js";
import type { Config } from "../src/types.js";

const pricing: Config["pricing"] = {
  usd_to_gbp: 0.79,
  web_search_per_1000: 10,
  models: {
    "claude-haiku-4-5-20251001": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 },
    "claude-sonnet-5": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  },
};

describe("CostTracker", () => {
  test("prices plain input and output tokens", () => {
    // Arrange
    const tracker = new CostTracker(pricing);

    // Act: 1M in + 1M out on Haiku = $1 + $5 = $6 -> GBP 4.74
    tracker.add("claude-haiku-4-5-20251001", { input_tokens: 1_000_000, output_tokens: 1_000_000 });

    // Assert
    expect(tracker.totalGbp()).toBeCloseTo(6 * 0.79, 6);
  });

  test("prices cache writes and cache reads at their own rates", () => {
    const tracker = new CostTracker(pricing);
    tracker.add("claude-sonnet-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(tracker.totalGbp()).toBeCloseTo((3.75 + 0.3) * 0.79, 6);
  });

  test("adds web search billing from server_tool_use", () => {
    const tracker = new CostTracker(pricing);
    tracker.add("claude-haiku-4-5-20251001", {
      input_tokens: 0,
      output_tokens: 0,
      server_tool_use: { web_search_requests: 100 },
    });
    expect(tracker.totalGbp()).toBeCloseTo(1 * 0.79, 6);
  });

  test("throws on a model with no configured price", () => {
    const tracker = new CostTracker(pricing);
    expect(() => tracker.add("claude-mystery", { input_tokens: 1, output_tokens: 1 })).toThrow(/pricing/i);
  });

  test("report shows pence", () => {
    const tracker = new CostTracker(pricing);
    tracker.add("claude-haiku-4-5-20251001", { input_tokens: 10_000, output_tokens: 2_000 });
    expect(tracker.report()).toMatch(/Run cost: \d+\.\d\dp/);
  });
});

describe("extractJson", () => {
  test("parses a bare JSON array", () => {
    expect(extractJson<number[]>("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  test("parses JSON inside a fenced code block", () => {
    expect(extractJson<{ a: number }>('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  test("parses JSON with prose around it", () => {
    expect(extractJson<{ ok: boolean }>('The result is {"ok": true} as requested.')).toEqual({ ok: true });
  });

  test("throws when there is no JSON", () => {
    expect(() => extractJson("no structured data here")).toThrow(/No JSON/);
  });
});
