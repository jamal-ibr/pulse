// Habit and health target rules. Pure functions, unit-tested.

export const TARGETS = {
  SALAH_PER_DAY: 5,
  PROTEIN_G: 170,
  KCAL_MIN: 1700,
  KCAL_MAX: 2000,
  PHONE_HOURS_MAX: 4,
  DEEP_WORK_BLOCKS: 2,
  SLEEP_HOURS_MIN: 7,
  LIGHTS_OUT_TARGET: "23:00",
  LIGHTS_OUT_LATE_AFTER: "23:30",
} as const;

export function proteinMet(proteinG: number | null | undefined): boolean {
  return proteinG != null && proteinG >= TARGETS.PROTEIN_G;
}

export function kcalInBand(kcal: number | null | undefined): boolean {
  return kcal != null && kcal >= TARGETS.KCAL_MIN && kcal <= TARGETS.KCAL_MAX;
}

export function phoneTargetMet(hours: number | null | undefined): boolean {
  return hours != null && hours < TARGETS.PHONE_HOURS_MAX;
}

export function sleepTargetMet(hours: number | null | undefined): boolean {
  return hours != null && hours >= TARGETS.SLEEP_HOURS_MIN;
}

export function deepWorkTargetMet(blocks: number | null | undefined): boolean {
  return blocks != null && blocks >= TARGETS.DEEP_WORK_BLOCKS;
}

export function salahTargetMet(count: number | null | undefined): boolean {
  return count != null && count >= TARGETS.SALAH_PER_DAY;
}

// Lights out is late if strictly after 23:30. Times between 00:00 and 12:00
// are treated as after midnight, which is late by definition.
export function lightsOutLate(time: string | null | undefined): boolean {
  if (!time) return false;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 12) return true; // past midnight counts as late
  return hours > 23 || (hours === 23 && minutes > 30);
}

export interface DayLog {
  salahCount?: number | null;
  proteinG?: number | null;
  kcal?: number | null;
  phoneScreenHours?: number | null;
  deepWorkBlocks?: number | null;
  sleepHours?: number | null;
  lightsOutTime?: string | null;
}

export interface DayCompliance {
  salah: boolean;
  protein: boolean;
  kcal: boolean;
  phone: boolean;
  deepWork: boolean;
  sleep: boolean;
  lightsOut: boolean;
  metCount: number;
  totalCount: number;
}

export function dayCompliance(log: DayLog): DayCompliance {
  const checks = {
    salah: salahTargetMet(log.salahCount),
    protein: proteinMet(log.proteinG),
    kcal: kcalInBand(log.kcal),
    phone: phoneTargetMet(log.phoneScreenHours),
    deepWork: deepWorkTargetMet(log.deepWorkBlocks),
    sleep: sleepTargetMet(log.sleepHours),
    lightsOut: !!log.lightsOutTime && !lightsOutLate(log.lightsOutTime),
  };
  const metCount = Object.values(checks).filter(Boolean).length;
  return { ...checks, metCount, totalCount: 7 };
}
