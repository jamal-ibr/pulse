import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT } from "../config.js";
import { log } from "../utils/logger.js";
import type { OutreachLead } from "../types.js";
import { readOutreachCsv, resolveLatestOutreachCsv } from "./csv-reader.js";
import { loadSuppressionList, isSuppressed, suppressionDefaultPath } from "./suppression.js";
import { buildBrief } from "./brief.js";
import { classifyAngle } from "./angle.js";
import { buildSystemPrompt, buildUserPrompt, patternsForDeduplication, firstName } from "./prompt.js";
import { generateDraft, logClaudeUsage } from "./claude-client.js";
import { loadForbiddenConfig, validateForbiddenPhrases, validateNoDuplicatePattern, validateSignOff, validateWordCount, wordCount, type PriorDraft } from "./validators.js";
import { scoreConfidence } from "./confidence.js";
import { writeDraftsSheet } from "./output-sheet.js";
import { writeGmailDrafts, isGmailDraftsAvailable } from "./output-gmail.js";
import { writeSummary } from "./summary.js";
import type { BatchOutputs, DraftResult } from "./types.js";

const DATA_DIR = resolve(ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

interface CliArgs {
  input?: string;
  maxDrafts?: number;
  dryRun: boolean;
  suppressionPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--max-drafts") out.maxDrafts = Number(argv[++i]);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--suppression") out.suppressionPath = argv[++i];
  }
  return out;
}

