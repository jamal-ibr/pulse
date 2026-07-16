import type { ScoredItem } from "./types.js";

const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function resolves(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (res.status < 400) return true;
      // Bot-blocking statuses still resolve for a human reader; anything else
      // (404, 410, 5xx) is treated as dead so it never reaches the digest.
      const botBlocked = [401, 403, 405, 429];
      if (method === "GET") return botBlocked.includes(res.status);
    } catch {
      if (method === "GET") return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/** Drop items whose URLs do not resolve, so no dead link ever reaches the digest. */
export async function dropDeadLinks(items: ScoredItem[]): Promise<{ alive: ScoredItem[]; dropped: ScoredItem[] }> {
  const checks = await Promise.all(items.map((item) => resolves(item.url)));
  const alive: ScoredItem[] = [];
  const dropped: ScoredItem[] = [];
  items.forEach((item, i) => (checks[i] ? alive : dropped).push(item));
  return { alive, dropped };
}
