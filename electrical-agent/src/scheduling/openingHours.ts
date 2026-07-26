import { config } from "../config.js";

/**
 * Working hours and engineer arrival windows.
 *
 * Trades give arrival windows, not precise appointment times, because jobs
 * overrun. So availability is expressed as "Tuesday morning, between eight
 * and twelve" rather than "Tuesday at 09:30".
 *
 * Deterministic on purpose: the model never decides whether a time is
 * inside working hours. It only reads back windows this module has already
 * decided are genuinely bookable.
 */

export const BUSINESS_TIMEZONE = "Europe/London";

export interface WindowTemplate {
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/** Arrival windows offered on a normal working weekday. */
export const WEEKDAY_WINDOWS: WindowTemplate[] = [
  { label: "morning", startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { label: "afternoon", startHour: 12, startMinute: 0, endHour: 17, endMinute: 0 },
];

/** Saturday: morning only. Sunday: emergencies only, no routine bookings. */
export const SATURDAY_WINDOWS: WindowTemplate[] = [
  { label: "morning", startHour: 8, startMinute: 0, endHour: 13, endMinute: 0 },
];

export const DAYS_AHEAD = 7;

/** Don't offer a window starting sooner than this from now. */
export const MIN_LEAD_MINUTES = 90;

export interface ArrivalWindow {
  start: Date;
  end: Date;
  label: string;
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - instant.getTime();
}

/** Build the instant for a given business-local wall-clock time (BST safe). */
export function businessLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Date(guess.getTime() - tzOffsetMs(guess, BUSINESS_TIMEZONE));
}

export function businessLocalParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Sunday
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

export function windowsForWeekday(weekday: number): WindowTemplate[] {
  if (weekday === 0) return []; // Sunday: emergencies only
  if (weekday === 6) return SATURDAY_WINDOWS;
  return WEEKDAY_WINDOWS;
}

/** True when the business is open for routine (non-emergency) work. */
export function isWithinWorkingHours(instant: Date): boolean {
  const { year, month, day, weekday } = businessLocalParts(instant);
  return windowsForWeekday(weekday).some((w) => {
    const start = businessLocalTime(year, month, day, w.startHour, w.startMinute);
    const end = businessLocalTime(year, month, day, w.endHour, w.endMinute);
    return instant >= start && instant < end;
  });
}

/** Every arrival window the business could offer over the next DAYS_AHEAD days. */
export function generateCandidateWindows(now: Date = new Date()): ArrivalWindow[] {
  const windows: ArrivalWindow[] = [];
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);

  for (let dayOffset = 0; dayOffset <= DAYS_AHEAD; dayOffset++) {
    const anchor = new Date(now.getTime() + dayOffset * 24 * 60 * 60_000);
    const { year, month, day, weekday } = businessLocalParts(anchor);

    for (const template of windowsForWeekday(weekday)) {
      const start = businessLocalTime(year, month, day, template.startHour, template.startMinute);
      const end = businessLocalTime(year, month, day, template.endHour, template.endMinute);
      // Skip windows already underway or too soon to staff.
      if (start < earliest) continue;
      windows.push({ start, end, label: template.label });
    }
  }
  return windows;
}

/**
 * How many engineers are already committed during a window. A window is
 * bookable while fewer than ENGINEER_CAPACITY jobs overlap it, so a diary
 * with three engineers can take three simultaneous jobs.
 */
export function overlappingJobCount(
  window: ArrivalWindow,
  busy: { start: Date; end: Date }[],
): number {
  return busy.filter((b) => window.start < b.end && window.end > b.start).length;
}

export function hasCapacity(window: ArrivalWindow, busy: { start: Date; end: Date }[]): boolean {
  return overlappingJobCount(window, busy) < config.engineerCapacity;
}

/** Speakable description, e.g. "Tuesday 28 July, morning (between eight and twelve)". */
export function describeWindow(window: ArrivalWindow): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(window.start);

  const spoken = (d: Date): string => {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIMEZONE,
        hour: "numeric",
        hour12: true,
      })
        .format(d)
        .replace(/\D/g, ""),
    );
    const words = [
      "twelve",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
    ];
    return words[hour % 12];
  };

  return `${day}, ${window.label} (between ${spoken(window.start)} and ${spoken(window.end)})`;
}
