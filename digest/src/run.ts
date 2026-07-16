import { join } from "node:path";
import { DIGEST_ROOT, loadConfig, loadProfile, loadSources } from "./config.js";
import { CostTracker } from "./cost.js";
import { dedupe, loadSeenCache, pruneSeenCache, saveSeenCache } from "./dedupe.js";
import { archivePath, logDigestItems, sendEmail, sendErrorEmail, writeArchive } from "./deliver.js";
import { fetchAllFeeds } from "./feeds.js";
import { DEFAULT_MASTHEAD, londonDayLabel, renderDigest } from "./format.js";
import { dropDeadLinks } from "./linkcheck.js";
import { synthesise } from "./synthesise.js";
import { triage } from "./triage.js";
import { searchLane } from "./websearch.js";
import type { Config, Profile, ScoredItem, SeenCache, Sources } from "./types.js";

/**
 * On a public repository, Actions run logs are world-readable, so digest
 * content must never be printed there. In CI the digest always goes by email
 * (dry runs and backfills get a subject prefix); locally it prints to stdout.
 */
const IN_CI = process.env.GITHUB_ACTIONS === "true";

export interface RunOptions {
  dryRun: boolean;
  backfillDays: number;
  noSearch: boolean;
  /** Stop after fetch + dedupe and print per-lane counts. Needs no secrets. */
  fetchOnly: boolean;
}

const SEEN_CACHE_PATH = join(DIGEST_ROOT, "data", "seen-cache.json");

