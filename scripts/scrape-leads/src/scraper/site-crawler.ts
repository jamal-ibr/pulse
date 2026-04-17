import * as cheerio from "cheerio";
import { fetchUrl, originOf } from "../utils/http.js";
import { CONFIG, CRAWL_PATHS } from "../config.js";
import { log } from "../utils/logger.js";
import { extractEmails, extractPhones, extractPostcodes, sameSiteUrl } from "../utils/normalise.js";
import type { CrawlFindings } from "../types.js";

const MAX_PAGES = 8;

const OWNER_TITLES = [
  "principal dentist",
  "principal",
  "practice owner",
  "owner",
  "clinical director",
  "founder",
  "co-founder",
  "director",
  "managing director",
  "lead dentist",
  "lead clinician",
  "orthodontist",
];

const NAME_RE = /\bDr\.?\s+([A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+){0,3})\b/g;

function extractOwnerPairs(text: string, sourceUrl: string): Array<{ name: string; title: string; source_url: string }> {
  const out: Array<{ name: string; title: string; source_url: string }> = [];
  const plain = text.replace(/\s+/g, " ");
  for (const title of OWNER_TITLES) {
    const re = new RegExp(`(Dr\\.?\\s+[A-Z][a-zA-Z'’\\-]+(?:\\s+[A-Z][a-zA-Z'’\\-]+){0,3})[^A-Za-z]{0,40}${title.replace(/\s+/g, "\\s+")}|${title.replace(/\s+/g, "\\s+")}[^A-Za-z]{0,40}(Dr\\.?\\s+[A-Z][a-zA-Z'’\\-]+(?:\\s+[A-Z][a-zA-Z'’\\-]+){0,3})`, "gi");
    let m;
    while ((m = re.exec(plain)) !== null) {
      const name = (m[1] ?? m[2] ?? "").trim();
      if (name && name.length < 60) out.push({ name, title, source_url: sourceUrl });
      if (out.length > 20) break;
    }
  }
  // Also opportunistic: any "Dr Firstname Lastname" near title words in proximity (already handled above)
  return dedupeOwners(out);
}

function dedupeOwners(list: Array<{ name: string; title: string; source_url: string }>): Array<{ name: string; title: string; source_url: string }> {
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = o.name.toLowerCase() + "|" + o.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function expandPaths(baseHtml: string, base: string, origin: string): string[] {
  const $ = cheerio.load(baseHtml);
  const linkSet = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const u = sameSiteUrl(base, href);
    if (!u) return;
    const p = new URL(u).pathname.toLowerCase();
    if (/\/(contact|about|team|meet|invisalign|clinicians|dentists|our-dentists|treatments\/invisalign)/i.test(p)) {
      linkSet.add(u);
    }
  });
  const defaults = CRAWL_PATHS.map((p) => origin + p);
  return [...linkSet, ...defaults];
}

export async function crawlSite(website: string): Promise<CrawlFindings | null> {
  const origin = originOf(website);
  if (!origin) return null;
  const findings: CrawlFindings = {
    pagesFetched: [],
    emails: [],
    phones: [],
    postcodes: [],
    ownerCandidates: [],
    invisalignMentions: 0,
    invisalignPages: [],
    blocked: false,
  };

  const visited = new Set<string>();
  const deadline = Date.now() + CONFIG.siteCrawlTimeoutMs;

  const first = await fetchUrl(website, { acceptHtml: true });
  if (first.blockedByRobots) { findings.blocked = true; return findings; }
  if (!first.ok) { return findings; }
  findings.pagesFetched.push(first.url);
  visited.add(new URL(first.url).pathname.toLowerCase());
  processPage(findings, first.body, first.url);

  const candidates = expandPaths(first.body, first.url, origin);
  for (const c of candidates) {
    if (findings.pagesFetched.length >= MAX_PAGES) break;
    if (Date.now() > deadline) { break; }
    try {
      const path = new URL(c).pathname.toLowerCase();
      if (visited.has(path)) continue;
      visited.add(path);
    } catch { continue; }
    const r = await fetchUrl(c, { acceptHtml: true });
    if (r.blockedByRobots) { findings.blocked = true; continue; }
    if (!r.ok) continue;
    findings.pagesFetched.push(r.url);
    processPage(findings, r.body, r.url);
  }

  findings.emails = dedupeKV(findings.emails);
  findings.phones = dedupeKV(findings.phones);
  findings.postcodes = [...new Set(findings.postcodes)];
  findings.ownerCandidates = dedupeOwners(findings.ownerCandidates);
  findings.invisalignPages = [...new Set(findings.invisalignPages)];

  log.debug("crawl done", { origin, pages: findings.pagesFetched.length, emails: findings.emails.length, phones: findings.phones.length, invisalign: findings.invisalignMentions });
  return findings;
}

function dedupeKV(arr: Array<{ value: string; source_url: string }>): Array<{ value: string; source_url: string }> {
  const seen = new Set<string>();
  return arr.filter((x) => { if (seen.has(x.value)) return false; seen.add(x.value); return true; });
}

function processPage(f: CrawlFindings, html: string, url: string): void {
  const $ = cheerio.load(html);
  // Strip script/style/noscript for text extraction
  $("script,style,noscript").remove();

  // Emails from mailto:
  $("a[href^='mailto:']").each((_, a) => {
    const href = ($(a).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (href) {
      const valid = extractEmails(href);
      for (const e of valid) f.emails.push({ value: e, source_url: url });
    }
  });
  // Phones from tel:
  $("a[href^='tel:']").each((_, a) => {
    const href = ($(a).attr("href") ?? "").replace(/^tel:/i, "").trim();
    if (href) {
      const valid = extractPhones(href);
      for (const p of valid) f.phones.push({ value: p, source_url: url });
    }
  });

  const text = $("body").text().replace(/\s+/g, " ").trim();

  for (const e of extractEmails(text)) f.emails.push({ value: e, source_url: url });
  for (const p of extractPhones(text)) f.phones.push({ value: p, source_url: url });
  for (const pc of extractPostcodes(text)) f.postcodes.push(pc);

  const count = (text.match(/invisalign/gi) ?? []).length;
  if (count > 0) {
    f.invisalignMentions += count;
    f.invisalignPages.push(url);
  }

  const owners = extractOwnerPairs(text, url);
  f.ownerCandidates.push(...owners);
}
