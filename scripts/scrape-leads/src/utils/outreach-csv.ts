import { writeFileSync } from "node:fs";
import type { OutreachLead } from "../types.js";

export const OUTREACH_COLUMNS: Array<keyof OutreachLead> = [
  "rank",
  "practice_name",
  "owner_name",
  "owner_title",
  "owner_email",
  "owner_email_confidence",
  "direct_phone",
  "direct_phone_confidence",
  "apollo_has_direct_phone",
  "practice_phone",
  "hiring_receptionist",
  "website",
  "city",
  "postcode",
  "invisalign_strength",
  "fit_score",
  "contact_confidence",
  "rating",
  "review_count",
  "notes",
  // Provenance — collapse these columns in Sheets once you trust the run
  "owner_source_url",
  "email_source_url",
  "direct_phone_source_url",
  "hiring_source_url",
];

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function writeOutreachCsv(path: string, leads: OutreachLead[]): void {
  const header = OUTREACH_COLUMNS.join(",");
  const rows = leads.map((l) => OUTREACH_COLUMNS.map((c) => csvCell((l as unknown as Record<string, unknown>)[c])).join(","));
  writeFileSync(path, [header, ...rows].join("\n") + "\n", "utf8");
}
