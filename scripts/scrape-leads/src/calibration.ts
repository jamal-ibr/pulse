import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, CONFIG } from "./config.js";
import { searchOwners, enrichPerson, getApolloStats } from "./sources/apollo.js";
import type { OutreachLead } from "./types.js";
import { log } from "./utils/logger.js";
import { domainOf } from "./utils/normalise.js";

const latestPath = resolve(ROOT, "data", "latest-outreach.json");
if (!existsSync(latestPath)) {
  console.error("No latest-outreach.json — run `npm run scrape:leads` first.");
  process.exit(1);
}
if (!CONFIG.apolloKey) {
  console.error("APOLLO_API_KEY not set in .env.");
  process.exit(1);
}

const sampleSize = CONFIG.apolloCalibrationSampleSize;
if (sampleSize <= 0) {
  console.error("APOLLO_CALIBRATION_SAMPLE_SIZE is 0 — nothing to calibrate.");
  process.exit(0);
}

interface CalibrationRow {
  practice_name: string;
  owner_name: string;
  homegrown_email: string;
  homegrown_email_conf: string;
  apollo_email: string;
  email_match: string;
  homegrown_phone: string;
  homegrown_phone_conf: string;
  apollo_phone: string;
  phone_match: string;
  apollo_credits_spent: number;
  notes: string;
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function matchEmail(a: string, b: string): string {
  if (!a || !b) return "n/a";
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return "exact";
  const [la1, ld] = la.split("@");
  const [lb1, ld2] = lb.split("@");
  if (ld === ld2 && (la1 === lb1 || la1.includes(lb1) || lb1.includes(la1))) return "close";
  return "no";
}

function matchPhone(a: string, b: string): string {
  if (!a || !b) return "n/a";
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (!da || !db) return "n/a";
  if (da === db) return "exact";
  if (da.endsWith(db) || db.endsWith(da)) return "close";
  return "no";
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

(async (): Promise<void> => {
  const { jsonPath } = JSON.parse(readFileSync(latestPath, "utf8")) as { csvPath: string; jsonPath: string };
  const outreach = JSON.parse(readFileSync(jsonPath, "utf8")) as { leads: OutreachLead[] };

  const candidates = outreach.leads.filter((l) => l.website && l.owner_name).slice(0, 50);
  const sample = pickRandomN(candidates, sampleSize);

  log.info(`calibration: comparing homegrown vs Apollo Enrichment for ${sample.length} leads`);
  log.warn(`this will spend up to ${sample.length} Apollo credits`);

  const rows: CalibrationRow[] = [];
  let creditsSpent = 0;

  for (const lead of sample) {
    const dom = lead.website ? domainOf(lead.website) : "";
    const people = await searchOwners({ domain: dom });
    if (people.length === 0) {
      rows.push({
        practice_name: lead.practice_name,
        owner_name: lead.owner_name,
        homegrown_email: lead.owner_email,
        homegrown_email_conf: lead.owner_email_confidence,
        apollo_email: "(not found)",
        email_match: "n/a",
        homegrown_phone: lead.direct_phone,
        homegrown_phone_conf: lead.direct_phone_confidence,
        apollo_phone: "(not found)",
        phone_match: "n/a",
        apollo_credits_spent: 0,
        notes: "Apollo search returned 0 people for domain",
      });
      continue;
    }
    const person = people[0];
    const enriched = await enrichPerson({ id: person.id, revealEmail: true, revealPhone: true });
    creditsSpent++;
    if (!enriched) {
      rows.push({
        practice_name: lead.practice_name,
        owner_name: lead.owner_name,
        homegrown_email: lead.owner_email,
        homegrown_email_conf: lead.owner_email_confidence,
        apollo_email: "(enrichment failed)",
        email_match: "n/a",
        homegrown_phone: lead.direct_phone,
        homegrown_phone_conf: lead.direct_phone_confidence,
        apollo_phone: "(enrichment failed)",
        phone_match: "n/a",
        apollo_credits_spent: 1,
        notes: "Apollo enrichment returned null",
      });
      continue;
    }
    const apolloEmail = enriched.email ?? "";
    const apolloPhone =
      enriched.phone_numbers?.[0]?.sanitized_number ??
      enriched.phone_numbers?.[0]?.raw_number ??
      "";
    rows.push({
      practice_name: lead.practice_name,
      owner_name: lead.owner_name,
      homegrown_email: lead.owner_email,
      homegrown_email_conf: lead.owner_email_confidence,
      apollo_email: apolloEmail,
      email_match: matchEmail(lead.owner_email, apolloEmail),
      homegrown_phone: lead.direct_phone,
      homegrown_phone_conf: lead.direct_phone_confidence,
      apollo_phone: apolloPhone,
      phone_match: matchPhone(lead.direct_phone, apolloPhone),
      apollo_credits_spent: 1,
      notes: `apollo person ${person.id} (${person.first_name ?? "?"} ${person.last_name_obfuscated ?? "?"})`,
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = resolve(ROOT, "data", `calibration-${stamp}.csv`);
  const cols: Array<keyof CalibrationRow> = [
    "practice_name", "owner_name",
    "homegrown_email", "homegrown_email_conf", "apollo_email", "email_match",
    "homegrown_phone", "homegrown_phone_conf", "apollo_phone", "phone_match",
    "apollo_credits_spent", "notes",
  ];
  const out = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")),
  ].join("\n");
  writeFileSync(reportPath, out + "\n", "utf8");

  const emailExact = rows.filter((r) => r.email_match === "exact").length;
  const emailClose = rows.filter((r) => r.email_match === "close").length;
  const phoneExact = rows.filter((r) => r.phone_match === "exact").length;
  const phoneClose = rows.filter((r) => r.phone_match === "close").length;

  const stats = getApolloStats();

  console.log("\n=========== CALIBRATION REPORT ===========");
  console.log(`Sample size      : ${rows.length}`);
  console.log(`Credits spent    : ${creditsSpent} (enrichPerson calls)`);
  console.log(`Free reqs total  : ${stats.totalRequests}`);
  console.log(`Email accuracy   : ${emailExact} exact, ${emailClose} close (of ${rows.length})`);
  console.log(`Phone accuracy   : ${phoneExact} exact, ${phoneClose} close (of ${rows.length})`);
  console.log(`Report           : ${reportPath}`);
  console.log("==========================================\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
