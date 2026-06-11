import { describe, test, expect } from "vitest";
import {
  takeawayRolling30,
  businessPersonalSplit,
  detectLeaks,
  TAKEAWAY_BASELINE,
} from "../src/lib/spending-logic";

const record = (date: string, category = "takeaway", amount = 15, isBusiness = false) => ({
  date,
  category,
  amount,
  isBusiness,
});

describe("takeaway rolling 30-day count", () => {
  test("counts takeaway orders inside the window", () => {
    const records = [
      record("2026-06-10"),
      record("2026-06-01"),
      record("2026-05-20"),
      record("2026-05-13"), // 29 days before today, inside
      record("2026-05-11"), // 31 days before today, outside
      record("2026-06-05", "groceries"),
    ];
    expect(takeawayRolling30(records, "2026-06-11")).toBe(4);
  });

  test("baseline equivalent is 26 per 30 days", () => {
    expect(TAKEAWAY_BASELINE.per30Days).toBe(26);
  });
});

describe("business versus personal split", () => {
  test("splits correctly", () => {
    const result = businessPersonalSplit([
      record("2026-06-01", "business", 50, true),
      record("2026-06-02", "takeaway", 15, false),
      record("2026-06-03", "groceries", 35, false),
    ]);
    expect(result.business).toBe(50);
    expect(result.personal).toBe(50);
  });
});

describe("leak detection", () => {
  test("flags a dominant expensive category", () => {
    const leaks = detectLeaks([
      record("2026-06-01", "takeaway", 60),
      record("2026-06-02", "groceries", 40),
    ]);
    expect(leaks).toContain("takeaway");
  });
  test("no leaks on balanced small spend", () => {
    expect(detectLeaks([record("2026-06-01", "groceries", 20)])).toHaveLength(0);
  });
});
