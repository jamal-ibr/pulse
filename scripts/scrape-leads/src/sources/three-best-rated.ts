import * as cheerio from "cheerio";
import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";
import type { RawPlace } from "../types.js";
import { extractPostcodes, normalisePhone } from "../utils/normalise.js";

const BASE = "https://threebestrated.co.uk";

function parseTBR(html: string, sourceUrl: string): RawPlace[] {
  const $ = cheerio.load(html);
  const out: RawPlace[] = [];

  $("div.listing-item").each((_, el) => {
    const $el = $(el);
    // Name: first image's alt text is reliable, or the "Directions to X" title
    const nameFromDir = $el.find("a.get-direction1[title^='Directions to ']").first().attr("title")?.replace(/^Directions to\s+/, "").trim();
    const nameFromImg = $el.find("img[alt]").first().attr("alt")?.trim();
    const name = (nameFromDir && nameFromDir.length > 3 ? nameFromDir : nameFromImg) ?? "";
    if (!name || name.length < 3 || /video$/i.test(name)) return;

    // Phone: first tel: link
    const phoneHref = $el.find("a[href^='tel:']").first().attr("href")?.replace(/^tel:/, "") ?? "";
    const phone = phoneHref ? normalisePhone(phoneHref) ?? undefined : undefined;

    // Website: any https link that isn't Google/YT/TBR/social/dentalhub
    const websiteHref = $el.find("a[href]").map((_, a) => $(a).attr("href")).get().find((h) => {
      if (!h || !/^https?:\/\//i.test(h)) return false;
      if (/threebestrated\.co\.uk|google\.com|google\.co\.uk|youtube\.com|facebook\.com|instagram\.com|twitter\.com|tiktok\.com|pinterest\.com|linkedin\.com|maps\.google|dentalhub\.online/i.test(h)) return false;
      return true;
    });

    // Address from the directions URL destination param (full address usually in there)
    const dirHref = $el.find("a.get-direction1").first().attr("href") ?? "";
    let address: string | undefined;
    const destMatch = dirHref.match(/destination=([^&]+)/);
    if (destMatch) address = decodeURIComponent(destMatch[1].replace(/\+/g, " "));
    const postcodes = address ? extractPostcodes(address) : [];

    out.push({
      source: "three_best_rated",
      source_url: sourceUrl,
      name,
      website: websiteHref || undefined,
      phone,
      address,
      postcode: postcodes[0],
      fetchedAt: new Date().toISOString(),
    });
  });
  return out;
}

const TBR_PAGES = [
  "/dentists-in-birmingham",
  "/orthodontists-in-birmingham",
  "/dentists-in-solihull",
  "/dentists-in-wolverhampton",
  "/dentists-in-coventry",
  "/dentists-in-walsall",
  "/dentists-in-dudley",
  "/dentists-in-sutton-coldfield",
  "/dentists-in-west-bromwich",
  "/dentists-in-stourbridge",
  "/dentists-in-leamington-spa",
  "/dentists-in-warwick",
  "/dentists-in-redditch",
];

export async function collectFromThreeBestRated(paths = TBR_PAGES): Promise<RawPlace[]> {
  const all: RawPlace[] = [];
  let blocked = 0;
  for (const p of paths) {
    const url = `${BASE}${p}`;
    const r = await fetchUrl(url, { acceptHtml: true });
    if (r.blockedByRobots) { blocked++; continue; }
    if (!r.ok) continue;
    all.push(...parseTBR(r.body, url));
  }
  log.info("three_best_rated", { found: all.length, blocked });
  return all;
}
