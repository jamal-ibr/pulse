import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Lane, RawItem } from "./types.js";

// A plain browser UA: some feeds (AccountingWEB) 403 anything with a bot suffix.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 25_000;
const SUMMARY_MAX_CHARS = 500;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // Entity-heavy feeds (EU digital strategy, Google Cloud) trip the parser's
  // expansion limit; stripHtml decodes the common entities instead.
  processEntities: false,
});

export function itemId(url: string, title: string): string {
  return createHash("sha256").update(`${url}|${title}`).digest("hex").slice(0, 12);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return String((value as Record<string, unknown>)["#text"]);
  return "";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
  pound: "£",
  euro: "€",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(\w+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripHtml(html: string): string {
  // Decode twice: feeds often double-encode HTML inside XML (&amp;lt;p&amp;gt;).
  const decoded = decodeEntities(decodeEntities(html));
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry["link"]) as Record<string, unknown>[];
  const alternate = links.find((l) => l["@_rel"] === "alternate" || l["@_rel"] === undefined);
  return String((alternate ?? links[0])?.["@_href"] ?? "");
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(+d) ? null : d.toISOString();
}

interface ParsedEntry {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

/** Parse RSS 2.0, Atom, or RDF feed XML into normalised entries. */
export function parseFeed(xml: string): ParsedEntry[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const entries: ParsedEntry[] = [];

  const rssItems = asArray(doc.rss?.channel?.item ?? doc["rdf:RDF"]?.item);
  for (const item of rssItems) {
    entries.push({
      title: stripHtml(text(item.title)),
      url: decodeEntities(text(item.link) || String(item.link?.["@_href"] ?? "")).trim(),
      publishedAt: parseDate(text(item.pubDate) || text(item["dc:date"])),
      summary: stripHtml(text(item.description)).slice(0, SUMMARY_MAX_CHARS),
    });
  }

  const atomEntries = asArray(doc.feed?.entry);
  for (const entry of atomEntries) {
    entries.push({
      title: stripHtml(text(entry.title)),
      url: decodeEntities(atomLink(entry)).trim(),
      publishedAt: parseDate(text(entry.published) || text(entry.updated)),
      summary: stripHtml(text(entry.summary) || text(entry.content)).slice(0, SUMMARY_MAX_CHARS),
    });
  }

  return entries.filter((e) => e.title && e.url);
}

async function fetchXml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export interface FeedFetchResult {
  items: RawItem[];
  failures: { sourceId: string; error: string }[];
}

/**
 * Fetch all feeds across lanes and keep items inside the time window.
 * Items with no parseable date are kept: some verified feeds (FCA) omit
 * dates, and the seen cache stops them repeating across runs.
 */
export async function fetchAllFeeds(
  lanes: Lane[],
  windowStart: Date,
  windowEnd: Date,
  perFeedCap: number,
): Promise<FeedFetchResult> {
  const failures: FeedFetchResult["failures"] = [];
  const perFeed = lanes.flatMap((lane) =>
    lane.feeds.map(async (feed): Promise<RawItem[]> => {
      try {
        const xml = await fetchXml(feed.url);
        return parseFeed(xml)
          .filter((e) => {
            if (!e.publishedAt) return true;
            const t = new Date(e.publishedAt).getTime();
            return t >= windowStart.getTime() && t <= windowEnd.getTime();
          })
          .slice(0, perFeedCap)
          .map((e) => ({
            id: itemId(e.url, e.title),
            lane: lane.id,
            sourceId: feed.id,
            sourceName: feed.name,
            title: e.title,
            url: e.url,
            publishedAt: e.publishedAt,
            summary: e.summary,
          }));
      } catch (err) {
        failures.push({ sourceId: feed.id, error: err instanceof Error ? err.message : String(err) });
        return [];
      }
    }),
  );
  const settled = await Promise.all(perFeed);
  return { items: settled.flat(), failures };
}
