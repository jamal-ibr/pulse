import pLimit from "p-limit";
import { CONFIG } from "../config.js";
import { log } from "./logger.js";

const globalLimit = pLimit(CONFIG.concurrency);
const domainLastHit = new Map<string, number>();
const domainLimits = new Map<string, ReturnType<typeof pLimit>>();
const robotsCache = new Map<string, RobotsRules>();

function domainOf(u: string): string {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ""; }
}
function domainLimit(domain: string): ReturnType<typeof pLimit> {
  let lim = domainLimits.get(domain);
  if (!lim) { lim = pLimit(2); domainLimits.set(domain, lim); }
  return lim;
}

async function spaceOutDomain(domain: string): Promise<void> {
  const last = domainLastHit.get(domain) ?? 0;
  const wait = last + CONFIG.minDelayMsPerDomain - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  domainLastHit.set(domain, Date.now());
}

export interface FetchOptions {
  acceptHtml?: boolean;
  acceptJson?: boolean;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  bypassRobots?: boolean;
  timeoutMs?: number;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  contentType: string;
  blockedByRobots?: boolean;
  tooLarge?: boolean;
  error?: string;
}

interface RobotsRules {
  disallow: string[];
  crawlDelayMs: number;
}

function parseRobots(txt: string, ua: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], crawlDelayMs: 0 };
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  let applies = false;
  let starApplies = false;
  const starRules: RobotsRules = { disallow: [], crawlDelayMs: 0 };
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      applies = val === "*" || ua.toLowerCase().includes(val.toLowerCase()) || val.toLowerCase() === "pulseleadbot";
      starApplies = val === "*";
    } else if (key === "disallow") {
      if (applies && !starApplies && val) rules.disallow.push(val);
      if (starApplies && val) starRules.disallow.push(val);
    } else if (key === "allow") {
      // we conservatively ignore Allow (only respecting Disallow keeps us safer)
    } else if (key === "crawl-delay") {
      const n = Number(val);
      if (!isNaN(n)) {
        if (applies && !starApplies) rules.crawlDelayMs = n * 1000;
        if (starApplies) starRules.crawlDelayMs = n * 1000;
      }
    }
  }
  if (rules.disallow.length === 0) rules.disallow = starRules.disallow;
  if (rules.crawlDelayMs === 0) rules.crawlDelayMs = starRules.crawlDelayMs;
  return rules;
}

async function getRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const url = `${origin}/robots.txt`;
  try {
    const r = await rawFetch(url, { headers: {} }, 10_000);
    if (r.ok) {
      const rules = parseRobots(r.body, CONFIG.userAgent);
      robotsCache.set(origin, rules);
      return rules;
    }
  } catch {}
  const empty = { disallow: [], crawlDelayMs: 0 };
  robotsCache.set(origin, empty);
  return empty;
}

function isDisallowed(pathname: string, rules: RobotsRules): boolean {
  for (const rule of rules.disallow) {
    if (!rule) continue;
    if (rule === "/") return true;
    // simple prefix match with * wildcards
    const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
    if (re.test(pathname)) return true;
  }
  return false;
}

async function rawFetch(url: string, opts: FetchOptions, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const abortTimer = setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs);

  const doFetch = async (): Promise<FetchResult> => {
    try {
      const headers: Record<string, string> = {
        "User-Agent": CONFIG.userAgent,
        "Accept-Language": "en-GB,en;q=0.9",
        ...(opts.acceptHtml ? { "Accept": "text/html,application/xhtml+xml" } : {}),
        ...(opts.acceptJson ? { "Accept": "application/json" } : {}),
        ...(opts.headers ?? {}),
      };
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body,
        redirect: "follow",
        signal: controller.signal,
      });
      const cl = res.headers.get("content-length");
      if (cl && Number(cl) > CONFIG.maxBytes) {
        try { res.body?.cancel(); } catch {}
        return { ok: false, status: res.status, url: res.url || url, body: "", contentType: res.headers.get("content-type") ?? "", tooLarge: true };
      }
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            try { await reader.cancel(); } catch {}
            try { controller.abort(); } catch {}
            return { ok: false, status: res.status, url: res.url || url, body: "", contentType: res.headers.get("content-type") ?? "", error: "stream timeout" };
          }
          // Per-chunk read with its own timeout guard
          const readPromise = reader.read();
          const timeoutPromise = new Promise<{ value?: Uint8Array; done: boolean; _timeout: true }>((resolve) => {
            setTimeout(() => resolve({ done: true, _timeout: true } as any), Math.min(remaining, 5000));
          });
          const result = await Promise.race([readPromise, timeoutPromise]) as any;
          if (result._timeout) {
            try { await reader.cancel(); } catch {}
            try { controller.abort(); } catch {}
            return { ok: false, status: res.status, url: res.url || url, body: "", contentType: res.headers.get("content-type") ?? "", error: "read stall" };
          }
          if (result.done) break;
          if (result.value) {
            received += result.value.byteLength;
            if (received > CONFIG.maxBytes) {
              try { await reader.cancel(); } catch {}
              return { ok: false, status: res.status, url: res.url || url, body: "", contentType: res.headers.get("content-type") ?? "", tooLarge: true };
            }
            chunks.push(result.value);
          }
        }
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const buf = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      return { ok: res.ok, status: res.status, url: res.url || url, body: text, contentType: res.headers.get("content-type") ?? "" };
    } catch (e) {
      return { ok: false, status: 0, url, body: "", contentType: "", error: String((e as Error)?.message ?? e) };
    }
  };

  // Hard outer timeout as a safety net
  const hardTimeout = new Promise<FetchResult>((resolve) => {
    setTimeout(() => {
      try { controller.abort(); } catch {}
      resolve({ ok: false, status: 0, url, body: "", contentType: "", error: "hard timeout" });
    }, timeoutMs + 2000);
  });

  try {
    return await Promise.race([doFetch(), hardTimeout]);
  } finally {
    clearTimeout(abortTimer);
  }
}

export async function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return { ok: false, status: 0, url, body: "", contentType: "", error: "invalid url" };
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  const domain = parsed.hostname.toLowerCase();
  const timeoutMs = opts.timeoutMs ?? CONFIG.httpTimeoutMs;

  return globalLimit(() => domainLimit(domain)(async () => {
    if (!opts.bypassRobots) {
      const rules = await getRobots(origin);
      if (isDisallowed(parsed.pathname, rules)) {
        log.warn("robots disallow", { url });
        return { ok: false, status: 0, url, body: "", contentType: "", blockedByRobots: true };
      }
      if (rules.crawlDelayMs > CONFIG.minDelayMsPerDomain) {
        const last = domainLastHit.get(domain) ?? 0;
        const wait = last + rules.crawlDelayMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
    await spaceOutDomain(domain);
    const result = await rawFetch(url, opts, timeoutMs);
    if (!result.ok && result.status !== 0) log.debug("non-ok", { url, status: result.status });
    if (result.error) log.debug("fetch error", { url, err: result.error });
    return result;
  }));
}

export function originOf(u: string): string | null {
  try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return null; }
}
