import { db, schema } from "@/db/client";
import { desc, gte, eq } from "drizzle-orm";
import { daysAgoIso } from "@/lib/dates";
import {
  dayCompliance,
  proteinMet,
  kcalInBand,
  salahTargetMet,
  lightsOutLate,
  phoneTargetMet,
  deepWorkTargetMet,
} from "@/lib/targets";

export async function getRecentHabitLogs(days = 7) {
  return db.query.habitLogs.findMany({
    where: gte(schema.habitLogs.date, daysAgoIso(days)),
    orderBy: desc(schema.habitLogs.date),
  });
}

export async function getLogForDate(date: string) {
  return db.query.habitLogs.findFirst({ where: eq(schema.habitLogs.date, date) });
}

export async function getSleepForDate(date: string) {
  return db.query.sleepLogs.findFirst({ where: eq(schema.sleepLogs.date, date) });
}

export async function getRecentSleep(days = 7) {
  return db.query.sleepLogs.findMany({
    where: gte(schema.sleepLogs.date, daysAgoIso(days)),
    orderBy: desc(schema.sleepLogs.date),
  });
}

export async function getWeightTrend(days = 30) {
  return db.query.weightLogs.findMany({
    where: gte(schema.weightLogs.date, daysAgoIso(days)),
    orderBy: desc(schema.weightLogs.date),
  });
}

export interface WeekHabitSummary {
  proteinMissedDays: number;
  kcalOverDays: number;
  salahBelowTargetDays: number;
  lateLightsOutCount: number;
  phoneOver6HoursDays: number;
  missedDeepWorkDays: number;
  pagesReadTotal: number;
  phoneHoursAvg: number;
  loggedDays: number;
}

export async function getWeekHabitSummary(): Promise<WeekHabitSummary> {
  const logs = await getRecentHabitLogs(7);
  const sleep = await getRecentSleep(7);

  const phoneTotal = logs.reduce((sum, l) => sum + (l.phoneScreenHours ?? 0), 0);
  return {
    proteinMissedDays: logs.filter((l) => !proteinMet(l.proteinG)).length,
    kcalOverDays: logs.filter((l) => l.kcal != null && l.kcal > 2000).length,
    salahBelowTargetDays: logs.filter((l) => !salahTargetMet(l.salahCount)).length,
    lateLightsOutCount: sleep.filter((s) => lightsOutLate(s.lightsOutTime)).length,
    phoneOver6HoursDays: logs.filter(
      (l) => l.phoneScreenHours != null && l.phoneScreenHours > 6,
    ).length,
    missedDeepWorkDays: logs.filter((l) => !deepWorkTargetMet(l.deepWorkBlocks)).length,
    pagesReadTotal: logs.reduce((sum, l) => sum + (l.pagesRead ?? 0), 0),
    phoneHoursAvg: logs.length > 0 ? phoneTotal / logs.length : 0,
    loggedDays: logs.length,
  };
}

export interface HabitGap {
  habit: string;
  detail: string;
}

export async function getYesterdayGaps(): Promise<HabitGap[]> {
  const yesterday = daysAgoIso(1);
  const log = await getLogForDate(yesterday);
  const sleep = await getSleepForDate(yesterday);
  const gaps: HabitGap[] = [];

  if (!log) {
    return [{ habit: "All", detail: "Yesterday was not logged at all. Unlogged counts as missed." }];
  }
  if (!salahTargetMet(log.salahCount))
    gaps.push({ habit: "Salah", detail: `${log.salahCount ?? 0}/5 logged` });
  if (!proteinMet(log.proteinG))
    gaps.push({ habit: "Protein", detail: `${log.proteinG ?? 0}g of 170g` });
  if (!kcalInBand(log.kcal))
    gaps.push({ habit: "Calories", detail: `${log.kcal ?? "unlogged"} vs 1700-2000 band` });
  if (!phoneTargetMet(log.phoneScreenHours))
    gaps.push({ habit: "Phone", detail: `${log.phoneScreenHours ?? "unlogged"}h vs under 4h` });
  if (!deepWorkTargetMet(log.deepWorkBlocks))
    gaps.push({ habit: "Deep work", detail: `${log.deepWorkBlocks ?? 0}/2 blocks` });
  if (sleep && lightsOutLate(sleep.lightsOutTime))
    gaps.push({ habit: "Lights out", detail: `${sleep.lightsOutTime}, target 23:00` });
  return gaps;
}

export function complianceForLog(log: {
  salahCount: number | null;
  proteinG: number | null;
  kcal: number | null;
  phoneScreenHours: number | null;
  deepWorkBlocks: number | null;
}, sleep?: { sleepHours: number | null; lightsOutTime: string | null } | null) {
  return dayCompliance({
    ...log,
    sleepHours: sleep?.sleepHours,
    lightsOutTime: sleep?.lightsOutTime,
  });
}
