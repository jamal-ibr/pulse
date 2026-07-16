import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Config, Profile, Sources } from "./types.js";

export const DIGEST_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = join(DIGEST_ROOT, "..");

function required(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid config: ${message}`);
}

export function parseConfig(text: string): Config {
  const cfg = parse(text) as Config;
  required(cfg?.sender, "sender is required");
  required(cfg.timezone, "timezone is required");
  required(cfg.digest?.max_items >= 1, "digest.max_items must be at least 1");
  required(
    cfg.digest.min_triage_score >= 0 && cfg.digest.min_triage_score <= 5,
    "digest.min_triage_score must be 0-5",
  );
  required(cfg.models?.triage && cfg.models?.synthesis, "models.triage and models.synthesis are required");
  required(cfg.models.triage_batch_size >= 1, "models.triage_batch_size must be at least 1");
  required(cfg.pricing?.usd_to_gbp > 0, "pricing.usd_to_gbp must be positive");
  for (const model of [cfg.models.triage, cfg.models.synthesis]) {
    required(cfg.pricing.models[model], `pricing.models must include an entry for ${model}`);
  }
  return cfg;
}

export function parseProfile(text: string): Profile {
  const profile = parse(text) as Profile;
  required(profile?.recipient?.includes("@"), "profile recipient must be an email address");
  required(
    typeof profile.context === "string" && profile.context.trim().length > 50,
    "profile context must describe the reader and the uses that earn an item its place",
  );
  required(Array.isArray(profile.plate) && profile.plate.length > 0, "profile plate must be a non-empty list");
  return profile;
}

/**
 * The profile carries everything personal. In Actions it comes from the
 * DIGEST_PROFILE secret; locally from the gitignored digest/profile.local.yaml.
 */
export function loadProfile(): Profile {
  const fromEnv = process.env.DIGEST_PROFILE;
  if (fromEnv?.trim()) return parseProfile(fromEnv);
  const localPath = join(DIGEST_ROOT, "profile.local.yaml");
  if (existsSync(localPath)) return parseProfile(readFileSync(localPath, "utf8"));
  throw new Error(
    "No profile found: set the DIGEST_PROFILE secret (Actions) or create digest/profile.local.yaml " +
      "(local, gitignored). See digest/profile.example.yaml for the shape.",
  );
}

export function parseSources(text: string): Sources {
  const sources = parse(text) as Sources;
  required(Array.isArray(sources?.lanes) && sources.lanes.length > 0, "sources.yaml needs at least one lane");
  const seenIds = new Set<string>();
  for (const lane of sources.lanes) {
    required(lane.id && lane.title, "every lane needs id and title");
    required(!seenIds.has(lane.id), `duplicate lane id ${lane.id}`);
    seenIds.add(lane.id);
    required(Array.isArray(lane.feeds), `lane ${lane.id} needs a feeds list (may be empty)`);
    required(Array.isArray(lane.search_topics), `lane ${lane.id} needs a search_topics list (may be empty)`);
    for (const feed of lane.feeds) {
      required(
        feed.id && feed.name && feed.url?.startsWith("https://"),
        `feed in lane ${lane.id} needs id, name and an https url`,
      );
    }
  }
  return sources;
}

export function loadConfig(): Config {
  return parseConfig(readFileSync(join(DIGEST_ROOT, "config.yaml"), "utf8"));
}

/**
 * Lane and topic choices can themselves be personal signals, so the committed
 * sources.yaml is a neutral working default. A private lane list goes in the
 * DIGEST_SOURCES secret (or the gitignored digest/sources.local.yaml locally)
 * and overrides the file completely when present.
 */
export function loadSources(): Sources {
  const fromEnv = process.env.DIGEST_SOURCES;
  if (fromEnv?.trim()) return parseSources(fromEnv);
  const localPath = join(DIGEST_ROOT, "sources.local.yaml");
  if (existsSync(localPath)) return parseSources(readFileSync(localPath, "utf8"));
  return parseSources(readFileSync(join(DIGEST_ROOT, "sources.yaml"), "utf8"));
}
