import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setMaxApolloCredits, getApolloCreditsUsed, getApolloStats, getApolloMaxCredits } from "./sources/apollo.js";
import { enrichDecisionMakerContacts, ensureNewColumns, newColumnNames, type LeadRow } from "./upgrades/decision-maker.js";
import { OUTREACH_COLUMNS } from "./utils/outreach-csv.js";
import { getCacheStats } from "./utils/apollo-cache.js";
import { log } from "./utils/logger.js";

interface CliArgs {
  input?: string;
  output?: string;
  maxEnrich: number;
  phoneOnly: boolean;
}

function parseArgs(): CliArgs {
  const out: CliArgs = {
    maxEnrich: Number(process.env.MAX_ENRICH ?? 20),
    phoneOnly: process.env.PHONE_ONLY === "1",
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--output" || a === "-o") out.output = argv[++i];
    else if (a === "--max-enrich") out.maxEnrich = Number(argv[++i]);
    else if (a === "--phone-only") out.phoneOnly = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage:",
          "  npm run leads:enhance -- --input <leads.csv> [--output <leads_v2.csv>] [--max-enrich N] [--phone-only]",
          "",
          "Env:",
          "  MAX_APOLLO_CREDITS_PER_RUN  Hard cap on paid Apollo calls (default 100)",
          "  MAX_ENRICH                  Default for --max-enrich (default 20)",
          "  PHONE_ONLY=1                Default to --phone-only",
        ].join("\n"),
      );
      process.exit(0);
    }
  }
  return out;
}

function parseCsv(text: string): { header: string[]; rows: LeadRow[] } {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows: LeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseCsvLine(lines[i]);
    const row: LeadRow = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cells[j] ?? "";
    rows.push(row);
  }
  return { header, rows };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

function csvCell(v: string): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path: string, columns: string[], rows: LeadRow[]): void {
  const header = columns.join(",");
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c] ?? "")).join(","));
  writeFileSync(path, [header, ...lines].join("\n") + "\n", "utf8");
}

function defaultOutput(input: string): string {
  if (/_v\d+\.csv$/i.test(input)) return input.replace(/_v(\d+)\.csv$/i, (_, n) => `_v${Number(n) + 1}.csv`);
  return input.replace(/\.csv$/i, "_v2.csv");
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.input) {
    console.error("Missing --input. Run with --help for usage.");
    process.exit(1);
  }
  if (!existsSync(args.input)) {
    console.error(`Input not found: ${args.input}`);
    process.exit(1);
  }

  const outputPath = args.output ?? defaultOutput(args.input);

  // Apply credit cap from env (default already wired in apollo.ts; this lets
  // CLI rerun set a fresh value if the env was changed since boot).
  const envMax = Number(process.env.MAX_APOLLO_CREDITS_PER_RUN ?? 100);
  setMaxApolloCredits(envMax);

  log.info(
    `enhance start: input=${basename(args.input)} output=${basename(outputPath)} maxEnrich=${args.maxEnrich} phoneOnly=${args.phoneOnly} maxCredits=${envMax}`,
  );

  const csvText = readFileSync(args.input, "utf8");
  const { header, rows } = parseCsv(csvText);
  log.info(`loaded ${rows.length} leads (${header.length} columns)`);

  let report;
  try {
    report = await enrichDecisionMakerContacts(rows, { maxEnrich: args.maxEnrich, phoneOnly: args.phoneOnly });
  } catch (e) {
    log.error(`enhance halted: ${(e as Error).message}`);
    // Even on credit-cap halt, write what we have so far.
    ensureNewColumns(rows);
    const columnsSoFar = mergeColumns(header, newColumnNames());
    writeCsv(outputPath, columnsSoFar, rows);
    log.info(`partial output written: ${outputPath}`);
    process.exit(1);
  }

  const finalColumns = mergeColumns(header, newColumnNames());
  // Also fold in any official OUTREACH_COLUMNS that the input was missing.
  for (const c of OUTREACH_COLUMNS) {
    if (!finalColumns.includes(c)) finalColumns.push(c);
  }
  writeCsv(outputPath, finalColumns, rows);

  const stats = getApolloStats();
  const cache = getCacheStats();
  const creditsUsed = getApolloCreditsUsed();
  const maxCredits = getApolloMaxCredits();

  console.log("\n=========== ENHANCE REPORT ===========");
  console.log(`Input              : ${args.input}`);
  console.log(`Output             : ${outputPath}`);
  console.log(`Mode               : ${args.phoneOnly ? "phone-only" : "phone + email cleanup"}`);
  console.log(`Enriched top       : ${report.enrichedAttempted} of ${rows.length} (cap ${args.maxEnrich})`);
  console.log(`Cache hits         : ${report.cacheHits}`);
  console.log(`Phones found       : ${report.phonesFound}`);
  console.log(`Phones not found   : ${report.phonesNotFound}`);
  if (!args.phoneOnly) {
    console.log(`Emails rejected    : ${report.emailsRejected}`);
    console.log(`Emails fixed (scrape): ${report.emailsFixedByScrape}`);
    console.log(`Emails for review  : ${report.emailsNeedingReview}`);
  }
  console.log(`Apollo credits     : ${creditsUsed} / ${maxCredits}`);
  console.log(`Apollo free reqs   : ${stats.totalRequests} (${JSON.stringify(stats.byType)})`);
  console.log(`Cache entries      : ${cache.entries} (fresh ${cache.freshEntries})`);
  if (report.contradictions.length > 0) {
    console.log(`\nContradictions (${report.contradictions.length}):`);
    for (const c of report.contradictions) {
      console.log(`  ${c.practice} :: ${c.field} :: have="${c.existing}" apollo="${c.apollo}"`);
    }
  } else {
    console.log(`Contradictions     : 0`);
  }
  console.log("=====================================\n");
}

function mergeColumns(originalHeader: string[], additions: string[]): string[] {
  const out = [...originalHeader];
  for (const c of additions) if (!out.includes(c)) out.push(c);
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
