import * as cheerio from "cheerio";
import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";
import type { RawPlace } from "../types.js";
import { extractPostcodes, normalisePhone } from "../utils/normalise.js";

const BASE = "https://www.nhs.uk";
const SEARCH_POSTCODES = [
  "B1 1AA", "B2 4QA", "B3 2NH", "B4 6AH", "B5 7UG", "B6 4JB", "B7 5AF",
  "B15 2TT", "B16 8AB", "B17 8LG", "B18 7AL", "B19 2QE", "B20 2NT",
  "B23 6QE", "B26 3QJ", "B27 6BH", "B29 6BB", "B30 1PY", "B31 2AP",
  "B32 2TQ", "B36 0EY", "B37 7YE", "B44 8AE", "B46 2RH", "B48 7DA",
  "B50 4BS", "B62 9JD", "B63 4AJ", "B66 1JJ", "B67 6AS", "B68 0AE",
  "B69 1EA", "B70 6DS", "B72 1AB", "B73 5PY", "B74 4TR", "B75 5JP",
  "B76 9SW", "B91 3AT", "B92 7PZ", "B93 0DB", "B95 5AB", "B96 6DJ",
  "CV1 2GN", "CV11 4NB", "CV21 2AJ", "CV31 3AA", "CV32 4RA", "CV34 4DU",
  "CV8 1QW", "DY1 1RZ", "DY5 3LE", "DY8 1NF", "DY9 8PR", "DY10 2BX",
  "WS1 1TP", "WS2 9PA", "WS3 3HN", "WS4 2AS", "WS10 8JJ", "WS11 1AA",
  "WV1 1RT", "WV2 4NQ", "WV3 0BJ", "WV4 4JX", "WV10 0QP", "WV11 2AH",
];

function parseResults(html: string, sourceUrl: string): RawPlace[] {
  const $ = cheerio.load(html);
  const out: RawPlace[] = [];
  // NHS results are usually in elements with class "results-list__item" or similar
  $("li.nhsuk-list, li.results-list__item, li[data-search-result], div.results-list__item, ol > li, ul.results > li, div.search-results li").each((_, el) => {
    const $el = $(el);
    const name = $el.find("h2, h3, .results-list__item__title, .nhsuk-heading-s, a[href*='dentist']").first().text().trim();
    if (!name || name.length < 3) return;
    const addrText = $el.find(".results-list__item__address, address, .nhsuk-u-margin-bottom-1, p").text().replace(/\s+/g, " ").trim();
    const postcodes = extractPostcodes(addrText);
    const postcode = postcodes[0];
    const phoneRaw = $el.find("a[href^='tel:']").attr("href")?.replace(/^tel:/, "")
      ?? ($el.text().match(/\b0\d[\d\s().\-]{7,20}\b/)?.[0] ?? "");
    const phone = phoneRaw ? normalisePhone(phoneRaw) ?? undefined : undefined;
    const webHref = $el.find("a[href]").filter((_, a) => {
      const h = $(a).attr("href") ?? "";
      return /^https?:\/\//i.test(h) && !/nhs\.uk/i.test(h);
    }).first().attr("href");
    out.push({
      source: "nhs_find_dentist",
      source_url: sourceUrl,
      name,
      website: webHref || undefined,
      phone,
      address: addrText || undefined,
      postcode,
      fetchedAt: new Date().toISOString(),
    });
  });
  return out;
}

export async function collectFromNhs(postcodes = SEARCH_POSTCODES): Promise<RawPlace[]> {
  // NHS "Find a dentist" results require a CSRF-protected POST submitted from
  // their search form, which is a stateful cookie flow. The static URL
  // /service-search/find-a-dentist/results/<pc> returns a "cannot find X" page
  // when accessed directly. Rather than attempt to emulate the session flow
  // (borderline "evasion" territory under the absolute-rules), we probe once
  // with a representative postcode and, if the expected results markup is
  // absent, skip the source entirely and let the caller log it as blocked.
  const probeUrl = `${BASE}/service-search/find-a-dentist/results/${encodeURIComponent(postcodes[0] ?? "B1 1AA")}`;
  const probe = await fetchUrl(probeUrl, { acceptHtml: true });
  if (probe.blockedByRobots) { log.info("nhs_find_dentist", { found: 0, note: "blocked by robots" }); return []; }
  if (!probe.ok) { log.info("nhs_find_dentist", { found: 0, note: `probe http ${probe.status}` }); return []; }
  const looksUsable = /results-list|search-results|find-a-dentist.*result/i.test(probe.body)
    && !/We cannot find/i.test(probe.body);
  if (!looksUsable) {
    log.info("nhs_find_dentist", { found: 0, note: "gated behind CSRF POST form; skipped per rules" });
    return [];
  }
  const all: RawPlace[] = [];
  let blockedCount = 0;
  for (const pc of postcodes) {
    const url = `${BASE}/service-search/find-a-dentist/results/${encodeURIComponent(pc)}`;
    const r = await fetchUrl(url, { acceptHtml: true });
    if (r.blockedByRobots) { blockedCount++; continue; }
    if (!r.ok) { log.debug("nhs non-ok", { url, status: r.status }); continue; }
    if (/captcha|access denied|We cannot find/i.test(r.body)) { blockedCount++; continue; }
    const parsed = parseResults(r.body, url);
    all.push(...parsed);
  }
  log.info("nhs_find_dentist", { found: all.length, blocked: blockedCount });
  return all;
}
