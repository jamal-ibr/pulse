import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ROOT } from "../config.js";
import { log } from "../utils/logger.js";

const DEFAULT_PATH = resolve(ROOT, "data", ".suppression", "leads.txt");

export function loadSuppressionList(path: string = DEFAULT_PATH): Set<string> {
  if (!existsSync(path)) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      // Touch the file so the user knows where to add entries.
      appendFileSync(
        path,
        "# One entry per line. Lower-cased email OR website-domain OR exact practice name.\n" +
          "# Lines starting with # are ignored. The drafting agent skips any lead matching\n" +
          "# any of these on email, website domain (eTLD+1), or practice_name (case-insensitive).\n",
      );
      log.info(`suppression: created empty list at ${path}`);
    } catch (e) {
      log.warn(`suppression: could not create list at ${path}: ${(e as Error).message}`);
    }
    return new Set();
  }
  const raw = readFileSync(path, "utf8");
  const out = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    out.add(trimmed.toLowerCase());
  }
  return out;
}

export function appendToSuppression(entry: string, path: string = DEFAULT_PATH): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, entry.trim().toLowerCase() + "\n");
  } catch (e) {
    log.warn(`suppression: append failed: ${(e as Error).message}`);
  }
}

function extractDomain(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isSuppressed(
  suppression: Set<string>,
  lead: { owner_email?: string; website?: string; practice_name: string },
): boolean {
  if (suppression.size === 0) return false;
  const email = (lead.owner_email ?? "").toLowerCase();
  const domain = extractDomain(lead.website ?? "");
  const name = lead.practice_name.trim().toLowerCase();
  return suppression.has(email) || (domain ? suppression.has(domain) : false) || suppression.has(name);
}

export function suppressionDefaultPath(): string {
  return DEFAULT_PATH;
}
