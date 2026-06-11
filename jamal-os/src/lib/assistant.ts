// Voice agent intent parsing and deterministic answers. Pure logic,
// no IO. The server action in src/app/assistant/actions.ts gathers
// facts, executes effects, and falls back to the AI provider for chat.

export type AssistantIntent =
  | { type: "brief" }
  | { type: "pipeline" }
  | { type: "scary" }
  | { type: "habits" }
  | { type: "add_task"; title: string }
  | { type: "chat"; text: string };

export interface AssistantFacts {
  contactedCount: number;
  contactedMinimum: number;
  outreachThisWeek: number;
  followUpsOverdue: number;
  hardRuleTriggered: boolean;
  overdueTaskCount: number;
  scariestTask: {
    title: string;
    scariness: number;
    deferCount: number;
  } | null;
  habitGaps: Array<{ habit: string; detail: string }>;
  todayEventCount: number;
}

const ADD_TASK_PATTERNS = [
  /^(?:add|create|new)\s+(?:a\s+)?task\s*(?:to|for|:)?\s*(.+)$/i,
  /^remind me to\s+(.+)$/i,
  /^note to self\s*(?:to|:)?\s*(.+)$/i,
];

export function parseIntent(raw: string): AssistantIntent {
  const input = raw.trim();
  for (const pattern of ADD_TASK_PATTERNS) {
    const match = pattern.exec(input);
    if (match) {
      const title = match[1].trim().replace(/[.!?]+$/, "");
      if (title) return { type: "add_task", title };
    }
  }
  const lower = input.toLowerCase();
  if (/\b(pipeline|outreach|practice|practices|dental)\b/.test(lower)) {
    return { type: "pipeline" };
  }
  if (/\b(scary|scariest|avoid|avoiding|avoidance|dodge|dodging)\b/.test(lower)) {
    return { type: "scary" };
  }
  if (/\b(habit|habits|salah|prayer|protein|sleep|gap|gaps)\b/.test(lower)) {
    return { type: "habits" };
  }
  if (/\b(brief|today|priority|priorities|plan|focus|day)\b/.test(lower)) {
    return { type: "brief" };
  }
  return { type: "chat", text: input };
}

// Deterministic spoken-style answers from structured facts. Returns
// null when the intent needs the AI provider (general chat) or a
// database write (add_task).
export function answerIntent(
  intent: AssistantIntent,
  facts: AssistantFacts,
): string | null {
  switch (intent.type) {
    case "brief": {
      const lines: string[] = [];
      if (facts.hardRuleTriggered) {
        lines.push(
          `Pulse outreach first: ${facts.contactedCount} of ${facts.contactedMinimum} practices contacted and ${facts.outreachThisWeek} messages sent this week.`,
        );
      } else {
        lines.push(
          `Outreach is on track: ${facts.outreachThisWeek} sent this week.`,
        );
      }
      if (facts.scariestTask) {
        lines.push(
          `The task you are most likely to dodge is ${facts.scariestTask.title}. Do it first.`,
        );
      }
      if (facts.overdueTaskCount > 0) {
        lines.push(
          `${facts.overdueTaskCount} overdue ${facts.overdueTaskCount === 1 ? "task" : "tasks"} to clear or reschedule honestly.`,
        );
      }
      lines.push(
        facts.todayEventCount > 0
          ? `${facts.todayEventCount} ${facts.todayEventCount === 1 ? "event" : "events"} on today's calendar.`
          : "Nothing on the calendar today. Block time for the scary task.",
      );
      return lines.join(" ");
    }
    case "pipeline": {
      const overdue =
        facts.followUpsOverdue > 0
          ? ` ${facts.followUpsOverdue} follow-${facts.followUpsOverdue === 1 ? "up is" : "ups are"} overdue.`
          : "";
      const verdict = facts.hardRuleTriggered
        ? " Below minimum. Send before anything else."
        : " On track.";
      return `${facts.contactedCount} of ${facts.contactedMinimum} practices contacted, ${facts.outreachThisWeek} outreach messages this week.${overdue}${verdict}`;
    }
    case "scary": {
      if (!facts.scariestTask) {
        return "No open tasks logged. If you are avoiding something, it is not in the system yet. Add it.";
      }
      const deferred =
        facts.scariestTask.deferCount > 0
          ? ` You have deferred it ${facts.scariestTask.deferCount} ${facts.scariestTask.deferCount === 1 ? "time" : "times"}.`
          : "";
      return `${facts.scariestTask.title}, scariness ${facts.scariestTask.scariness} of 5.${deferred} The scary task is the signal. Do it before email.`;
    }
    case "habits": {
      if (facts.habitGaps.length === 0) {
        return "All habit targets met yesterday. Logged and verified.";
      }
      const gaps = facts.habitGaps
        .map((g) => `${g.habit}: ${g.detail}`)
        .join(". ");
      return `Yesterday's gaps: ${gaps}.`;
    }
    case "add_task":
    case "chat":
      return null;
  }
}
