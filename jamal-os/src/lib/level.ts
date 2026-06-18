// Level system. Conservative by design. Level 100 represents the prophetic
// standard in Jamal's framework and is never realistically assigned.
// Scores require logged evidence; missing data scores low.

export const PILLAR_KEYS = [
  "faith",
  "body",
  "mind",
  "career",
  "wealth",
  "character",
  "systems",
] as const;

export type PillarKey = (typeof PILLAR_KEYS)[number];

export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  faith: 1.5,
  body: 1.2,
  mind: 1.0,
  career: 1.0,
  wealth: 0.8,
  character: 1.3,
  systems: 1.0,
};

export const LEVEL_BANDS = [
  { min: 0, max: 20, label: "Unstable or mostly unlogged" },
  { min: 21, max: 35, label: "Inconsistent but aware" },
  { min: 36, max: 50, label: "Basic structure emerging" },
  { min: 51, max: 65, label: "Consistent in some domains" },
  { min: 66, max: 80, label: "Strong and reliable" },
  { min: 81, max: 90, label: "Exceptional" },
  { min: 91, max: 99, label: "Historically rare" },
  { min: 100, max: 100, label: "Prophetic standard, not realistically assigned" },
] as const;

export function levelBandLabel(score: number): string {
  const clamped = clampScore(score);
  const band = LEVEL_BANDS.find((b) => clamped >= b.min && clamped <= b.max);
  return band ? band.label : "Unknown";
}

export function clampScore(score: number): number {
  // 100 is reserved. 99 is the practical ceiling.
  if (score >= 100) return 99;
  if (score < 0) return 0;
  return Math.round(score);
}

export interface PillarEvidence {
  // 0 to 1: how complete the logged data is for this pillar this period.
  dataCompleteness: number;
  // 0 to 1: target compliance rate from logged data only.
  complianceRate: number;
  // Weeks of consistent evidence backing the score (caps gains).
  consistentWeeks: number;
}

// Compute a pillar score from evidence. Missing data is penalised, never
// assumed in the user's favour.
export function computePillarScore(evidence: PillarEvidence): number {
  const completeness = Math.min(Math.max(evidence.dataCompleteness, 0), 1);
  const compliance = Math.min(Math.max(evidence.complianceRate, 0), 1);
  const weeks = Math.max(evidence.consistentWeeks, 0);

  // Base: compliance scaled to 0-70. Even perfect compliance with thin
  // history cannot exceed the 60s.
  const base = compliance * 70;

  // Consistency bonus: up to 20 points, earned over 8+ weeks of evidence.
  const consistencyBonus = Math.min(weeks / 8, 1) * 20;

  // Completeness gate: unlogged pillars collapse towards zero.
  const raw = (base + consistencyBonus) * completeness;

  return clampScore(raw);
}

export interface LevelResult {
  overallLevel: number;
  confidence: "low" | "medium" | "high";
}

export function computeOverallLevel(
  pillarScores: Partial<Record<PillarKey, number>>,
): LevelResult {
  let weightedSum = 0;
  let weightTotal = 0;
  let loggedPillars = 0;

  for (const key of PILLAR_KEYS) {
    const weight = PILLAR_WEIGHTS[key];
    const score = pillarScores[key];
    weightTotal += weight;
    if (score != null) {
      weightedSum += clampScore(score) * weight;
      loggedPillars++;
    }
    // Missing pillars contribute zero to the sum but full weight to the
    // denominator: missing data lowers the level, it does not hide.
  }

  const overall = clampScore(weightTotal > 0 ? weightedSum / weightTotal : 0);
  const coverage = loggedPillars / PILLAR_KEYS.length;
  const confidence: LevelResult["confidence"] =
    coverage >= 0.85 ? "high" : coverage >= 0.5 ? "medium" : "low";

  return { overallLevel: overall, confidence };
}

// Guard against ego-fuel jumps: a new snapshot may rise at most 3 levels
// above the previous one regardless of a single good week.
export function dampenLevelJump(previous: number | null, next: number): number {
  if (previous == null) return clampScore(next);
  if (next > previous + 3) return clampScore(previous + 3);
  return clampScore(next);
}
