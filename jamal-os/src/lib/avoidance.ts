// Avoidance detection. Computed in code from logged facts, then handed to
// the AI layer as facts. The AI never invents these.

export interface AvoidanceFlag {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
  evidence: string;
}

export interface TaskFacts {
  id: number;
  title: string;
  scariness: number;
  deferCount: number;
  status: string;
}

export interface ProjectFacts {
  id: number;
  name: string;
  lastActivityAt: string | null; // ISO
}

export interface PipelineFacts {
  contactedCount: number;
  daysSinceLastOutreach: number | null; // null = never
  untouchedContactsOver5Days: number;
  overdueFollowUps: number;
}

export interface WeekHabitFacts {
  proteinMissedDays: number;
  kcalOverDays: number;
  salahBelowTargetDays: number;
  lateLightsOutCount: number;
  phoneOver6HoursDays: number;
  missedDeepWorkDays: number;
  pagesReadTotal: number;
  phoneHoursAvg: number;
}

export interface SpendingFacts {
  takeawayThisWeek: number;
  takeawayLastWeek: number;
}

export interface BuildQueueFacts {
  ideasAddedAfter2230ThisWeek: number;
  ideasAddedThisWeek: number;
  outreachSentThisWeek: number;
}

export const PULSE_CONTACTED_MINIMUM = 5;
export const OUTREACH_STALE_DAYS = 3;

// Hard rule, coded not delegated: under 5 contacted practices means Pulse
// outreach opens the Daily Brief.
export function pulseHardRuleTriggered(contactedCount: number): boolean {
  return contactedCount < PULSE_CONTACTED_MINIMUM;
}

export const PULSE_HARD_RULE_MESSAGE =
  "Pulse AI outreach is the priority. You have fewer than 5 contacted practices logged.";

export function taskAvoidanceFlag(task: TaskFacts): AvoidanceFlag | null {
  if (task.status === "done") return null;
  if (task.scariness >= 4 && task.deferCount >= 2) {
    return {
      code: "scary_task_deferred",
      severity: "high",
      message: `You are avoiding "${task.title}". Scariness ${task.scariness}, deferred ${task.deferCount} times. The scary task is the signal.`,
      evidence: `task #${task.id}: scariness=${task.scariness}, defer_count=${task.deferCount}`,
    };
  }
  return null;
}

export function projectStalled(project: ProjectFacts, today: Date): boolean {
  if (!project.lastActivityAt) return true;
  const last = new Date(project.lastActivityAt);
  const days = (today.getTime() - last.getTime()) / 86400000;
  return days >= 7;
}

