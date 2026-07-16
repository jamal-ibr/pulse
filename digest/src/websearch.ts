import { callClaude, extractJson } from "./anthropic.js";
import { editorialContext } from "./context.js";
import { itemId } from "./feeds.js";
import type { CostTracker } from "./cost.js";
import type { Config, Lane, Profile, RawItem } from "./types.js";

const SEARCH_MAX_TOKENS = 2_000;
const MAX_RESULTS_PER_LANE = 6;

interface SearchHit {
  title: string;
  url: string;
  date: string | null;
  summary: string;
}

function searchPrompt(lane: Lane, windowStart: Date, windowEnd: Date): string {
  return `Search the web for genuinely new developments in the last ${Math.round(
    (windowEnd.getTime() - windowStart.getTime()) / 3_600_000,
  )} hours (today is ${windowEnd.toISOString().slice(0, 10)}) on these topics:

${lane.search_topics.map((t) => `- ${t}`).join("\n")}

Rules:
- Only include items published inside that window. If nothing real happened, return [].
- Never invent or guess a URL. Only return URLs that appeared in search results.
- Prefer primary sources (the regulator, the vendor, the firm) over aggregators.
- Return at most ${MAX_RESULTS_PER_LANE} items.

Respond with ONLY a JSON array: [{"title": "...", "url": "https://...", "date": "YYYY-MM-DD or null", "summary": "one or two factual sentences"}]`;
}

/** Cover feed-less topics with the Anthropic web_search tool, one call per lane. */
export async function searchLane(
  lane: Lane,
  config: Config,
  profile: Profile,
  windowStart: Date,
  windowEnd: Date,
  cost: CostTracker,
): Promise<RawItem[]> {
  if (!config.web_search.enabled || lane.search_topics.length === 0) return [];
  const res = await callClaude({
    model: config.models.triage,
    system: editorialContext(profile.context),
    userMessage: searchPrompt(lane, windowStart, windowEnd),
    maxTokens: SEARCH_MAX_TOKENS,
    webSearchMaxUses: config.web_search.max_uses_per_lane,
  });
  cost.add(config.models.triage, res.usage);

  let hits: SearchHit[];
  try {
    hits = extractJson<SearchHit[]>(res.text);
  } catch {
    console.error(`Warning: unparseable search response for lane ${lane.id}, skipping`);
    return [];
  }
  if (!Array.isArray(hits)) return [];

  return hits
    .filter((h) => h?.title && typeof h.url === "string" && h.url.startsWith("http"))
    .slice(0, MAX_RESULTS_PER_LANE)
    .map((h) => ({
      id: itemId(h.url, h.title),
      lane: lane.id,
      sourceId: "web_search",
      sourceName: "Web search",
      title: h.title,
      url: h.url,
      publishedAt: h.date ? new Date(h.date).toISOString() : null,
      summary: (h.summary ?? "").slice(0, 500),
    }));
}
