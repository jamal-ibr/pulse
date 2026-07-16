import type { Config, ScoredItem, SynthesisedDigest, Sources } from "./types.js";

const RULE = "━━━";
const WORDS_PER_MINUTE = 200;

function formatDateLabel(date: Date, timezone: string): string {
  // en-GB inserts a comma after the weekday; the digest format has none.
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  })
    .format(date)
    .replace(",", "");
}

function section(title: string, body: string): string {
  return `${RULE} ${title} ${RULE}\n${body}`;
}

function wrapTo(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export interface RenderMeta {
  date: Date;
  timezone: string;
  scanned: number;
  recipient: string;
  masthead: string;
}

export const DEFAULT_MASTHEAD = "DAILY DIGEST";

/**
 * Deterministic renderer: the model only ever supplies text and item IDs, so
 * every link in the email comes from a fetched, link-checked item.
 */
export function renderDigest(
  digest: SynthesisedDigest,
  items: ScoredItem[],
  sources: Sources,
  config: Config,
  meta: RenderMeta,
): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const laneTitles = new Map(sources.lanes.map((l) => [l.id, l.title]));
  const laneOrder = new Map(sources.lanes.map((l, i) => [l.id, i]));
  const parts: string[] = [];

  const totalItems = digest.sections.reduce((n, s) => n + s.items.length, 0);

  const one = byId.get(digest.oneThing.itemId);
  const oneBody = `${wrapTo(`${digest.oneThing.whatHappened} ${digest.oneThing.whyItMatters}`, 76, " ")}\n→ ${one?.url ?? ""}`;

  const sectionBlocks = [...digest.sections]
    .filter((s) => s.items.length > 0)
    .sort((a, b) => (laneOrder.get(a.lane) ?? 99) - (laneOrder.get(b.lane) ?? 99))
    .map((s) => {
      const body = s.items
        .map((item) => {
          const src = byId.get(item.itemId);
          return [
            `▸ ${item.headline}`,
            `  What: ${wrapTo(item.what, 74, "        ")}`,
            `  So what: ${wrapTo(item.soWhat, 71, "           ")}`,
            `  → ${src?.url ?? ""}`,
          ].join("\n");
        })
        .join("\n\n");
      return section(laneTitles.get(s.lane) ?? s.lane.toUpperCase(), body);
    });

  const movesBody = digest.twoMoves.map((m, i) => `${i + 1}. ${wrapTo(m, 73, "   ")}`).join("\n");
  const radarBody = digest.radar.map((r) => `• ${wrapTo(r, 74, "  ")}`).join("\n");

  const header = `${meta.masthead} — ${formatDateLabel(meta.date, meta.timezone)}`;

  const bodyForCount = [oneBody, ...sectionBlocks, movesBody, radarBody].join("\n");
  const readMinutes = Math.max(1, Math.round(bodyForCount.split(/\s+/).length / WORDS_PER_MINUTE));

  parts.push(header);
  parts.push(`Read time: ~${readMinutes} min | ${totalItems} item${totalItems === 1 ? "" : "s"} from ${meta.scanned} scanned`);
  parts.push("");
  parts.push(section("TODAY'S ONE THING", oneBody));
  for (const block of sectionBlocks) {
    parts.push("");
    parts.push(block);
  }
  parts.push("");
  parts.push(section("TWO MOVES", movesBody));
  parts.push("");
  parts.push(section("ON THE RADAR", radarBody));
  parts.push("");
  parts.push(ratingFooter(meta.date, meta.timezone, meta.recipient));
  return parts.join("\n") + "\n";
}

export function ratingFooter(date: Date, timezone: string, recipient: string): string {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
  const link = (rating: string) =>
    `mailto:${recipient}?subject=${encodeURIComponent(`Digest rating ${iso}: ${rating}`)}`;
  return `Rate today: [useful] ${link("useful")}\n[thin] ${link("thin")}\n[off-target] ${link("off-target")}`;
}

export function londonDayLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: timezone }).format(date);
}
