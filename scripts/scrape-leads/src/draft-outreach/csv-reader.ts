import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../config.js";
import type { OutreachLead, ApolloDirectPhoneFlag, Confidence, InvisalignStrength } from "../types.js";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function numOrEmpty(v: string): number | "" {
  if (v === "" || v === "NaN") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export function readOutreachCsv(path: string): OutreachLead[] {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const out: OutreachLead[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length !== header.length) {
      // Tolerate trailing empty cells from extended schemas.
      while (cols.length < header.length) cols.push("");
    }
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cols[j] ?? "";
    out.push({
      rank: Number(row.rank ?? 0),
      practice_name: row.practice_name ?? "",
      owner_name: row.owner_name ?? "",
      owner_title: row.owner_title ?? "",
      owner_email: row.owner_email ?? "",
      owner_email_confidence: (row.owner_email_confidence as Confidence) || "none",
      practice_phone: row.practice_phone ?? "",
      direct_phone: row.direct_phone ?? "",
      direct_phone_confidence: (row.direct_phone_confidence as Confidence) || "none",
      apollo_has_direct_phone: (row.apollo_has_direct_phone as ApolloDirectPhoneFlag) || "Unknown",
      hiring_receptionist: (row.hiring_receptionist === "yes" || row.hiring_receptionist === "no" || row.hiring_receptionist === "unknown")
        ? (row.hiring_receptionist as "yes" | "no" | "unknown")
        : "unknown",
      website: row.website ?? "",
      city: row.city ?? "",
      postcode: row.postcode ?? "",
      invisalign_strength: ((): InvisalignStrength => {
        const v = row.invisalign_strength;
        return v === "strong" || v === "medium" || v === "weak" ? v : "weak";
      })(),
      fit_score: Number(row.fit_score ?? 0),
      contact_confidence: Number(row.contact_confidence ?? 0),
      rating: numOrEmpty(row.rating ?? ""),
      review_count: numOrEmpty(row.review_count ?? ""),
      notes: row.notes ?? "",
      owner_source_url: row.owner_source_url ?? "",
      email_source_url: row.email_source_url ?? "",
      direct_phone_source_url: row.direct_phone_source_url ?? "",
      hiring_source_url: row.hiring_source_url ?? "",
      decision_maker_direct_phone: row.decision_maker_direct_phone ?? "",
      decision_maker_phone_confidence: (row.decision_maker_phone_confidence as OutreachLead["decision_maker_phone_confidence"]) ?? "",
      apollo_person_id: row.apollo_person_id ?? "",
      phone_fallback_strategy: row.phone_fallback_strategy ?? "",
      email_extraction_error: row.email_extraction_error ?? "",
      email_local_part_classification: (row.email_local_part_classification as OutreachLead["email_local_part_classification"]) ?? "",
    });
  }
  return out;
}

/** Resolve the most recent outreach CSV by reading data/latest-outreach.json. */
export function resolveLatestOutreachCsv(): string | null {
  const ptr = resolve(ROOT, "data", "latest-outreach.json");
  if (!existsSync(ptr)) return null;
  try {
    const parsed = JSON.parse(readFileSync(ptr, "utf8")) as { csvPath?: string };
    return parsed.csvPath ?? null;
  } catch {
    return null;
  }
}
