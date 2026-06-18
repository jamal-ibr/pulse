import { describe, test, expect } from "vitest";
import {
  clampScore,
  levelBandLabel,
  computePillarScore,
  computeOverallLevel,
  dampenLevelJump,
} from "../src/lib/level";

describe("level mapping", () => {
  test("100 is reserved and clamps to 99", () => {
    expect(clampScore(100)).toBe(99);
    expect(clampScore(150)).toBe(99);
  });

  test("band labels match spec", () => {
    expect(levelBandLabel(10)).toBe("Unstable or mostly unlogged");
    expect(levelBandLabel(28)).toBe("Inconsistent but aware");
    expect(levelBandLabel(45)).toBe("Basic structure emerging");
    expect(levelBandLabel(60)).toBe("Consistent in some domains");
    expect(levelBandLabel(75)).toBe("Strong and reliable");
    expect(levelBandLabel(85)).toBe("Exceptional");
    expect(levelBandLabel(95)).toBe("Historically rare");
  });
});

describe("computePillarScore is conservative", () => {
  test("no data scores zero", () => {
    expect(
      computePillarScore({ dataCompleteness: 0, complianceRate: 1, consistentWeeks: 10 }),
    ).toBe(0);
  });

  test("perfect compliance with one week of evidence stays modest", () => {
    const score = computePillarScore({
      dataCompleteness: 1,
      complianceRate: 1,
      consistentWeeks: 1,
    });
    expect(score).toBeLessThanOrEqual(75);
    expect(score).toBeGreaterThan(60);
  });

  test("partial logging is penalised", () => {
    const full = computePillarScore({ dataCompleteness: 1, complianceRate: 0.8, consistentWeeks: 4 });
    const partial = computePillarScore({ dataCompleteness: 0.5, complianceRate: 0.8, consistentWeeks: 4 });
    expect(partial).toBeLessThan(full);
  });
});

describe("computeOverallLevel", () => {
  test("missing pillars lower the level and confidence", () => {
    const full = computeOverallLevel({
      faith: 40, body: 40, mind: 40, career: 40, wealth: 40, character: 40, systems: 40,
    });
    const partial = computeOverallLevel({ faith: 40, body: 40 });
    expect(partial.overallLevel).toBeLessThan(full.overallLevel);
    expect(partial.confidence).toBe("low");
    expect(full.confidence).toBe("high");
  });

  test("uniform scores produce that level", () => {
    const result = computeOverallLevel({
      faith: 30, body: 30, mind: 30, career: 30, wealth: 30, character: 30, systems: 30,
    });
    expect(result.overallLevel).toBe(30);
  });
});

describe("dampenLevelJump", () => {
  test("caps gains at 3 levels per snapshot", () => {
    expect(dampenLevelJump(27, 45)).toBe(30);
  });
  test("allows drops without damping", () => {
    expect(dampenLevelJump(40, 30)).toBe(30);
  });
  test("first snapshot passes through", () => {
    expect(dampenLevelJump(null, 27)).toBe(27);
  });
});
