export interface FeedSource {
  id: string;
  name: string;
  url: string;
}

export interface Lane {
  id: string;
  title: string;
  weight: number;
  max_items?: number;
  feeds: FeedSource[];
  search_topics: string[];
}

export interface Sources {
  lanes: Lane[];
}

export interface ModelPricing {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}

/**
 * Personal data lives outside the repo: the DIGEST_PROFILE secret (or the
 * gitignored digest/profile.local.yaml for local runs), never in config.yaml.
 */
export interface Profile {
  recipient: string;
  context: string;
  plate: string[];
  /** Email masthead and subject prefix. Defaults to "DAILY DIGEST". */
  masthead?: string;
}

export interface Config {
  sender: string;
  timezone: string;
  digest: {
    max_items: number;
    min_triage_score: number;
    radar_items: number;
    window_hours: number;
    monday_window_hours: number;
    seen_cache_days: number;
    per_feed_item_cap: number;
  };
  models: {
    triage: string;
    synthesis: string;
    triage_batch_size: number;
  };
  web_search: {
    enabled: boolean;
    max_uses_per_lane: number;
  };
  pricing: {
    usd_to_gbp: number;
    web_search_per_1000: number;
    models: Record<string, ModelPricing>;
  };
  budget: {
    run_alert_gbp: number;
  };
}

export interface RawItem {
  id: string;
  lane: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

export interface ScoredItem extends RawItem {
  score: number;
  reason: string;
}

export interface SeenEntry {
  url: string;
  titleKey: string;
  firstSeen: string;
}

export interface SeenCache {
  entries: SeenEntry[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
}

export interface DigestItem {
  itemId: string;
  headline: string;
  what: string;
  soWhat: string;
}

export interface DigestSection {
  lane: string;
  items: DigestItem[];
}

export interface SynthesisedDigest {
  oneThing: { itemId: string; whatHappened: string; whyItMatters: string };
  sections: DigestSection[];
  twoMoves: string[];
  radar: string[];
}

export interface RunStats {
  scanned: number;
  afterDedupe: number;
  survivors: number;
  published: number;
}