function isoDateIn(timezone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function windowFor(config: Config, end: Date): { start: Date; end: Date } {
  const isMonday = londonDayLabel(end, config.timezone) === "Monday";
  const hours = isMonday ? config.digest.monday_window_hours : config.digest.window_hours;
  return { start: new Date(end.getTime() - hours * 3_600_000), end };
}

/** Enforce lane caps before synthesis so the model never sees over-quota input. */
export function applyLaneCaps(items: ScoredItem[], sources: Sources): ScoredItem[] {
  const capped: ScoredItem[] = [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const lane = sources.lanes.find((l) => l.id === item.lane);
    const cap = lane?.max_items ?? Infinity;
    const used = counts.get(item.lane) ?? 0;
    if (used >= cap) continue;
    counts.set(item.lane, used + 1);
    capped.push(item);
  }
  return capped;
}

async function runOnce(
  config: Config,
  sources: Sources,
  profile: Profile,
  end: Date,
  seen: SeenCache,
  options: { email: boolean; backfill: boolean; noSearch: boolean; updateCache: boolean; fetchOnly?: boolean },
): Promise<void> {
  const cost = new CostTracker(config.pricing);
  const { start, end: windowEnd } = windowFor(config, end);
  const isoDate = isoDateIn(config.timezone, windowEnd);
  console.log(`\n=== Digest for ${isoDate} (window ${start.toISOString()} -> ${windowEnd.toISOString()}) ===`);

  // Stage 1: fetch.
  const { items: feedItems, failures } = await fetchAllFeeds(
    sources.lanes,
    start,
    windowEnd,
    config.digest.per_feed_item_cap,
  );
  for (const f of failures) console.error(`Feed failed: ${f.sourceId}: ${f.error}`);
  const searchItems = options.noSearch
    ? []
    : (
        await Promise.all(sources.lanes.map((lane) => searchLane(lane, config, profile, start, windowEnd, cost)))
      ).flat();
  const scanned = feedItems.length + searchItems.length;
  console.log(`Fetched ${feedItems.length} feed items and ${searchItems.length} search items`);

  // Stage 2: dedupe. The caller owns loading and saving; mutating the shared
  // entries list here lets backfill days deduplicate against each other.
  const { fresh, additions } = dedupe([...feedItems, ...searchItems], seen, windowEnd);
  seen.entries.push(...additions);
  console.log(`${fresh.length} items after dedupe (${scanned - fresh.length} duplicates removed)`);

  if (options.fetchOnly) {
    const perLane = new Map<string, number>();
    for (const item of fresh) perLane.set(item.lane, (perLane.get(item.lane) ?? 0) + 1);
    for (const lane of sources.lanes) {
      console.log(`  ${lane.id}: ${perLane.get(lane.id) ?? 0} items`);
    }
    return;
  }

  // Stage 3: triage.
  const survivors = fresh.length > 0 ? await triage(fresh, config, profile, cost) : [];
  console.log(`${survivors.length} items survived triage at score >= ${config.digest.min_triage_score}`);

  if (survivors.length === 0) {
    // Never email an empty digest; say so in the log and stop cleanly.
    console.log("Nothing earned its place today; not sending a digest.");
    console.log(cost.report());
    if (options.updateCache) saveSeenCache(SEEN_CACHE_PATH, seen);
    return;
  }

  // Stage 3.5: no dead links reach the digest.
  const { alive, dropped } = await dropDeadLinks(survivors);
  for (const d of dropped) console.error(`Dropped dead link: ${d.url}`);

  // Stage 4: synthesise.
  const capped = applyLaneCaps(alive, sources);
  const digest = await synthesise(capped, config, profile, sources, isoDate, cost);
  const masthead = profile.masthead ?? DEFAULT_MASTHEAD;
  const text = renderDigest(digest, capped, sources, config, {
    date: windowEnd,
    timezone: config.timezone,
    scanned,
    recipient: profile.recipient,
    masthead,
  });

  // Stage 5: deliver. CI logs are public, so content is only ever printed on
  // a local machine; in CI even dry runs and backfills reach you by email.
  if (!IN_CI) {
    console.log("\n----- digest -----\n");
    console.log(text);
    console.log("------------------\n");
  }
  const itemCount = digest.sections.reduce((n, s) => n + s.items.length, 0);
  const prefix = options.email ? "" : options.backfill ? "[backfill] " : "[dry-run] ";
  if (options.email || IN_CI) {
    await sendEmail(config.sender, profile.recipient, `${prefix}${masthead} — ${isoDate} (${itemCount} items)`, text);
    console.log(`Emailed ${prefix || "digest "}to the configured recipient`);
  }
  // Local archive copies only: committed archives would be public.
  if (!IN_CI && (options.email || options.backfill)) writeArchive(archivePath(isoDate, options.backfill), text);
  if (options.email) logDigestItems(isoDate, digest, capped);
  if (options.updateCache) saveSeenCache(SEEN_CACHE_PATH, seen);

  const report = cost.report();
  console.log(report);
  if (cost.totalGbp() > config.budget.run_alert_gbp) {
    console.error(`WARNING: run cost exceeded ${config.budget.run_alert_gbp * 100}p budget`);
  }
}

export async function run(options: RunOptions): Promise<void> {
  const config = loadConfig();
  const sources = loadSources();
  let profile: Profile | null = null;

  try {
    // fetch-only needs no profile: it runs in CI without secrets.
    profile = options.fetchOnly
      ? { recipient: "nobody@example.invalid", context: "fetch-only placeholder context block", plate: ["none"] }
      : loadProfile();
    if (options.backfillDays > 0) {
      // Backfill never marks the live seen cache, but the days share an
      // in-memory copy so overlapping windows deduplicate.
      const seen = pruneSeenCache(loadSeenCache(SEEN_CACHE_PATH), config.digest.seen_cache_days, new Date());
      for (let d = options.backfillDays; d >= 1; d -= 1) {
        const end = new Date(Date.now() - (d - 1) * 86_400_000);
        await runOnce(config, sources, profile, end, seen, {
          email: false,
          backfill: true,
          noSearch: options.noSearch,
          updateCache: false,
          fetchOnly: options.fetchOnly,
        });
      }
      return;
    }
    const now = new Date();
    const seen = pruneSeenCache(loadSeenCache(SEEN_CACHE_PATH), config.digest.seen_cache_days, now);
    await runOnce(config, sources, profile, now, seen, {
      email: !options.dryRun,
      backfill: false,
      noSearch: options.noSearch,
      updateCache: !options.dryRun && !options.fetchOnly,
      fetchOnly: options.fetchOnly,
    });
  } catch (error) {
    console.error("Digest run failed:", error);
    if (profile) await sendErrorEmail(config.sender, profile.recipient, error);
    process.exitCode = 1;
  }
}
