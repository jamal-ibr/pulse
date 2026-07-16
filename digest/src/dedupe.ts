import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { RawItem, SeenCache, SeenEntry } from "./types.js";

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|cmpid|icid|ref_src)/;
const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "is", "it",
  "of", "on", "or", "the", "to", "with", "its", "how", "why", "what",
]);
const FUZZY_THRESHOLD = 0.8;

export function normaliseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim().toLowerCase();
  }
  u.hash = "";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k.toLowerCase()));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  const host = u.host.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${host}${path}${u.search}`;
}

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function titleKey(title: string): string {
  return [...titleTokens(title)].sort().join(" ");
}

export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

export function loadSeenCache(path: string): SeenCache {
  if (!existsSync(path)) return { entries: [] };
  try {
    const cache = JSON.parse(readFileSync(path, "utf8")) as SeenCache;
    return Array.isArray(cache.entries) ? cache : { entries: [] };
  } catch {
    // A corrupt cache should not kill the run; worst case is one repeat story.
    console.error(`Warning: seen cache at ${path} is corrupt, starting fresh`);
    return { entries: [] };
  }
}

export function pruneSeenCache(cache: SeenCache, maxAgeDays: number, now: Date): SeenCache {
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  return { entries: cache.entries.filter((e) => new Date(e.firstSeen).getTime() >= cutoff) };
}

export function saveSeenCache(path: string, cache: SeenCache): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2) + "\n");
}

function setSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function isSeen(item: RawItem, cache: SeenCache): boolean {
  const url = normaliseUrl(item.url);
  const key = titleKey(item.title);
  return cache.entries.some(
    (e) => e.url === url || e.titleKey === key || titleSimilarity(e.titleKey, key) >= FUZZY_THRESHOLD,
  );
}

/** Remove items already in the seen cache and in-batch duplicates. Pure: returns new arrays. */
export function dedupe(items: RawItem[], cache: SeenCache, now: Date): { fresh: RawItem[]; additions: SeenEntry[] } {
  const fresh: RawItem[] = [];
  const additions: SeenEntry[] = [];
  const seenUrls = new Set(cache.entries.map((e) => e.url));
  // Tokenise cache titles once instead of per compared item.
  const seenTokens = cache.entries.map((e) => titleTokens(e.titleKey));
  const batchUrls = new Set<string>();
  const batchTokens: Set<string>[] = [];

  for (const item of items) {
    const url = normaliseUrl(item.url);
    const tokens = titleTokens(item.title);
    const matches = (known: Set<string>[]) => known.some((k) => setSimilarity(k, tokens) >= FUZZY_THRESHOLD);
    if (batchUrls.has(url) || seenUrls.has(url) || matches(batchTokens) || matches(seenTokens)) continue;
    batchUrls.add(url);
    batchTokens.push(tokens);
    fresh.push(item);
    additions.push({ url, titleKey: [...tokens].sort().join(" "), firstSeen: now.toISOString() });
  }
  return { fresh, additions };
}
