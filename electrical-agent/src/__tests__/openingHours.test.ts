import { describe, expect, test } from "vitest";
import {
  businessLocalParts,
  businessLocalTime,
  describeWindow,
  generateCandidateWindows,
  hasCapacity,
  isWithinWorkingHours,
  overlappingJobCount,
  windowsForWeekday,
} from "../scheduling/openingHours.js";

describe("business-local time handling", () => {
  test("builds British Summer Time wall-clock correctly (July = UTC+1)", () => {
    expect(businessLocalTime(2026, 7, 23, 8, 0).toISOString()).toBe("2026-07-23T07:00:00.000Z");
  });

  test("builds GMT wall-clock correctly (January = UTC+0)", () => {
    expect(businessLocalTime(2026, 1, 15, 8, 0).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  test("reads back the local weekday", () => {
    // 23 July 2026 is a Thursday
    expect(businessLocalParts(businessLocalTime(2026, 7, 23, 12, 0)).weekday).toBe(4);
  });
});

describe("working hours", () => {
  test("weekday morning and afternoon are open", () => {
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 23, 9, 0))).toBe(true);
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 23, 15, 0))).toBe(true);
  });

  test("weekday before eight and after five are closed", () => {
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 23, 7, 0))).toBe(false);
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 23, 18, 0))).toBe(false);
  });

  test("Saturday is morning only", () => {
    // 25 July 2026 is a Saturday
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 25, 10, 0))).toBe(true);
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 25, 15, 0))).toBe(false);
  });

  test("Sunday is closed for routine work", () => {
    expect(isWithinWorkingHours(businessLocalTime(2026, 7, 26, 11, 0))).toBe(false);
    expect(windowsForWeekday(0)).toHaveLength(0);
  });
});

describe("generateCandidateWindows", () => {
  const now = businessLocalTime(2026, 7, 22, 6, 0); // Wednesday, before opening

  test("never offers a window outside working hours", () => {
    for (const w of generateCandidateWindows(now)) {
      expect(isWithinWorkingHours(w.start)).toBe(true);
      expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
    }
  });

  test("never offers a Sunday window", () => {
    const sundays = generateCandidateWindows(now).filter(
      (w) => businessLocalParts(w.start).weekday === 0,
    );
    expect(sundays).toHaveLength(0);
  });

  test("windows are in chronological order", () => {
    const windows = generateCandidateWindows(now);
    expect(windows.length).toBeGreaterThan(0);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start.getTime()).toBeGreaterThan(windows[i - 1].start.getTime());
    }
  });
});

describe("engineer capacity", () => {
  const window = {
    start: businessLocalTime(2026, 7, 23, 8, 0),
    end: businessLocalTime(2026, 7, 23, 12, 0),
    label: "morning",
  };

  test("counts only jobs that actually overlap the window", () => {
    const busy = [
      { start: businessLocalTime(2026, 7, 23, 9, 0), end: businessLocalTime(2026, 7, 23, 11, 0) },
      // Afternoon job - must not count against the morning window.
      { start: businessLocalTime(2026, 7, 23, 13, 0), end: businessLocalTime(2026, 7, 23, 15, 0) },
    ];
    expect(overlappingJobCount(window, busy)).toBe(1);
  });

  test("window stays bookable while engineers remain free (default capacity 3)", () => {
    const job = (h: number) => ({
      start: businessLocalTime(2026, 7, 23, h, 0),
      end: businessLocalTime(2026, 7, 23, h + 1, 0),
    });
    expect(hasCapacity(window, [job(9), job(10)])).toBe(true);
    expect(hasCapacity(window, [job(9), job(10), job(11)])).toBe(false);
  });
});

describe("describeWindow", () => {
  test("renders a speakable arrival window", () => {
    const text = describeWindow({
      start: businessLocalTime(2026, 7, 23, 8, 0),
      end: businessLocalTime(2026, 7, 23, 12, 0),
      label: "morning",
    });
    expect(text).toContain("Thursday");
    expect(text).toContain("23 July");
    expect(text).toContain("morning");
    expect(text).toContain("between eight and twelve");
  });
});
