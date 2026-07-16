import { callClaude, extractJson } from "./anthropic.js";
import { editorialContext } from "./context.js";
import type { CostTracker } from "./cost.js";
import type { Config, Profile, RawItem, ScoredItem } from "./types.js";

const TRIAGE_MAX_TOKENS = 2_000;

const TRIAGE_RULES = `You are the triage filter. For each item you receive, score relevance 0-5:
5 = directly usable this week for one of the five uses; the reader would act on it
4 = clearly usable; a specific conversation, citation or outreach hook is obvious
3 = usable with a little work; the specific use can be named
2 = topical but generic; the "so what" would be a platitude
1 = tangential
0 = noise

Hard rules:
- If you cannot name a SPECIFIC use (which conversation, which report section, which objection or prospect angle), the score is at most 2.
- Vendor marketing scores at most 2 unless it changes what the reader can build or sell.
- Duplicate coverage of a story you have already scored in this batch: give the weaker item 0.
- The reason must name the use in under 15 words, e.g. "report section 3: regulator position on AI in audit evidence" not "relevant to AI".

Respond with ONLY a JSON array: [{"i": <index>, "score": <0-5>, "reason": "<use, under 15 words>"}]. One entry per item, same order.`;

function batchPrompt(items: RawItem[]): string {
  const lines = items.map((item, i) =>
    JSON.stringify({
      i,
      lane: item.lane,
      source: item.sourceName,
      title: item.title,
      summary: item.summary.slice(0, 300),
      date: item.publishedAt?.slice(0, 10) ?? "unknown",
    }),
  );
  return `Score these ${items.length} items:\n${lines.join("\n")}`;
}

interface TriageVerdict {
  i: number;
  score: number;
  reason: string;
}

/** Score items in batches with the cheap triage model; keep score >= threshold. */
export async function triage(
  items: RawItem[],
  config: Config,
  profile: Profile,
  cost: CostTracker,
): Promise<ScoredItem[]> {
  const survivors: ScoredItem[] = [];
  const batchSize = config.models.triage_batch_size;
  const system = `${editorialContext(profile.context)}\n\n${TRIAGE_RULES}`;

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const res = await callClaude({
      model: config.models.triage,
      system,
      userMessage: batchPrompt(batch),
      maxTokens: TRIAGE_MAX_TOKENS,
    });
    cost.add(config.models.triage, res.usage);

    let verdicts: TriageVerdict[];
    try {
      verdicts = extractJson<TriageVerdict[]>(res.text);
    } catch (err) {
      console.error(`Warning: unparseable triage batch (items ${start}-${start + batch.length - 1}): ${String(err)}`);
      continue;
    }
    for (const v of verdicts) {
      const item = batch[v.i];
      if (!item || typeof v.score !== "number") continue;
      if (v.score >= config.digest.min_triage_score) {
        survivors.push({ ...item, score: v.score, reason: v.reason ?? "" });
      }
    }
  }

  return survivors.sort((a, b) => b.score - a.score);
}
