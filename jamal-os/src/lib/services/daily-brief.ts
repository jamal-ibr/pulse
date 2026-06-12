// Daily Brief aggregation. The Pulse hard rule is coded here, never
// delegated to the AI.

import { db, schema } from "@/db/client";
import { and, eq, gte, lte, ne, asc } from "drizzle-orm";
import { todayIso, daysAgoIso } from "@/lib/dates";
import { getPipelineMetrics, type PipelineMetrics } from "./pipeline";
import { getYesterdayGaps, getWeightTrend, getSleepForDate, type HabitGap } from "./habits";
import { takeawayRolling30 } from "@/lib/spending-logic";
import { pulseHardRuleTriggered, PULSE_HARD_RULE_MESSAGE } from "@/lib/avoidance";
import { complete } from "@/lib/ai/provider";

export interface DailyBriefData {
  todayEvents: Array<{ id: number; title: string; start: string; end: string; location: string | null }>;
  tasksDueToday: Array<typeof schema.tasks.$inferSelect>;
  scaryTasks: Array<typeof schema.tasks.$inferSelect>;
  overdueTasks: Array<typeof schema.tasks.$inferSelect>;
  habitGaps: HabitGap[];
  sleep: { sleepHours: number | null; lightsOutTime: string | null } | null;
  weightTrend: Array<{ date: string; weightKg: number }>;
  pipeline: PipelineMetrics;
  pipelineOverdue: Array<{ id: number; practiceName: string; nextFollowUp: string | null }>;
  contactsOverdue: Array<{ id: number; name: string; daysOverdue: number }>;
  takeawayRolling30: number;
  topProject: { id: number; name: string; nextAction: string } | null;
  hardRuleTriggered: boolean;
  hardRuleMessage: string;
  briefText: string;
  briefProvider: string;
}

export async function getDailyBriefData(): Promise<DailyBriefData> {
  const today = todayIso();

  const todayEvents = await db.query.calendarEvents.findMany({
    where: and(
      gte(schema.calendarEvents.start, `${today}T00:00`),
      lte(schema.calendarEvents.start, `${today}T23:59`),
    ),
    orderBy: asc(schema.calendarEvents.start),
  });

  const openTasks = await db.query.tasks.findMany({
    where: ne(schema.tasks.status, "done"),
    orderBy: asc(schema.tasks.dueDate),
  });
  const tasksDueToday = openTasks.filter((t) => t.dueDate === today);
  const overdueTasks = openTasks.filter((t) => t.dueDate != null && t.dueDate < today);
  const scaryTasks = [...openTasks]
    .sort((a, b) => b.scariness - a.scariness || b.deferCount - a.deferCount)
    .slice(0, 3);

  const habitGaps = await getYesterdayGaps();
  const sleep = (await getSleepForDate(daysAgoIso(1))) ?? null;
  const weightTrend = await getWeightTrend(14);

  const pipeline = await getPipelineMetrics();
  const pipelineRows = await db.query.pipeline.findMany();
  const pipelineOverdue = pipelineRows
    .filter(
      (r) =>
        r.nextFollowUp != null &&
        r.nextFollowUp < today &&
        !["won", "lost"].includes(r.stage),
    )
    .map((r) => ({ id: r.id, practiceName: r.practiceName, nextFollowUp: r.nextFollowUp }));

  const allContacts = await db.query.contacts.findMany();
  const contactsOverdue = allContacts
    .filter((c) => c.lastContact != null)
    .map((c) => {
      const due = new Date(c.lastContact + "T00:00:00Z");
      due.setDate(due.getDate() + c.followUpCadenceDays);
      const daysOverdue = Math.floor(
        (new Date(today + "T00:00:00Z").getTime() - due.getTime()) / 86400000,
      );
      return { id: c.id, name: c.name, daysOverdue };
    })
    .filter((c) => c.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const spendRows = await db.query.spending.findMany({
    where: gte(schema.spending.date, daysAgoIso(31)),
  });
  const takeaway30 = takeawayRolling30(
    spendRows.map((r) => ({
      date: r.date,
      amount: r.amount,
      category: r.category,
      isBusiness: r.isBusiness,
    })),
    today,
  );

  const pulseProject = await db.query.projects.findFirst({
    where: eq(schema.projects.name, "Pulse AI outreach"),
  });
  const topProject = pulseProject
    ? { id: pulseProject.id, name: pulseProject.name, nextAction: pulseProject.nextAction }
    : null;

  const hardRule = pulseHardRuleTriggered(pipeline.contactedCount);

  // Build structured facts for the AI prompt. The AI receives facts only.
  const facts = [
    `date: ${today}`,
    `pulse_hard_rule_triggered: ${hardRule}`,
    `contacted_count: ${pipeline.contactedCount}`,
    `outreach_this_week: ${pipeline.outreachThisWeek}`,
    `days_since_last_outreach: ${pipeline.daysSinceLastOutreach ?? "never"}`,
    `follow_ups_overdue: ${pipeline.followUpsOverdue}`,
    `tasks_due_today: ${tasksDueToday.map((t) => t.title).join("; ") || "none"}`,
    `overdue_count: ${overdueTasks.length}`,
    `scariest_task: ${scaryTasks[0] ? `${scaryTasks[0].title} (scariness ${scaryTasks[0].scariness}, deferred ${scaryTasks[0].deferCount}x)` : "none"}`,
    `yesterday_habit_gaps: ${habitGaps.map((g) => `${g.habit}: ${g.detail}`).join("; ") || "none"}`,
    `sleep_last_night: ${sleep?.sleepHours ?? "unlogged"}h, lights out ${sleep?.lightsOutTime ?? "unlogged"}`,
    `weight_latest: ${weightTrend[0]?.weightKg ?? "unlogged"}kg`,
    `takeaway_rolling_30d: ${takeaway30}`,
    `contacts_overdue: ${contactsOverdue.map((c) => c.name).join("; ") || "none"}`,
    `today_calendar: ${todayEvents.map((e) => e.title).join("; ") || "empty"}`,
  ].join("\n");

  const { output, provider } = await complete("chief-of-staff", facts);

  // Hard rule applied in code: the brief opens with the Pulse message.
  const briefText = hardRule ? `${PULSE_HARD_RULE_MESSAGE}\n\n${output}` : output;

  return {
    todayEvents: todayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
    })),
    tasksDueToday,
    scaryTasks,
    overdueTasks,
    habitGaps,
    sleep: sleep ? { sleepHours: sleep.sleepHours, lightsOutTime: sleep.lightsOutTime } : null,
    weightTrend: weightTrend.map((w) => ({ date: w.date, weightKg: w.weightKg })),
    pipeline,
    pipelineOverdue,
    contactsOverdue,
    takeawayRolling30: takeaway30,
    topProject,
    hardRuleTriggered: hardRule,
    hardRuleMessage: PULSE_HARD_RULE_MESSAGE,
    briefText,
    briefProvider: provider,
  };
}
