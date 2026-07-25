import { describe, expect, test } from "vitest";
import {
  describeSlot,
  generateCandidateSlots,
  isWithinOpeningHours,
  practiceLocalParts,
  practiceLocalTime,
  SLOT_MINUTES,
} from "../scheduling/openingHours.js";

describe("practice-local time handling", () => {
  test("builds British Summer Time wall-clock correctly (July = UTC+1)", () => {
    // 9am London in July is 08:00 UTC
    const nineAm = practiceLocalTime(2026, 7, 23, 9, 0);
    expect(nineAm.toISOString()).toBe("2026-07-23T08:00:00.000Z");
  });

  test("builds GMT wall-clock correctly (January = UTC+0)", () => {
    const nineAm = practiceLocalTime(2026, 1, 15, 9, 0);
    expect(nineAm.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  test("reads back the local weekday", () => {
    // 23 July 2026 is a Thursday
    expect(practiceLocalParts(practiceLocalTime(2026, 7, 23, 12, 0)).weekday).toBe(4);
  });
});

describe("isWithinOpeningHours", () => {
  test("weekday mid-morning is open", () => {
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 23, 10, 0))).toBe(true);
  });

  test("weekday before opening is closed", () => {
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 23, 8, 30))).toBe(false);
  });

  test("18:30 close means 18:29 open, 18:30 closed", () => {
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 23, 18, 29))).toBe(true);
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 23, 18, 30))).toBe(false);
  });

  test("evening is closed", () => {
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 23, 21, 0))).toBe(false);
  });

  test("weekends are closed for routine appointments", () => {
    // 25 July 2026 is a Saturday, 26th a Sunday
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 25, 11, 0))).toBe(false);
    expect(isWithinOpeningHours(practiceLocalTime(2026, 7, 26, 11, 0))).toBe(false);
  });
});

describe("generateCandidateSlots", () => {
  const now = practiceLocalTime(2026, 7, 22, 9, 0); // Wednesday morning

  test("never offers a slot outside opening hours", () => {
    for (const slot of generateCandidateSlots(now)) {
      expect(isWithinOpeningHours(slot.start)).toBe(true);
      // The last slot must finish by close, not merely start before it.
      expect(slot.end.getTime() - slot.start.getTime()).toBe(SLOT_MINUTES * 60_000);
      const endParts = practiceLocalParts(slot.end);
      expect(endParts.weekday).toBeGreaterThanOrEqual(1);
      expect(endParts.weekday).toBeLessThanOrEqual(5);
    }
  });

  test("never offers a weekend slot", () => {
    const weekendSlots = generateCandidateSlots(now).filter((slot) => {
      const w = practiceLocalParts(slot.start).weekday;
      return w === 0 || w === 6;
    });
    expect(weekendSlots).toHaveLength(0);
  });

  test("respects the minimum lead time", () => {
    const slots = generateCandidateSlots(now);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  test("slots are in chronological order", () => {
    const slots = generateCandidateSlots(now);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThan(slots[i - 1].start.getTime());
    }
  });
});

describe("describeSlot", () => {
  test("renders a speakable British description", () => {
    const start = practiceLocalTime(2026, 7, 23, 9, 30);
    const text = describeSlot({ start, end: new Date(start.getTime() + 30 * 60_000) });
    expect(text).toContain("Thursday");
    expect(text).toContain("23 July");
    expect(text).toMatch(/9:30/);
  });
});
