import { callClaude, extractJson } from "./anthropic.js";
import { editorialContext } from "./context.js";
import type { CostTracker } from "./cost.js";
import type { Config, Profile, ScoredItem, Sources, SynthesisedDigest } from "./types.js";

const SYNTH_MAX_TOKENS = 4_000;

function laneCaps(sources: Sources): Map<string, number> {
  return new Map(sources.lanes.filter((l) => l.max_items !== undefined).map((l) => [l.id, l.max_items as number]));
}

function synthSystem(config: Config, profile: Profile, sources: Sources): string {
  const capLines = [...laneCaps(sources).entries()]
    .map(([lane, cap]) => `- The ${lane} lane gets at most ${cap} item${cap === 1 ? "" : "s"}, and only if something real happened. Never manufacture an item to fill a lane.`)
    .join("\n");
  return `${editorialContext(profile.context)}

You are the digest writer. You receive the day's surviving items (already triaged) and produce the digest content as JSON. A renderer turns your JSON into the email, so follow the schema exactly.

Editorial rules:
- Select at most ${config.digest.max_items} items in total across all sections. Fewer is better. Cut anything whose "so what" would be generic.
${capLines || "- Never manufacture an item to fill a lane."}
- headline: the story rewritten in plain English, maximum 12 words.
- what: maximum two sentences. Facts only, no commentary. Paraphrase; never copy more than a short phrase from the source. Never invent a fact, figure or quote. If only a headline is available for a paywalled source, say "headline only, paywalled" in "what" rather than guessing.
- soWhat: one line, specific to the reader. Name the conversation, report section, objection or prospect angle. "Cite in section 3 of the report" beats "relevant to your work".
- oneThing: the single most important item of the day. whatHappened: two sentences. whyItMatters: one sentence tied to the reader specifically.
- twoMoves: up to two actions, each doable in under 20 minutes, each derived from a selected item, and each referencing something on the reader's current plate (listed below). If nothing warrants a move, use ["None today"].
- radar: exactly ${config.digest.radar_items} one-line mentions of things not worth a full item, drawn from the remaining items. Fewer if there are not enough items.
- Refer to items ONLY by their itemId. Never write a URL yourself.
- UK English. No em dashes. No exclamation marks. No hype.

The reader's current plate (the only things twoMoves may reference):
${profile.plate.map((p) => `- ${p}`).join("\n")}

Respond with ONLY JSON in this shape:
{
  "oneThing": {"itemId": "...", "whatHappened": "...", "whyItMatters": "..."},
  "sections": [{"lane": "<lane id>", "items": [{"itemId": "...", "headline": "...", "what": "...", "soWhat": "..."}]}],
  "twoMoves": ["...", "..."],
  "radar": ["...", "...", "..."]
}`;
}

function synthUser(items: ScoredItem[], dateLabel: string): string {
  const lines = items.map((item) =>
    JSON.stringify({
      itemId: item.id,
      lane: item.lane,
      source: item.sourceName,
      title: item.title,
      date: item.publishedAt?.slice(0, 10) ?? "unknown",
      summary: item.summary,
      triageScore: item.score,
      triageReason: item.reason,
    }),
  );
  return `Date: ${dateLabel}\nSurviving items (${items.length}):\n${lines.join("\n")}`;
}

export function validateDigest(
  digest: SynthesisedDigest,
  items: ScoredItem[],
  config: Config,
  sources: Sources,
): string[] {
  const problems: string[] = [];
  const ids = new Set(items.map((i) => i.id));
  const laneOf = new Map(items.map((i) => [i.id, i.lane]));
  const caps = laneCaps(sources);
  const used = new Set<string>();

  if (!digest.oneThing?.itemId || !ids.has(digest.oneThing.itemId)) {
    problems.push(`oneThing.itemId ${digest.oneThing?.itemId} is not a real item id`);
  }
  let total = 0;
  const seenLanes = new Set<string>();
  for (const section of digest.sections ?? []) {
    if (seenLanes.has(section.lane)) problems.push(`lane ${section.lane} appears in two sections`);
    seenLanes.add(section.lane);
    for (const item of section.items ?? []) {
      total += 1;
      if (!ids.has(item.itemId)) problems.push(`unknown itemId ${item.itemId}`);
      else if (laneOf.get(item.itemId) !== section.lane) {
        problems.push(`itemId ${item.itemId} placed in wrong lane ${section.lane}`);
      }
      if (used.has(item.itemId)) problems.push(`itemId ${item.itemId} used twice`);
      used.add(item.itemId);
      if (!item.headline || !item.what || !item.soWhat) problems.push(`item ${item.itemId} missing a field`);
      if (/https?:\/\//.test(`${item.headline} ${item.what} ${item.soWhat}`)) {
        problems.push(`item ${item.itemId} contains a raw URL`);
      }
    }
  }
  if (total === 0) problems.push("no items selected");
  if (total > config.digest.max_items) problems.push(`selected ${total} items, maximum is ${config.digest.max_items}`);
  for (const section of digest.sections ?? []) {
    const cap = caps.get(section.lane);
    if (cap !== undefined && section.items.length > cap) {
      problems.push(`lane ${section.lane} is capped at ${cap} item${cap === 1 ? "" : "s"}`);
    }
  }
  if (!Array.isArray(digest.twoMoves) || digest.twoMoves.length === 0 || digest.twoMoves.length > 2) {
    problems.push("twoMoves must have one or two entries");
  }
  return problems;
}

/** Write the digest with the synthesis model; validate and retry once on schema problems. */
export async function synthesise(
  items: ScoredItem[],
  config: Config,
  profile: Profile,
  sources: Sources,
  dateLabel: string,
  cost: CostTracker,
): Promise<SynthesisedDigest> {
  const system = synthSystem(config, profile, sources);
  let userMessage = synthUser(items, dateLabel);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await callClaude({
      model: config.models.synthesis,
      system,
      userMessage,
      maxTokens: SYNTH_MAX_TOKENS,
    });
    cost.add(config.models.synthesis, res.usage);
    const digest = extractJson<SynthesisedDigest>(res.text);
    const problems = validateDigest(digest, items, config, sources);
    if (problems.length === 0) return digest;
    if (attempt === 2) throw new Error(`Synthesis failed validation twice: ${problems.join("; ")}`);
    userMessage += `\n\nYour previous answer had these problems, fix them and respond with corrected JSON only:\n${problems.map((p) => `- ${p}`).join("\n")}`;
  }
  throw new Error("unreachable");
}
