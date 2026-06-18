// Deterministic mock AI provider. Produces useful, honest output from the
// structured facts it is given, so the app works fully offline with no key.

import type { PromptName } from "./provider";

function extractLine(facts: string, key: string): string | null {
  const regex = new RegExp(`${key}\\s*[:=]\\s*(.+)`, "i");
  const match = regex.exec(facts);
  return match ? match[1].trim() : null;
}

export function mockComplete(promptName: PromptName, facts: string): string {
  switch (promptName) {
    case "chief-of-staff": {
      const scary = extractLine(facts, "scariest_task") ?? "your most deferred task";
      const overdue = extractLine(facts, "overdue_count") ?? "0";
      const outreach = extractLine(facts, "outreach_this_week") ?? "0";
      return [
        `Top priorities today: send Pulse outreach, complete one deep work block, and hit protein. Outreach sent this week: ${outreach}.`,
        `The task you are most likely to dodge: ${scary}. The scary task is the signal. Do it first, before email, before tweaking dashboards.`,
        `You have ${overdue} overdue items. Clear or reschedule them honestly rather than letting them rot.`,
        `Next action: open the pipeline, pick one practice, and send the message before 10:00.`,
        `(Mock provider. Add ANTHROPIC_API_KEY to .env.local for live briefs.)`,
      ].join("\n\n");
    }
    case "weekly-review": {
      return [
        "Plan versus actual: review the logged data above. Where logs are missing, treat the plan as not executed.",
        "What you avoided: see the avoidance flags computed from your data. These are facts, not opinions.",
        "Pillar scores are computed conservatively from logged evidence only. Missing data scores low by design.",
        "One uncomfortable truth: if outreach did not move this week, nothing else on this list compensates for it.",
        "Commitment for next week: send outreach to five practices before doing any build queue work.",
        "(Mock provider. Add ANTHROPIC_API_KEY for a full written review.)",
      ].join("\n\n");
    }
    case "email-voice": {
      const subject = extractLine(facts, "subject") ?? "your email";
      return [
        `Thanks for your message regarding ${subject}.`,
        "I have reviewed this and will come back to you with specifics by the end of the week. If there is a deadline I should be aware of, please let me know.",
        "Best regards,\nJamal",
        "(Mock draft. Add ANTHROPIC_API_KEY for drafts written in your full voice.)",
      ].join("\n\n");
    }
    case "avoidance-analysis":
      return "Avoidance flags are computed in code from logged facts and listed above. Address the highest severity flag first. (Mock provider.)";
    case "project-next-action":
      return "Pick the smallest physical next action that moves the core metric. For Pulse AI that is sending one outreach message, not improving tooling. (Mock provider.)";
    case "fitness-adjustment":
      return "Hold the calorie band, prioritise protein at every meal, and keep cardio to stairmaster and skipping until cleared. Boring consistency wins. (Mock provider.)";
    case "spending-correction":
      return "Takeaway frequency is the lever. Pre-decide three default meals and remove payment friction from groceries, not delivery apps. (Mock provider.)";
    case "faith-character-reflection":
      return "Anchor the day around the five prayers and let work fit between them, not the reverse. Integrity in private is the standard. (Mock provider.)";
    case "mentor-tone":
      return "Direct, honest, strategic. State the gap between stated priority and logged behaviour, then give one concrete action. (Mock provider.)";
    case "voice-assistant": {
      const question = extractLine(facts, "question") ?? "that";
      return `I can only answer from logged data, and the mock provider cannot reason about "${question}". Check the relevant page in Jamal OS, or add ANTHROPIC_API_KEY to .env.local for live voice answers.`;
    }
    case "claude-code-tool-build":
      return "Scoped build prompt generated from the idea fields. Keep scope to the definition of done. No secrets, no em dashes, tests required. (Mock provider.)";
    default:
      return "Mock response. Add ANTHROPIC_API_KEY to .env.local for live AI output.";
  }
}
