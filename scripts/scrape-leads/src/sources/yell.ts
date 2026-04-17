import * as cheerio from "cheerio";
import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";
import type { RawPlace } from "../types.js";
import { normalisePhone } from "../utils/normalise.js";

const BASE = "https://www.yell.com";

function parseYell(html: string, sourceUrl: string): RawPlace[] {
  const $ = cheerio.load(html);
  const out: RawPlace[] = [];
  $("div.businessCapsule, article.businessCapsule, div[itemtype*='LocalBusiness'], div.c-resultCapsule, div[data-test-id='business-card'], div.row.businessCapsule--mainRow").each((_, el) => {
    const $el = $(el);
    const name = $el.find("h2 a, h2, a.businessCapsule--title, .businessCapsule--title").first().text().trim();
    if (!name) return;
    const addr = $el.find("span.address, .businessCapsule--address, address, span[itemprop='address']").first().text().replace(/\s+/g, " ").trim();
    const phoneRaw = $el.find("span.business--telephoneNumber, span.businessCapsule--phone, a[href^='tel:'], span[itemprop='telephone']").first().text().trim()
      || $el.find("a[href^='tel:']").attr("href")?.replace(/^tel:/, "") || "";
    const phone = phoneRaw ? normalisePhone(phoneRaw) ?? undefined : undefined;
    const websiteHref = $el.find("a.businessCapsule--ctaWebsite, a.businessCapsule--url, a[data-tracking*='Website'], a[href*='http']").filter((_, a) => {
      const h = $(a).attr("href") ?? "";
      return /^https?:\/\//i.test(h) && !/yell\.com/i.test(h);
    }).first().attr("href");
    out.push({
      source: "yell",
      source_url: sourceUrl,
      name,
      website: websiteHref || undefined,
      phone,
      address: addr || undefined,
      fetchedAt: new Date().toISOString(),
    });
  });
  return out;
}

export async function collectFromYell(queries: Array<{ what: string; where: string }>): Promise<RawPlace[]> {
  const all: RawPlace[] = [];
  let blockedCount = 0;
  for (const q of queries) {
    for (let page = 1; page <= 5; page++) {
      const url = `${BASE}/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(q.what)}&location=${encodeURIComponent(q.where)}&pageNum=${page}`;
      const r = await fetchUrl(url, { acceptHtml: true });
      if (r.blockedByRobots) { blockedCount++; break; }
      if (!r.ok) {
        if (r.status === 403 || r.status === 429) blockedCount++;
        break;
      }
      if (/captcha|robot check|cf-browser-verification|are you a human/i.test(r.body)) {
        blockedCount++; break;
      }
      const parsed = parseYell(r.body, url);
      if (parsed.length === 0) break;
      all.push(...parsed);
    }
  }
  log.info("yell", { found: all.length, blocked: blockedCount });
  return all;
}
