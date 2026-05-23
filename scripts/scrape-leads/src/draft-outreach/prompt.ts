import type { OutreachLead } from "../types.js";
import type { Angle, DraftResult, PersonalisationBrief } from "./types.js";
import { ANGLE_DESCRIPTIONS } from "./angle.js";

export function buildSystemPrompt(forbiddenList: string[]): string {
  return [
    "You write short, founder-to-owner B2B cold emails for Pulse — an AI receptionist service for dental practices in the UK.",
    "",
    "Voice and tone:",
    "- Direct, human, confident. Not corporate. Not salesy. No jargon.",
    "- Founder writing to owner. Same level. Respectful, not deferential.",
    "- One specific hook from the lead's brief. No generic city mentions, generic compliments, 'nice website', 'modern practice', or 'great reviews' without specificity.",
    "",
    "Hard rules for every email:",
    "- Body length: 60–90 words target, 120 word HARD MAXIMUM. Going over 120 = failure.",
    "- Anchor on the ONE assigned outreach angle the user message gives you. Do not gesture at any other angle.",
    "- Use the owner's FIRST NAME only in the greeting (strip 'Dr', 'Mr', 'Mrs', etc.).",
    "- Subject line must be specific to the angle, no clickbait, sentence case.",
    "- Include ONE light opt-out line, varied phrasing (e.g. \"If it's not for you just say\", \"Happy to drop it if not relevant\", etc.). Don't repeat the same opt-out across drafts.",
    "- Sign off with exactly two lines on their own:\n  Jamal\n  Pulse",
    "- Never mention EY or any third-party employer. You are Jamal at Pulse.",
    "- Never use any of these phrases (case-insensitive): " + JSON.stringify(forbiddenList),
    "",
    "Output format: return ONLY a valid JSON object on a single line:",
    `{"subject":"...","body":"..."}`,
    "No markdown fences. No commentary. No preamble. The body string may contain \\n for line breaks.",
  ].join("\n");
}

export interface UserPromptInput {
  lead: OutreachLead;
  angle: Angle;
  brief: PersonalisationBrief;
  recentDraftPatterns?: string[]; // openers / subjects / CTAs to avoid duplicating
  correctiveFeedback?: string[];  // from previous failed attempt
}

function firstName(ownerName: string): string {
  const cleaned = ownerName.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Mx\.?|Prof\.?)\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] ?? ownerName;
}

export function buildUserPrompt(input: UserPromptInput): string {
  const { lead, angle, brief, recentDraftPatterns, correctiveFeedback } = input;
  const fn = firstName(lead.owner_name) || "there";
  const lines: string[] = [];
  lines.push(`Practice: ${lead.practice_name}`);
  lines.push(`Owner first name (greeting): ${fn}`);
  if (lead.owner_title) lines.push(`Owner title: ${lead.owner_title}`);
  if (lead.city) lines.push(`City: ${lead.city}`);
  lines.push("");
  lines.push(`Assigned angle: ${angle}`);
  lines.push(`Angle direction: ${ANGLE_DESCRIPTIONS[angle]}`);
  lines.push("");
  lines.push("Personalisation facts (anchor opener on the most specific one available — do not invent):");
  for (const f of brief.facts) lines.push(`- ${f.text}`);
  if (recentDraftPatterns && recentDraftPatterns.length > 0) {
    lines.push("");
    lines.push("Already used in this batch — DO NOT reuse the same opener structure, subject pattern, CTA, or 3-word phrases:");
    for (const p of recentDraftPatterns) lines.push(`- ${p}`);
  }
  if (correctiveFeedback && correctiveFeedback.length > 0) {
    lines.push("");
    lines.push("Your previous draft was rejected. Fix these specific problems:");
    for (const c of correctiveFeedback) lines.push(`- ${c}`);
  }
  lines.push("");
  lines.push("Write the email now.");
  return lines.join("\n");
}

/**
 * Compact representations of an already-generated draft, used as
 * \"don't repeat these patterns\" guidance for subsequent drafts.
 */
export function patternsForDeduplication(d: Pick<DraftResult, "subject" | "body">): string[] {
  const out: string[] = [];
  out.push(`subject: \"${d.subject}\"`);
  const firstLine = (d.body.split(/\n+/)[1] ?? d.body.split(/\n+/)[0] ?? "").trim();
  if (firstLine) out.push(`opener: \"${firstLine.slice(0, 80)}\"`);
  const closing = d.body.split(/\n+/).filter((s) => s.trim()).slice(-2, -1)[0] ?? "";
  if (closing) out.push(`closing line: \"${closing.slice(0, 80)}\"`);
  return out;
}

export { firstName };
