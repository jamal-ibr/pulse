/**
 * Practice opening hours and appointment slot generation.
 *
 * Deterministic on purpose: the model is never asked to work out whether
 * a time is inside opening hours. It only ever reads back slots this
 * module has already decided are genuinely bookable.
 */

export const PRACTICE_TIMEZONE = "Europe/London";

/** Slot length in minutes. */
export const SLOT_MINUTES = 30;

/**
 * Weekday opening hours in practice-local time (24h).
 * Appointments must FINISH by closingHour:closingMinute, so the last
 * bookable start is that time minus SLOT_MINUTES.
 * Weekends are closed for routine appointments - emergencies only.
 */
export const OPENING_HOURS = {
  weekdays: { openHour: 9, openMinute: 0, closeHour: 18, closeMinute: 30 },
  saturday: null,
  sunday: null,
} as const;

/** How far ahead to offer appointments. */
export const DAYS_AHEAD = 5;

/** Don't offer a slot starting sooner than this from now. */
export const MIN_LEAD_MINUTES = 60;

export interface Slot {
  /** Exact start instant. */
  start: Date;
  /** Exact end instant. */
  end: Date;
}

/**
 * Offset between UTC and the practice timezone at a given instant,
 * in milliseconds. Handles BST/GMT automatically.
 */
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

/** Build the instant for a given practice-local wall-clock time. */
export function practiceLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMs(guess, PRACTICE_TIMEZONE);
  return new Date(guess.getTime() - offset);
}

/** Practice-local calendar parts for an instant. */
export function practiceLocalParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Sunday
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
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

/** True when the practice is open for routine appointments at this instant. */
export function isWithinOpeningHours(instant: Date): boolean {
  const { year, month, day, weekday } = practiceLocalParts(instant);
  if (weekday === 0 || weekday === 6) return false; // weekend: emergencies only

  const { openHour, openMinute, closeHour, closeMinute } = OPENING_HOURS.weekdays;
  const open = practiceLocalTime(year, month, day, openHour, openMinute);
  const close = practiceLocalTime(year, month, day, closeHour, closeMinute);
  return instant >= open && instant < close;
}

/**
 * Every slot the practice could theoretically offer over the next
 * DAYS_AHEAD days, before busy times are subtracted.
 */
export function generateCandidateSlots(now: Date = new Date()): Slot[] {
  const slots: Slot[] = [];
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const { openHour, openMinute, closeHour, closeMinute } = OPENING_HOURS.weekdays;

  for (let dayOffset = 0; dayOffset <= DAYS_AHEAD; dayOffset++) {
    const dayAnchor = new Date(now.getTime() + dayOffset * 24 * 60 * 60_000);
    const { year, month, day, weekday } = practiceLocalParts(dayAnchor);
    if (weekday === 0 || weekday === 6) continue; // closed for routine care

    const dayOpen = practiceLocalTime(year, month, day, openHour, openMinute);
    const dayClose = practiceLocalTime(year, month, day, closeHour, closeMinute);

    for (
      let start = dayOpen;
      start.getTime() + SLOT_MINUTES * 60_000 <= dayClose.getTime();
      start = new Date(start.getTime() + SLOT_MINUTES * 60_000)
    ) {
      if (start < earliest) continue;
      slots.push({ start, end: new Date(start.getTime() + SLOT_MINUTES * 60_000) });
    }
  }
  return slots;
}

/** Human, speakable rendering of a slot, e.g. "Thursday 24 July at 9:30am". */
export function describeSlot(slot: Slot): string {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRACTICE_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return dtf.format(slot.start).replace(/\s?(am|pm)/i, (m) => m.toLowerCase().trim());
}
