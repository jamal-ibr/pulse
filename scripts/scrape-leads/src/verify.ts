import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./config.js";
import { fetchUrl } from "./utils/http.js";
import { phoneDigits } from "./utils/normalise.js";
import type { Lead } from "./types.js";

const DATA_DIR = resolve(ROOT, "data");
const runTag = process.argv[2] ?? "full";
const latestPath = resolve(DATA_DIR, `latest-${runTag}.json`);
if (!existsSync(latestPath)) {
  console.error(`No latest run found at ${latestPath}`);
  process.exit(1);
}
const { jsonPath } = JSON.parse(readFileSync(latestPath, "utf8")) as { jsonPath: string };
const data = JSON.parse(readFileSync(jsonPath, "utf8")) as { leads: Lead[] };

function randomSample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length) {
    const i = Math.floor(Math.random() * a.length);
    out.push(a.splice(i, 1)[0]);
  }
  return out;
}

async function main(): Promise<void> {
  if (!data.leads?.length) { console.log("No leads to verify."); return; }
  const sample = randomSample(data.leads, Math.min(10, data.leads.length));
  console.log("\n=========== PHASE 8: VERIFY ===========");
  let pass = 0;
  for (let i = 0; i < sample.length; i++) {
    const lead = sample[i];
    const url = lead.phone_source_url || lead.email_source_url || lead.invisalign_source_url || lead.owner_source_url || lead.website;
    if (!url) { console.log(`${i + 1}. [${lead.name}] — no source URL; SKIP`); continue; }
    const r = await fetchUrl(url, { acceptHtml: true });
    if (!r.ok) {
      console.log(`${i + 1}. [${lead.name}] ${url} — HTTP ${r.status}; FAIL`);
      continue;
    }
    const body = r.body;
    const checks: string[] = [];
    let ok = true;
    if (lead.phone) {
      const digits = phoneDigits(lead.phone);
      // match by digits, allowing spaces/dashes
      const bodyDigits = body.replace(/[^\d]/g, "");
      if (bodyDigits.includes(digits)) checks.push("phone✓");
      else { checks.push("phone✗"); ok = false; }
    }
    if (lead.email) {
      if (body.toLowerCase().includes(lead.email.toLowerCase())) checks.push("email✓");
      else { checks.push("email✗"); ok = false; }
    }
    if (lead.owner_name && lead.owner_source_url === url) {
      // Owner name check only when the URL we fetched is the owner source
      const parts = lead.owner_name.split(/\s+/).filter((p) => p.length > 2);
      const hit = parts.some((p) => body.toLowerCase().includes(p.toLowerCase()));
      checks.push(hit ? "owner✓" : "owner✗");
      if (!hit) ok = false;
    }
    if (ok && checks.length > 0) pass++;
    console.log(`${i + 1}. [${lead.name}] ${url} — ${checks.join(" ") || "no checks"}${ok ? "  PASS" : "  FAIL"}`);
  }
  console.log(`\nVerification: ${pass}/${sample.length} rows passed a re-fetch check.`);
  console.log("=========================================\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
