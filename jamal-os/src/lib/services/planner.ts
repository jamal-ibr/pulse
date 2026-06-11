// Day planner. Drafts time blocks around existing calendar events,
// respects salah windows, prioritises Pulse outreach when the pipeline is
// under target, protects one deep work block, includes training and a
// shutdown routine.

import { db, schema } from "@/db/client";
import { and, gte, lte, asc } from "drizzle-orm";
import { todayIso } from "@/lib/dates";
import { getBirminghamPrayerTimes } from "@/lib/prayer-times";
import { getPipelineMetrics } from "./pipeline";
import { pulseHardRuleTriggered } from "@/lib/avoidance";

export interface PlannedBlock {
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
  kind: "outreach" | "deep_work" | "training" | "salah" | "shutdown" | "admin" | "existing";
  warning?: string;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export async function planDay(): Promise<{
  blocks: PlannedBlock[];
  warnings: string[];
  prayerTimes: ReturnType<typeof getBirminghamPrayerTimes>;
}> {
  const today = todayIso();
  const prayerTimes = getBirminghamPrayerTimes();
  const metrics = await getPipelineMetrics();
  const underTarget = pulseHardRuleTriggered(metrics.contactedCount);

  const existing = await db.query.calendarEvents.findMany({
    where: and(
      gte(schema.calendarEvents.start, `${today}T00:00`),
      lte(schema.calendarEvents.start, `${today}T23:59`),
    ),
    orderBy: asc(schema.calendarEvents.start),
  });

  const busy: Array<[number, number]> = existing.map((e) => [
    toMinutes(e.start.slice(11, 16)),
    toMinutes(e.end.slice(11, 16)),
  ]);

  const overlapsBusy = (start: number, end: number) =>
    busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart);

  const blocks: PlannedBlock[] = [];
  const warnings: string[] = [];

  // Salah anchors first. Work fits around them, not the reverse.
  for (const [name, time] of Object.entries(prayerTimes)) {
    blocks.push({
      title: `${name.charAt(0).toUpperCase()}${name.slice(1)} prayer`,
      start: time,
      end: toTime(toMinutes(time) + 20),
      kind: "salah",
    });
  }

  // Find a free slot of the given length between two clock times.
  const findSlot = (length: number, earliest: string, latest: string): [number, number] | null => {
    const planned = blocks.map((b) => [toMinutes(b.start), toMinutes(b.end)] as [number, number]);
    const taken = [...busy, ...planned];
    for (let start = toMinutes(earliest); start + length <= toMinutes(latest); start += 15) {
      const end = start + length;
      if (!taken.some(([s, e]) => start < e && end > s)) return [start, end];
    }
    return null;
  };

  // Outreach block: first priority when under target, before work hours
  // if possible.
  const outreachSlot = findSlot(45, "07:00", "21:00");
  if (outreachSlot) {
    blocks.push({
      title: underTarget
        ? "Pulse outreach (priority: under 5 contacted)"
        : "Pulse outreach block",
      start: toTime(outreachSlot[0]),
      end: toTime(outreachSlot[1]),
      kind: "outreach",
    });
  } else {
    warnings.push("No free slot found for Pulse outreach. The day is overcommitted.");
  }

  // One protected deep work block.
  const deepSlot = findSlot(90, "07:00", "21:30");
  if (deepSlot) {
    blocks.push({
      title: "Deep work (protected)",
      start: toTime(deepSlot[0]),
      end: toTime(deepSlot[1]),
      kind: "deep_work",
    });
  } else {
    warnings.push("No 90-minute deep work slot available. Cut something.");
  }

  // Training or recovery.
  const trainingSlot = findSlot(60, "06:00", "21:30");
  if (trainingSlot) {
    blocks.push({
      title: "Training: stairmaster or upper strength (no running until cleared)",
      start: toTime(trainingSlot[0]),
      end: toTime(trainingSlot[1]),
      kind: "training",
    });
  }

  // Shutdown routine to protect the 23:00 lights-out target.
  blocks.push({
    title: "Shutdown routine: phone out of bedroom, lights out 23:00",
    start: "22:15",
    end: "23:00",
    kind: "shutdown",
  });

  // Overcommitment detection.
  const committedMinutes = busy.reduce((sum, [s, e]) => sum + (e - s), 0);
  if (committedMinutes > 10 * 60) {
    warnings.push("Calendar already holds over 10 hours of commitments. Overcommitment risk.");
  }
  if (underTarget) {
    warnings.push("Pipeline under 5 contacted. Outreach comes before any build or polish work.");
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  return { blocks, warnings, prayerTimes };
}

export async function createPlannedBlocks(blocks: Array<{ title: string; start: string; end: string }>) {
  const today = todayIso();
  for (const block of blocks) {
    await db.insert(schema.calendarEvents).values({
      title: block.title,
      start: `${today}T${block.start}`,
      end: `${today}T${block.end}`,
      sourceProvider: "local",
      writeStatus: "local_only",
    });
  }
  await db.insert(schema.auditLogs).values({
    action: "planned_blocks_created",
    target: "local_calendar",
    detail: `${blocks.length} blocks created locally`,
    isExternalWrite: false,
    confirmed: true,
  });
}
