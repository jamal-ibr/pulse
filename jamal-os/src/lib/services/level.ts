// Level service. Computes conservative pillar scores from logged evidence
// over a rolling 4-week window, dampens jumps, and snapshots.

import { db, schema } from "@/db/client";
import { gte, desc } from "drizzle-orm";
import {
  computePillarScore,
  computeOverallLevel,
  dampenLevelJump,
  levelBandLabel,
  type PillarKey,
} from "@/lib/level";
import { daysAgoIso, todayIso } from "@/lib/dates";
import {
  proteinMet,
  kcalInBand,
  salahTargetMet,
  phoneTargetMet,
  deepWorkTargetMet,
} from "@/lib/targets";
import { getPipelineMetrics } from "./pipeline";

export interface PillarDetail {
  key: PillarKey;
  name: string;
  score: number;
  band: string;
  evidence: string;
  missingDataNote: string | null;
  raisedBy: string;
  loweredBy: string;
  nextAction: string;
}

const WINDOW_DAYS = 28;

export async function computeLevelState() {
  const logs = await db.query.habitLogs.findMany({
    where: gte(schema.habitLogs.date, daysAgoIso(WINDOW_DAYS)),
  });
  const readingLogs = await db.query.readingLogs.findMany({
    where: gte(schema.readingLogs.date, daysAgoIso(WINDOW_DAYS)),
  });
  const spending = await db.query.spending.findMany({
    where: gte(schema.spending.date, daysAgoIso(WINDOW_DAYS)),
  });
  const pipelineMetrics = await getPipelineMetrics();
  const weights = await db.query.weightLogs.findMany({
    where: gte(schema.weightLogs.date, daysAgoIso(WINDOW_DAYS)),
    orderBy: desc(schema.weightLogs.date),
  });

  const loggedDays = logs.length;
  const completeness = Math.min(loggedDays / WINDOW_DAYS, 1);
  const consistentWeeks = Math.floor(loggedDays / 7);

  const rate = (met: number) => (loggedDays > 0 ? met / loggedDays : 0);

  const faithCompliance = rate(logs.filter((l) => salahTargetMet(l.salahCount)).length);
  const bodyCompliance =
    (rate(logs.filter((l) => proteinMet(l.proteinG)).length) +
      rate(logs.filter((l) => kcalInBand(l.kcal)).length) +
      rate(logs.filter((l) => l.trainingSession != null && l.trainingSession !== "").length)) /
    3;
  const mindCompliance =
    (rate(logs.filter((l) => deepWorkTargetMet(l.deepWorkBlocks)).length) +
      rate(logs.filter((l) => (l.pagesRead ?? 0) > 0).length)) /
    2;
  const characterCompliance =
    (rate(logs.filter((l) => phoneTargetMet(l.phoneScreenHours)).length) +
      rate(logs.filter((l) => salahTargetMet(l.salahCount)).length)) /
    2;

  const takeawayCount = spending.filter((s) => s.category === "takeaway").length;
  const wealthCompliance = takeawayCount <= 6 ? 0.7 : takeawayCount <= 12 ? 0.4 : 0.2;

  const outreachEvidence =
    pipelineMetrics.outreachThisWeek >= 5
      ? 0.8
      : pipelineMetrics.outreachThisWeek >= 1
        ? 0.45
        : 0.1;

  const scores: Record<PillarKey, number> = {
    faith: computePillarScore({ dataCompleteness: completeness, complianceRate: faithCompliance, consistentWeeks }),
    body: computePillarScore({ dataCompleteness: completeness, complianceRate: bodyCompliance, consistentWeeks }),
    mind: computePillarScore({ dataCompleteness: completeness, complianceRate: mindCompliance, consistentWeeks }),
    // Career has no logging source yet: scored on thin evidence, capped low.
    career: computePillarScore({ dataCompleteness: 0.4, complianceRate: 0.6, consistentWeeks: Math.min(consistentWeeks, 2) }),
    wealth: computePillarScore({ dataCompleteness: spending.length > 0 ? 0.8 : 0.1, complianceRate: wealthCompliance, consistentWeeks }),
    character: computePillarScore({ dataCompleteness: completeness, complianceRate: characterCompliance, consistentWeeks }),
    systems: computePillarScore({ dataCompleteness: 0.9, complianceRate: outreachEvidence, consistentWeeks: Math.min(consistentWeeks, 3) }),
  };

  const previous = await db.query.levelSnapshots.findMany({
    orderBy: desc(schema.levelSnapshots.createdAt),
  });
  const previousLevel = previous[0]?.overallLevel ?? null;
  const raw = computeOverallLevel(scores);
  const overallLevel = dampenLevelJump(previousLevel, raw.overallLevel);

  const details: PillarDetail[] = [
    {
      key: "faith",
      name: "Faith",
      score: scores.faith,
      band: levelBandLabel(scores.faith),
      evidence: `Salah at 5/5 on ${logs.filter((l) => salahTargetMet(l.salahCount)).length}/${loggedDays} logged days (28-day window).`,
      missingDataNote: loggedDays < WINDOW_DAYS ? `${WINDOW_DAYS - loggedDays} unlogged days penalised.` : null,
      raisedBy: "Consistent 5/5 salah days",
      loweredBy: "Days below 5 and unlogged days",
      nextAction: "Log salah daily and protect the two weakest prayer windows.",
    },
    {
      key: "body",
      name: "Body",
      score: scores.body,
      band: levelBandLabel(scores.body),
      evidence: `Protein met ${logs.filter((l) => proteinMet(l.proteinG)).length}/${loggedDays}, kcal in band ${logs.filter((l) => kcalInBand(l.kcal)).length}/${loggedDays}, training logged ${logs.filter((l) => l.trainingSession).length}/${loggedDays}. Latest weight ${weights[0]?.weightKg ?? "unlogged"}kg.`,
      missingDataNote: loggedDays < WINDOW_DAYS ? "Unlogged days count against the score." : null,
      raisedBy: "Protein compliance and training consistency",
      loweredBy: "Protein misses, kcal over band",
      nextAction: "Hit 170g protein for 7 consecutive days.",
    },
    {
      key: "mind",
      name: "Mind",
      score: scores.mind,
      band: levelBandLabel(scores.mind),
      evidence: `Deep work target met ${logs.filter((l) => deepWorkTargetMet(l.deepWorkBlocks)).length}/${loggedDays} days. Reading sessions: ${readingLogs.length} in 28 days.`,
      missingDataNote: null,
      raisedBy: "Deep work blocks and reading sessions",
      loweredBy: "Zero-deep-work days",
      nextAction: "Two deep work blocks daily, phone outside the room.",
    },
    {
      key: "career",
      name: "Career",
      score: scores.career,
      band: levelBandLabel(scores.career),
      evidence: "No EY or BPP specific logging source exists yet. Scored on thin evidence and capped.",
      missingDataNote: "Add EY/BPP logs (project activity) to raise the confidence.",
      raisedBy: "SSE dashboard activity in project log",
      loweredBy: "Absence of logged evidence",
      nextAction: "Log SSE dashboard progress in the project activity log weekly.",
    },
    {
      key: "wealth",
      name: "Wealth",
      score: scores.wealth,
      band: levelBandLabel(scores.wealth),
      evidence: `${takeawayCount} takeaway orders in 28 days. ${spending.length} transactions logged.`,
      missingDataNote: spending.length === 0 ? "No spending logged." : null,
      raisedBy: "Low takeaway count, consistent tracking",
      loweredBy: "Takeaway frequency",
      nextAction: "Keep takeaway under 6 orders per 30 days.",
    },
    {
      key: "character",
      name: "Character",
      score: scores.character,
      band: levelBandLabel(scores.character),
      evidence: `Phone under 4h on ${logs.filter((l) => phoneTargetMet(l.phoneScreenHours)).length}/${loggedDays} days.`,
      missingDataNote: null,
      raisedBy: "Phone discipline alongside salah consistency",
      loweredBy: "Phone overuse days",
      nextAction: "Phone out of the bedroom tonight.",
    },
    {
      key: "systems",
      name: "Systems and Legacy",
      score: scores.systems,
      band: levelBandLabel(scores.systems),
      evidence: `Outreach this week: ${pipelineMetrics.outreachThisWeek}. Contacted practices: ${pipelineMetrics.contactedCount}.`,
      missingDataNote: null,
      raisedBy: "Outreach sent, pipeline progression",
      loweredBy: "Building instead of selling",
      nextAction: "Send 5 outreach messages this week.",
    },
  ];

  return {
    overallLevel,
    rawLevel: raw.overallLevel,
    dampened: raw.overallLevel !== overallLevel,
    confidence: raw.confidence,
    band: levelBandLabel(overallLevel),
    details,
    loggedDays,
    windowDays: WINDOW_DAYS,
    previousLevel,
    history: previous.slice(0, 12),
  };
}

export async function snapshotLevel() {
  const state = await computeLevelState();
  await db.insert(schema.levelSnapshots).values({
    date: todayIso(),
    overallLevel: state.overallLevel,
    confidence: state.confidence,
    pillarScoresJson: JSON.stringify(
      Object.fromEntries(state.details.map((d) => [d.key, d.score])),
    ),
    note: state.dampened
      ? `Raw computation was ${state.rawLevel}; dampened to limit single-period jumps.`
      : null,
  });
}
