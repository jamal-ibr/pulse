import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIGEST_ROOT, REPO_ROOT } from "./config.js";
import type { ScoredItem, SynthesisedDigest } from "./types.js";

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(sender: string, to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: sender, to: [to], subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend rejected the email: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Best-effort failure notification; never throws so it cannot mask the original error. */
export async function sendErrorEmail(sender: string, to: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
  const runUrl = process.env.GITHUB_RUN_URL ?? "(run locally)";
  try {
    await sendEmail(
      sender,
      to,
      "Digest run FAILED",
      `The daily digest run failed and no digest was produced.\n\n${detail}\n\nRun: ${runUrl}\n`,
    );
  } catch (mailError) {
    console.error(`Also failed to send the error email: ${String(mailError)}`);
  }
}

export function archivePath(isoDate: string, backfill: boolean): string {
  const dir = backfill ? join(REPO_ROOT, "archive", "backfill") : join(REPO_ROOT, "archive");
  return join(dir, `${isoDate}.md`);
}

export function writeArchive(path: string, digestText: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, digestText);
}

/**
 * Log which lanes and sources were published so weekly ratings can be
 * correlated. Deliberately minimal (no headlines, no URLs): this file is
 * committed to a public repo, so it must reveal nothing about digest content.
 */
export function logDigestItems(isoDate: string, digest: SynthesisedDigest, items: ScoredItem[]): void {
  const byId = new Map(items.map((i) => [i.id, i]));
  const published = digest.sections.flatMap((s) =>
    s.items.map((it) => ({ id: it.itemId, lane: s.lane, source: byId.get(it.itemId)?.sourceId ?? "unknown" })),
  );
  const line = JSON.stringify({ type: "digest", date: isoDate, items: published });
  const path = join(DIGEST_ROOT, "data", "feedback.jsonl");
  mkdirSync(join(DIGEST_ROOT, "data"), { recursive: true });
  appendFileSync(path, line + "\n");
}