function isEmailDeliverable(lead: OutreachLead): boolean {
  if (!lead.owner_email) return false;
  if (lead.owner_email === "needs_manual_review") return false;
  if (lead.email_extraction_error) return false;
  if (lead.owner_email_confidence !== "high" && lead.owner_email_confidence !== "medium") return false;
  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? resolveLatestOutreachCsv();
  if (!inputPath) {
    log.error("no input CSV — run npm run scrape:leads first, or pass --input <path>");
    process.exit(1);
  }
  if (!existsSync(inputPath)) {
    log.error(`input CSV not found: ${inputPath}`);
    process.exit(1);
  }
  log.info(`drafting: reading ${inputPath}`);
  const allLeads = readOutreachCsv(inputPath);
  const suppression = loadSuppressionList(args.suppressionPath ?? suppressionDefaultPath());
  log.info(`drafting: ${allLeads.length} leads loaded; ${suppression.size} on suppression list`);

  const candidates = allLeads
    .filter((l) => !isSuppressed(suppression, l))
    .sort((a, b) => b.fit_score - a.fit_score);
  const limited = typeof args.maxDrafts === "number" ? candidates.slice(0, args.maxDrafts) : candidates;

  const skipped: Array<{ practice_name: string; reason: string }> = [];
  for (const l of allLeads) {
    if (isSuppressed(suppression, l)) skipped.push({ practice_name: l.practice_name, reason: "on suppression list" });
  }

  const forbidden = loadForbiddenConfig();
  const allForbidden = [...forbidden.phrases, ...forbidden.phrases_word_boundary];
  const systemPrompt = buildSystemPrompt(allForbidden);

  const drafts: DraftResult[] = [];
  const priors: PriorDraft[] = [];

  for (let i = 0; i < limited.length; i++) {
    const lead = limited[i];
    const angle = classifyAngle(lead);
    const brief = await buildBrief(lead);
    const channel: DraftResult["channel"] = isEmailDeliverable(lead) ? "email" : "phone-or-role-inbox";
    const recentPatterns = priors.slice(-5).flatMap((p) => patternsForDeduplication(p));
    const correctiveFeedback: string[] = [];

    let attempt = 0;
    let finalDraft: { subject: string; body: string } | null = null;
    const reasons: string[] = [];
    while (attempt < 3) {
      attempt++;
      const userPrompt = buildUserPrompt({
        lead,
        angle: angle.angle,
        brief,
        recentDraftPatterns: recentPatterns,
        correctiveFeedback,
      });
      let candidate;
      try {
        candidate = await generateDraft({ systemPrompt, userPrompt });
      } catch (e) {
        log.warn(`draft ${lead.practice_name}: generate failed: ${(e as Error).message}`);
        reasons.push(`generate-error: ${(e as Error).message}`);
        break;
      }
      logClaudeUsage(`#${i + 1}.${attempt} ${lead.practice_name}`, candidate.raw);

      const protectedTokens = [
        ...firstName(lead.owner_name).toLowerCase().split(/\s+/),
        ...lead.practice_name.toLowerCase().split(/\s+/),
        ...(lead.city ? [lead.city.toLowerCase()] : []),
      ].filter(Boolean);

      const checks = [
        validateWordCount(candidate.body),
        validateForbiddenPhrases(`${candidate.subject}\n${candidate.body}`, forbidden),
        validateSignOff(candidate.body),
        validateNoDuplicatePattern({ subject: candidate.subject, body: candidate.body, protectedTokens }, priors),
      ];
      const failure = checks.find((c) => !c.ok);
      if (!failure) {
        finalDraft = candidate;
        break;
      }
      reasons.push(failure.reason);
      correctiveFeedback.length = 0;
      correctiveFeedback.push(failure.feedback);
      log.warn(`draft ${lead.practice_name} attempt ${attempt} rejected: ${failure.reason}`);
    }

    if (!finalDraft) {
      skipped.push({ practice_name: lead.practice_name, reason: `regeneration failed: ${reasons.join("; ") || "unknown"}` });
      continue;
    }

    const result: DraftResult = {
      lead,
      angle: angle.angle,
      angle_justification: angle.justification,
      brief,
      subject: finalDraft.subject,
      body: finalDraft.body,
      channel,
      confidence: scoreConfidence({ lead, angle: angle.angle, brief }),
      word_count: wordCount(finalDraft.body),
      regenerations: attempt - 1,
      regenerate_reasons: reasons,
    };
    drafts.push(result);
    priors.push({
      subject: result.subject,
      body: result.body,
      protectedTokens: [firstName(lead.owner_name).toLowerCase(), ...lead.practice_name.toLowerCase().split(/\s+/)],
    });
  }

  const outputs: BatchOutputs = { drafts, skipped };

  // ─── Output ────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let outputMethod: "gmail-drafts" | "sheet" = "sheet";
  let outputLocation = "";
  if (args.dryRun) {
    const local = resolve(DATA_DIR, `outreach-drafts-${stamp}.json`);
    writeFileSync(local, JSON.stringify(outputs, null, 2));
    outputLocation = local;
    log.ok(`drafts: dry-run — wrote ${local}`);
  } else if (isGmailDraftsAvailable()) {
    try {
      const gmail = await writeGmailDrafts(drafts);
      outputMethod = "gmail-drafts";
      outputLocation = `Gmail Drafts (${gmail.createdIds.length} created, ${gmail.failures} failed)`;
    } catch (e) {
      log.warn(`gmail drafts failed (${(e as Error).message}); falling back to Sheet`);
      const sheet = await writeDraftsSheet({ drafts, stamp });
      outputLocation = sheet.sheetUrl;
    }
  } else {
    const sheet = await writeDraftsSheet({ drafts, stamp });
    outputLocation = sheet.sheetUrl;
  }

  // Always write a local JSON of full draft objects so we can inspect later.
  const jsonPath = resolve(DATA_DIR, `outreach-drafts-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(outputs, null, 2));

  const summaryPath = resolve(DATA_DIR, `outreach_drafts_summary-${stamp}.md`);
  writeSummary(summaryPath, { outputs, outputMethod, outputLocation, totalProcessed: limited.length });
  writeFileSync(resolve(DATA_DIR, "outreach_drafts_summary.md"), JSON.stringify({ summaryPath, jsonPath, outputLocation, outputMethod }, null, 2));
  log.ok(`drafts: summary → ${summaryPath}`);

  // ─── Console summary ─────────────────────────────────────────────
  console.log("\n========== DRAFTS BATCH SUMMARY ==========");
  console.log(`Processed       : ${limited.length}`);
  console.log(`Drafts created  : ${drafts.length}`);
  console.log(`Skipped         : ${skipped.length}`);
  console.log(`Output          : ${outputMethod} → ${outputLocation}`);
  const angleCounts: Record<string, number> = {};
  const confCounts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const d of drafts) {
    angleCounts[d.angle] = (angleCounts[d.angle] ?? 0) + 1;
    confCounts[d.confidence]++;
  }
  console.log(`Angles          : ${JSON.stringify(angleCounts)}`);
  console.log(`Confidence      : ${JSON.stringify(confCounts)}`);
  console.log("==========================================\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
