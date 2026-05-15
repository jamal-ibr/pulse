import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../config.js";

// Cache lives under the existing data dir so we share a single state
// location with the rest of the scraper. Gitignored.
const CACHE_DIR = resolve(ROOT, "data", ".apollo-cache");
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function ensureDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(domain: string, fullName: string): string {
  const norm = `${(domain || "").toLowerCase().trim()}|${(fullName || "").toLowerCase().trim().replace(/\s+/g, " ")}`;
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

function pathFor(key: string): string {
  return resolve(CACHE_DIR, `${key}.json`);
}

export function readApolloCache<T>(domain: string, fullName: string): T | null {
  const p = pathFor(cacheKey(domain, fullName));
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as { fetchedAt: number; value: T };
    if (!raw.fetchedAt || Date.now() - raw.fetchedAt > TTL_MS) return null;
    return raw.value;
  } catch {
    return null;
  }
}

export function writeApolloCache<T>(domain: string, fullName: string, value: T): void {
  ensureDir();
  const p = pathFor(cacheKey(domain, fullName));
  writeFileSync(p, JSON.stringify({ fetchedAt: Date.now(), domain, fullName, value }, null, 2), "utf8");
}

export function getCacheStats(): { entries: number; freshEntries: number; staleEntries: number } {
  if (!existsSync(CACHE_DIR)) return { entries: 0, freshEntries: 0, staleEntries: 0 };
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  let fresh = 0;
  let stale = 0;
  for (const f of files) {
    try {
      const p = resolve(CACHE_DIR, f);
      const raw = JSON.parse(readFileSync(p, "utf8")) as { fetchedAt: number };
      if (Date.now() - raw.fetchedAt <= TTL_MS) fresh++;
      else stale++;
    } catch {
      stale++;
    }
  }
  return { entries: files.length, freshEntries: fresh, staleEntries: stale };
}
