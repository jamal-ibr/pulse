import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { callClaude } from "./anthropic.js";
import { DIGEST_ROOT, loadConfig, loadProfile } from "./config.js";
import { editorialContext } from "./context.js";
import { CostTracker } from "./cost.js";
import { sendEmail } from "./deliver.js";

const LOOKBACK_DAYS = 7;
const TUNE_MAX_TOKENS = 3_000;

interface DigestLog {
  type: "digest";
  date: string;
  items: { id: string; lane: string; source: string; headline: string; url: string }[];
}
interface RatingLog {
  type: "rating";
  date: string;
  rating: string;
}

function loadFeedback(): (DigestLog | RatingLog)[] {
  const path = join(DIGEST_ROOT, "data", "feedback.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as DigestLog | RatingLog;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is DigestLog | RatingLog => entry !== null);
}

const config = loadConfig();
const profile = loadProfile();
const cost = new CostTracker(config.pricing);
const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
const recent = loadFeedback().filter((e) => e.date >= cutoff);
const ratings = recent.filter((e): e is RatingLog => e.type === "rating");
const digests = recent.filter((e): e is DigestLog => e.type === "digest");

if (digests.length === 0 && ratings.length === 0) {
  console.log("No feedback or digest logs in the last 7 days; nothing to tune.");
  process.exit(0);
}

const laneCounts = new Map<string, number>();
const sourceCounts = new Map<string, number>();
for (const d of digests) {
  for (const item of d.items) {
    laneCounts.set(item.lane, (laneCounts.get(item.lane) ?? 0) + 1);
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
  }
}

const stats = [
  `Digests sent: ${digests.length}`,
  `Ratings: ${ratings.map((r) => `${r.date}=${r.rating}`).join(", ") || "none logged"}`,
  `Items per lane: ${[...laneCounts.entries()].map(([lane, n]) => `${lane}=${n}`).join(", ") || "none"}`,
  `Items per source: ${[...sourceCounts.entries()].map(([source, n]) => `${source}=${n}`).join(", ") || "none"}`,
].join("\n");

const sourcesYaml = readFileSync(join(DIGEST_ROOT, "sources.yaml"), "utf8");

const prompt = `You review a personal digest's last ${LOOKBACK_DAYS} days and PROPOSE tuning edits. You never apply them.

Stats:
${stats}

Current sources.yaml:
${sourcesYaml}

Produce a short markdown report with:
1. What the ratings say (or that no ratings were logged, in which case say the loop is running blind).
2. Lanes that are underweight or overweight relative to their configured weight.
3. Feeds or search topics that produced nothing all week: candidates to replace.
4. Up to three concrete proposed edits (exact YAML snippets or triage prompt wording), each labelled PROPOSAL, none applied.
UK English. No em dashes. No exclamation marks.`;

const res = await callClaude({
  model: config.models.synthesis,
  system: editorialContext(profile.context),
  userMessage: prompt,
  maxTokens: TUNE_MAX_TOKENS,
});
cost.add(config.models.synthesis, res.usage);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());

// Proposal text is written with the personal context, so it never goes to CI
// logs or the repo: email in CI, local gitignored file otherwise.
if (process.env.GITHUB_ACTIONS !== "true") {
  const outDir = join(DIGEST_ROOT, "proposals");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${today}-tune.md`);
  writeFileSync(outPath, res.text + "\n");
  console.log(`Wrote proposal to ${outPath}`);
}
console.log(cost.report());

if (process.env.RESEND_API_KEY) {
  await sendEmail(config.sender, profile.recipient, `Digest tuning proposals — ${today}`, res.text);
  console.log("Emailed proposals to the configured recipient");
}
