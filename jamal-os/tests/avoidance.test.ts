import { describe, test, expect } from "vitest";
import {
  pulseHardRuleTriggered,
  taskAvoidanceFlag,
  projectStalled,
  computeAvoidanceFlags,
  PULSE_HARD_RULE_MESSAGE,
} from "../src/lib/avoidance";

const baseFacts = {
  tasks: [],
  projects: [],
  pipeline: {
    contactedCount: 6,
    daysSinceLastOutreach: 1,
    untouchedContactsOver5Days: 0,
    overdueFollowUps: 0,
  },
  habits: {
    proteinMissedDays: 0,
    kcalOverDays: 0,
    salahBelowTargetDays: 0,
    lateLightsOutCount: 0,
    phoneOver6HoursDays: 0,
    missedDeepWorkDays: 0,
    pagesReadTotal: 50,
    phoneHoursAvg: 3,
  },
  spending: { takeawayThisWeek: 1, takeawayLastWeek: 2 },
  buildQueue: { ideasAddedAfter2230ThisWeek: 0, ideasAddedThisWeek: 0, outreachSentThisWeek: 5 },
};

describe("Pulse hard rule", () => {
  test("triggers below 5 contacted", () => {
    expect(pulseHardRuleTriggered(4)).toBe(true);
    expect(pulseHardRuleTriggered(0)).toBe(true);
  });
  test("does not trigger at 5 or above", () => {
    expect(pulseHardRuleTriggered(5)).toBe(false);
  });
  test("message matches spec wording", () => {
    expect(PULSE_HARD_RULE_MESSAGE).toBe(
      "Pulse AI outreach is the priority. You have fewer than 5 contacted practices logged.",
    );
  });
});

describe("task avoidance", () => {
  test("scariness 4+ deferred twice flags", () => {
    const flag = taskAvoidanceFlag({
      id: 1, title: "Send outreach", scariness: 5, deferCount: 2, status: "todo",
    });
    expect(flag).not.toBeNull();
    expect(flag!.severity).toBe("high");
  });
  test("low scariness does not flag", () => {
    expect(
      taskAvoidanceFlag({ id: 2, title: "Log protein", scariness: 1, deferCount: 5, status: "todo" }),
    ).toBeNull();
  });
  test("done tasks never flag", () => {
    expect(
      taskAvoidanceFlag({ id: 3, title: "Send outreach", scariness: 5, deferCount: 3, status: "done" }),
    ).toBeNull();
  });
});

describe("project stalling", () => {
  const today = new Date("2026-06-11T12:00:00Z");
  test("7+ days without activity stalls", () => {
    expect(projectStalled({ id: 1, name: "X", lastActivityAt: "2026-06-01" }, today)).toBe(true);
  });
  test("recent activity does not stall", () => {
    expect(projectStalled({ id: 1, name: "X", lastActivityAt: "2026-06-09" }, today)).toBe(false);
  });
  test("never-active projects stall", () => {
    expect(projectStalled({ id: 1, name: "X", lastActivityAt: null }, today)).toBe(true);
  });
});

describe("computeAvoidanceFlags", () => {
  test("clean week produces no flags", () => {
    expect(computeAvoidanceFlags(baseFacts)).toHaveLength(0);
  });

  test("no outreach in 3 days flags high", () => {
    const flags = computeAvoidanceFlags({
      ...baseFacts,
      pipeline: { ...baseFacts.pipeline, daysSinceLastOutreach: 3 },
    });
    expect(flags.some((f) => f.code === "no_outreach_3_days" && f.severity === "high")).toBe(true);
  });

  test("building more than outreach flags avoidance", () => {
    const flags = computeAvoidanceFlags({
      ...baseFacts,
      buildQueue: { ideasAddedAfter2230ThisWeek: 0, ideasAddedThisWeek: 3, outreachSentThisWeek: 1 },
    });
    expect(flags.some((f) => f.code === "building_over_outreach")).toBe(true);
  });

  test("protein missed 3 days flags", () => {
    const flags = computeAvoidanceFlags({
      ...baseFacts,
      habits: { ...baseFacts.habits, proteinMissedDays: 3 },
    });
    expect(flags.some((f) => f.code === "protein_missed")).toBe(true);
  });

  test("rising takeaway flags with baseline reference", () => {
    const flags = computeAvoidanceFlags({
      ...baseFacts,
      spending: { takeawayThisWeek: 4, takeawayLastWeek: 2 },
    });
    const flag = flags.find((f) => f.code === "takeaway_rising");
    expect(flag).toBeDefined();
    expect(flag!.message).toContain("149");
  });
});
