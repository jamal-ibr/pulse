import { writeFileSync } from "node:fs";
import type { Angle, BatchOutputs, PersonalisationConfidence } from "./types.js";

export interface SummaryArgs {
  outputs: BatchOutputs;
  outputMethod: "gmail-drafts" | "sheet";
  outputLocation: string;
  totalProcessed: number;
}

export function writeSummary(path: string, args: SummaryArgs): void {
  const { drafts, skipped } = args.outputs;

  const angleCounts: Record<Angle, number> = {
    RECEPTION_OVERLOAD: 0,
    HIGH_VALUE_COSMETIC_LEADS: 0,
    MISSED_AFTER_HOURS_ENQUIRIES: 0,
    MULTI_LOCATION_ADMIN_LOAD: 0,
    REVIEW_VOLUME_SIGNAL: 0,
    LOW_PERSONALISATION_FALLBACK: 0,
  };
  const confCounts: Record<PersonalisationConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const d of drafts) {
    angleCounts[d.angle]++;
    confCounts[d.confidence]++;
  }

  const lowDrafts = drafts.filter((d) => d.confidence === "LOW");
  const phoneOnlyDrafts = drafts.filter((d) => d.channel === "phone-or-role-inbox");
  const regenerated = drafts.filter((d) => d.regenerations > 0);

  const lines: string[] = [];
  lines.push(`# Outreach drafts summary — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- Total leads processed: ${args.totalProcessed}`);
  lines.push(`- Drafts created: ${drafts.length}`);
  lines.push(`- Skipped: ${skipped.length}`);
  lines.push(`- Output method: \`${args.outputMethod}\``);
  lines.push(`- Output location: ${args.outputLocation}`);
  lines.push("");
  lines.push("## Angle distribution");
  for (const [angle, count] of Object.entries(angleCounts)) {
    lines.push(`- ${angle}: ${count}`);
  }
  lines.push("");
  lines.push("## Personalisation confidence");
  for (const [conf, count] of Object.entries(confCounts)) {
    lines.push(`- ${conf}: ${count}`);
  }
  if (lowDrafts.length > 0) {
    lines.push("");
    lines.push("## LOW confidence — priority manual review");
    for (const d of lowDrafts) {
      lines.push(`- ${d.lead.practice_name} (${d.angle}) — ${d.lead.owner_email || "(no email)"}`);
    }
  }
  if (phoneOnlyDrafts.length > 0) {
    lines.push("");
    lines.push("## No deliverable email — phone or role-inbox handling");
    for (const d of phoneOnlyDrafts) {
      const phone = d.lead.decision_maker_direct_phone || d.lead.direct_phone || d.lead.practice_phone || "(no phone)";
      lines.push(`- ${d.lead.practice_name} — ${d.lead.owner_name || "(owner unknown)"} — ${phone}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("");
    lines.push("## Skipped");
    for (const s of skipped) lines.push(`- ${s.practice_name}: ${s.reason}`);
  }
  if (regenerated.length > 0) {
    lines.push("");
    lines.push("## Regenerations triggered");
    for (const d of regenerated) {
      lines.push(`- ${d.lead.practice_name} ×${d.regenerations}: ${d.regenerate_reasons.join("; ")}`);
    }
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}
