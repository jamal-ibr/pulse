// Weekly review. Avoidance flags are computed in code first, then passed
// to the AI as facts. Missing data scores low; nothing is inflated.

import { db, schema } from "@/db/client";
import { ne, gte, desc } from "drizzle-orm";
import { computeAvoidanceFlags, type AvoidanceFlag } from "@/lib/avoidance";
import { getPipelineMetrics } from "./pipeline";
import { getWeekHabitSummary } from "./habits";
import { complete } from "@/lib/ai/provider";
import { todayIso, daysAgoIso, weekStartIso } from "@/lib/dates";

export interface WeeklyFacts {
  flags: AvoidanceFlag[];
  pillarScores: Record<string, number>;
  factsText: string;
}

export async function gatherWeeklyFacts(): Promise<WeeklyFacts> {
  const today = todayIso();

  const openTasks = await db.query.tasks.findMany({
    where: ne(schema.tasks.status, "done"),
  });
  const projects = await db.query.projects.findMany();
  const pipelineMetrics = await getPipelineMetrics();
  const habits = await getWeekHabitSummary();

  const spendRows = await db.query.spending.findMany({
    where: gte(schema.spending.date, daysAgoIso(14)),
  });
  const weekStart7 = daysAgoIso(7);
  const takeawayThisWeek = spendRows.filter(
    (r) => r.category === "takeaway" && r.date >= weekStart7,
  ).length;
  const takeawayLastWeek = spendRows.filter(
    (r) => r.category === "takeaway" && r.date < weekStart7,
  ).length;

  const buildIdeas = await db.query.buildQueue.findMany({
    where: gte(schema.buildQueue.createdAt, daysAgoIso(7)),
  });
  const lateIdeas = buildIdeas.filter((idea) => {
    const hour = new Date(idea.createdAt).getHours();
    const minutes = new Date(idea.createdAt).getMinutes();
    return hour > 22 || (hour === 22 && minutes >= 30);
  }).length;

  const flags = computeAvoidanceFlags({
    tasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      scariness: t.scariness,
      deferCount: t.deferCount,
      status: t.status,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      lastActivityAt: p.lastActivityAt,
    })),
    pipeline: {
      contactedCount: pipelineMetrics.contactedCount,
      daysSinceLastOutreach: pipelineMetrics.daysSinceLastOutreach,
      untouchedContactsOver5Days: pipelineMetrics.untouchedOver5Days,
      overdueFollowUps: pipelineMetrics.followUpsOverdue,
    },
    habits,
    spending: { takeawayThisWeek, takeawayLastWeek },
    buildQueue: {
      ideasAddedAfter2230ThisWeek: lateIdeas,
      ideasAddedThisWeek: buildIdeas.length,
      outreachSentThisWeek: pipelineMetrics.outreachThisWeek,
    },
  });

  // Pillar scores out of 10, computed conservatively from logged data.
  // Unlogged days count against the score (denominator is always 7).
  const score10 = (met: number, possible: number) =>
    Math.round((met / Math.max(possible, 1)) * 10);

  const pillarScores: Record<string, number> = {
    faith: score10(7 - habits.salahBelowTargetDays, 7),
    body: score10(
      7 - habits.proteinMissedDays + (7 - habits.kcalOverDays),
      14,
    ),
    mind: score10(
      (habits.pagesReadTotal > 0 ? 3 : 0) + (7 - habits.missedDeepWorkDays),
      10,
    ),
    career: 5, // No EY-specific logging yet. Neutral midpoint, noted in output.
    wealth: takeawayThisWeek <= 2 ? 7 : takeawayThisWeek <= 4 ? 5 : 3,
    character: score10(7 - habits.lateLightsOutCount - (habits.phoneOver6HoursDays > 2 ? 2 : 0), 7),
    systems: pipelineMetrics.outreachThisWeek >= 5 ? 8 : pipelineMetrics.outreachThisWeek >= 1 ? 5 : 2,
  };
  for (const key of Object.keys(pillarScores)) {
    pillarScores[key] = Math.max(0, Math.min(10, pillarScores[key]));
  }

  const factsText = [
    `week_ending: ${today}`,
    `logged_habit_days: ${habits.loggedDays}/7`,
    `outreach_sent_this_week: ${pipelineMetrics.outreachThisWeek}`,
    `contacted_count: ${pipelineMetrics.contactedCount}`,
    `days_since_last_outreach: ${pipelineMetrics.daysSinceLastOutreach ?? "never"}`,
    `protein_missed_days: ${habits.proteinMissedDays}`,
    `kcal_over_days: ${habits.kcalOverDays}`,
    `salah_below_target_days: ${habits.salahBelowTargetDays}`,
    `late_lights_out_count: ${habits.lateLightsOutCount}`,
    `phone_hours_avg: ${habits.phoneHoursAvg.toFixed(1)}`,
    `pages_read_total: ${habits.pagesReadTotal}`,
    `takeaway_this_week: ${takeawayThisWeek} (last week ${takeawayLastWeek})`,
    `build_ideas_this_week: ${buildIdeas.length} (${lateIdeas} after 22:30)`,
    `career_note: no EY-specific logs exist yet, career scored neutral 5/10`,
    "",
    "avoidance_flags (computed in code, treat as facts):",
    ...flags.map((f) => `- [${f.severity}] ${f.code}: ${f.message} (${f.evidence})`),
    "",
    "pillar_scores_out_of_10 (computed from logged data):",
    ...Object.entries(pillarScores).map(([k, v]) => `- ${k}: ${v}/10`),
  ].join("\n");

  return { flags, pillarScores, factsText };
}

export async function generateWeeklyReview(): Promise<number> {
  const facts = await gatherWeeklyFacts();
  const { output } = await complete("weekly-review", facts.factsText);

  // Commitment: last non-empty line of the AI output as a default; the
  // mock provider always ends with one.
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
  const commitment =
    lines.find((l) => l.toLowerCase().startsWith("commitment")) ??
    "Send outreach to five practices before doing any build queue work.";

  const [row] = await db
    .insert(schema.weeklyReviews)
    .values({
      weekStart: weekStartIso(),
      weekEnd: todayIso(),
      aiSummary: output,
      avoidanceFlagsJson: JSON.stringify(facts.flags),
      pillarScoresJson: JSON.stringify(facts.pillarScores),
      commitment,
    })
    .returning();
  return row.id;
}

export async function getPastReviews() {
  return db.query.weeklyReviews.findMany({
    orderBy: desc(schema.weeklyReviews.createdAt),
  });
}