export function computeAvoidanceFlags(facts: {
  tasks: TaskFacts[];
  projects: ProjectFacts[];
  pipeline: PipelineFacts;
  habits: WeekHabitFacts;
  spending: SpendingFacts;
  buildQueue: BuildQueueFacts;
  today?: Date;
}): AvoidanceFlag[] {
  const flags: AvoidanceFlag[] = [];
  const today = facts.today ?? new Date();

  for (const task of facts.tasks) {
    const flag = taskAvoidanceFlag(task);
    if (flag) flags.push(flag);
  }

  for (const project of facts.projects) {
    if (projectStalled(project, today)) {
      flags.push({
        code: "project_stalled",
        severity: "medium",
        message: `Project "${project.name}" has had no activity for 7+ days.`,
        evidence: `project #${project.id}: last_activity=${project.lastActivityAt ?? "never"}`,
      });
    }
  }

  const p = facts.pipeline;
  if (p.daysSinceLastOutreach == null || p.daysSinceLastOutreach >= OUTREACH_STALE_DAYS) {
    flags.push({
      code: "no_outreach_3_days",
      severity: "high",
      message:
        p.daysSinceLastOutreach == null
          ? "No Pulse AI outreach has ever been logged. This is the core business metric and it has not moved."
          : `No Pulse AI outreach in ${p.daysSinceLastOutreach} days. This is business avoidance.`,
      evidence: `days_since_last_outreach=${p.daysSinceLastOutreach ?? "never"}`,
    });
  }
  if (p.untouchedContactsOver5Days > 0) {
    flags.push({
      code: "pipeline_untouched",
      severity: "medium",
      message: `${p.untouchedContactsOver5Days} pipeline contacts untouched for 5+ days.`,
      evidence: `untouched_5d=${p.untouchedContactsOver5Days}`,
    });
  }
  if (p.overdueFollowUps > 0) {
    flags.push({
      code: "follow_ups_overdue",
      severity: "medium",
      message: `${p.overdueFollowUps} pipeline follow-ups are overdue.`,
      evidence: `overdue_follow_ups=${p.overdueFollowUps}`,
    });
  }

  const h = facts.habits;
  if (h.proteinMissedDays >= 3) {
    flags.push({
      code: "protein_missed",
      severity: "medium",
      message: `Protein target missed on ${h.proteinMissedDays} days this week. Your protein target is not a theory. Log it.`,
      evidence: `protein_missed_days=${h.proteinMissedDays}`,
    });
  }
  if (h.kcalOverDays >= 3) {
    flags.push({
      code: "kcal_over_band",
      severity: "medium",
      message: `Calories above range on ${h.kcalOverDays} days this week.`,
      evidence: `kcal_over_days=${h.kcalOverDays}`,
    });
  }
  if (h.salahBelowTargetDays >= 2) {
    flags.push({
      code: "salah_below_target",
      severity: "high",
      message: `Salah count below 5 on ${h.salahBelowTargetDays} days this week. Faith is the anchor.`,
      evidence: `salah_below_days=${h.salahBelowTargetDays}`,
    });
  }
  if (h.lateLightsOutCount > 2) {
    flags.push({
      code: "late_lights_out",
      severity: "medium",
      message: `Lights out after 23:30 on ${h.lateLightsOutCount} nights this week.`,
      evidence: `late_lights_out=${h.lateLightsOutCount}`,
    });
  }
  if (h.phoneOver6HoursDays > 0 && h.missedDeepWorkDays > 0) {
    flags.push({
      code: "phone_displacing_deep_work",
      severity: "high",
      message: `Phone hours over 6 on ${h.phoneOver6HoursDays} days alongside ${h.missedDeepWorkDays} days of missed deep work. Attention is being spent, not trained.`,
      evidence: `phone_over_6=${h.phoneOver6HoursDays}, missed_deep_work=${h.missedDeepWorkDays}`,
    });
  }
  if (h.pagesReadTotal === 0) {
    flags.push({
      code: "no_reading",
      severity: "low",
      message: "No reading logged this week.",
      evidence: "pages_read_total=0",
    });
  }

  const s = facts.spending;
  if (s.takeawayThisWeek > s.takeawayLastWeek) {
    flags.push({
      code: "takeaway_rising",
      severity: "medium",
      message: `Takeaway orders rising week over week (${s.takeawayLastWeek} to ${s.takeawayThisWeek}). 149 orders in 174 days is the line never to return to.`,
      evidence: `takeaway_this_week=${s.takeawayThisWeek}, last_week=${s.takeawayLastWeek}`,
    });
  }

  const b = facts.buildQueue;
  if (b.ideasAddedAfter2230ThisWeek > 0) {
    flags.push({
      code: "late_night_building",
      severity: "medium",
      message: `${b.ideasAddedAfter2230ThisWeek} build ideas added after 22:30 this week. Late-night project-starting is a known avoidance pattern.`,
      evidence: `late_ideas=${b.ideasAddedAfter2230ThisWeek}`,
    });
  }
  if (b.ideasAddedThisWeek > b.outreachSentThisWeek) {
    flags.push({
      code: "building_over_outreach",
      severity: "high",
      message: `More building and planning (${b.ideasAddedThisWeek} ideas) than outreach (${b.outreachSentThisWeek} sent) this week. This is avoidance disguised as planning.`,
      evidence: `ideas=${b.ideasAddedThisWeek}, outreach=${b.outreachSentThisWeek}`,
    });
  }

  return flags;
}
