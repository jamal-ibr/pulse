// Email triage: deterministic keyword bucketing plus deadline detection.
// Runs locally, no AI required.

import type { TriageCategory } from "./types";

const RULES: Array<{ category: TriageCategory; test: (sender: string, subject: string, body: string) => boolean }> = [
  {
    category: "pulse_lead",
    test: (sender, subject, body) =>
      /dental|vet|practice|enquiry|pulse/i.test(subject + " " + sender) &&
      /pricing|interested|details|demo|call|missed call|enquir/i.test(body + " " + subject),
  },
  {
    category: "ey_bpp_deadline",
    test: (sender, subject) =>
      /bpp|ey\b|assignment|assessment|submission|apprentice/i.test(sender + " " + subject) &&
      /deadline|due|reminder|submit/i.test(subject),
  },
  {
    category: "risk",
    test: (_sender, subject, body) =>
      /unable to process|payment.*(fail|requir|overdue)|cancellation|final notice|urgent action/i.test(subject + " " + body),
  },
  {
    category: "noise",
    test: (sender, subject) =>
      /newsletter|digest|daily|weekly roundup|unsubscribe|no-?reply/i.test(sender + " " + subject),
  },
  {
    category: "opportunity",
    test: (_sender, subject, body) =>
      /opportunity|invite|speaking|collaboration|intro/i.test(subject + " " + body),
  },
];

export function triageEmail(sender: string, subject: string, body: string): TriageCategory {
  for (const rule of RULES) {
    if (rule.test(sender, subject, body)) return rule.category;
  }
  return "needs_reply";
}

// Detect explicit ISO or UK-format dates and simple "due in N days"
// phrases. Returns an ISO date or null.
export function detectDeadline(text: string, received: Date = new Date()): string | null {
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) return isoMatch[0];

  const ukMatch = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (ukMatch) {
    return `${ukMatch[3]}-${ukMatch[2].padStart(2, "0")}-${ukMatch[1].padStart(2, "0")}`;
  }

  const relative = /due in (\d{1,2}) days?/i.exec(text);
  if (relative) {
    const d = new Date(received);
    d.setDate(d.getDate() + Number(relative[1]));
    return d.toISOString().slice(0, 10);
  }
  return null;
}
