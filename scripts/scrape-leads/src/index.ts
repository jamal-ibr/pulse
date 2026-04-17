import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pLimit from "p-limit";
import { CONFIG, LOCALITIES, OVERPASS_BBOX, ROOT } from "./config.js";
import { log } from "./utils/logger.js";
import { dedupe, type Cluster } from "./utils/dedupe.js";
import { writeCsv } from "./utils/csv.js";
import { domainOf, isCommonFormFrontDeskEmail, normalisePhone } from "./utils/normalise.js";
import type { Lead, RawPlace } from "./types.js";
import { collectFromPlaces } from "./sources/google-places.js";
import { collectFromOsm } from "./sources/osm.js";
import { collectFromNhs } from "./sources/nhs.js";
import { collectFromYell } from "./sources/yell.js";
import { collectFromThreeBestRated } from "./sources/three-best-rated.js";
import { crawlSite } from "./scraper/site-crawler.js";
import { lookupCompany } from "./sources/companies-house.js";
import { invisalignScore, popularityScore, proximityScore, totalScore } from "./scraper/score.js";

const DATA_DIR = resolve(ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

interface SourceCounts { [k: string]: number; }

interface Phase1Result {
  raw: RawPlace[];
  counts: SourceCounts;
  blocked: string[];
}

async function phase1Discovery(args: {
  places_variants: string[];
  places_localities: typeof LOCALITIES;
  include_yell: boolean;
  include_tbr: boolean;
  include_nhs: boolean;
  bbox: typeof OVERPASS_BBOX;
}): Promise<Phase1Result> {
  const counts: SourceCounts = {};
  const blocked: string[] = [];

  log.info("PHASE 1: discovery begin", { localities: args.places_localities.length, variants: args.places_variants.length });

  const places = CONFIG.googlePlacesKey
    ? await collectFromPlaces(args.places_variants, args.places_localities)
    : [];
  counts.google_places = places.length;
  if (!CONFIG.googlePlacesKey) blocked.push("google_places (no API key)");

  const osm = await collectFromOsm(args.bbox);
  counts.osm_overpass = osm.length;
  if (osm.length === 0) blocked.push("osm_overpass (empty or failed)");

  const nhs = args.include_nhs ? await collectFromNhs() : [];
  counts.nhs_find_dentist = nhs.length;

  const yell = args.include_yell
    ? await collectFromYell([
      { what: "Invisalign", where: "Birmingham" },
      { what: "Invisalign", where: "Solihull" },
      { what: "Invisalign", where: "Coventry" },
      { what: "Invisalign", where: "Wolverhampton" },
      { what: "Invisalign", where: "Walsall" },
      { what: "Invisalign", where: "Sutton Coldfield" },
      { what: "Orthodontist", where: "Birmingham" },
      { what: "Orthodontist", where: "West Midlands" },
      { what: "Dentist Invisalign", where: "Birmingham" },
    ])
    : [];
  counts.yell = yell.length;
  if (args.include_yell && yell.length === 0) blocked.push("yell (no results or blocked)");

  const tbr = args.include_tbr ? await collectFromThreeBestRated() : [];
  counts.three_best_rated = tbr.length;
  if (args.include_tbr && tbr.length === 0) blocked.push("three_best_rated (no results or blocked)");

  const raw = [...places, ...osm, ...nhs, ...yell, ...tbr];
  log.info("PHASE 1: discovery end", { total: raw.length, ...counts });
  return { raw, counts, blocked };
}

function phase2Dedupe(raw: RawPlace[]): Cluster[] {
  log.info("PHASE 2: dedupe begin", { raw: raw.length });
  const filtered = raw.filter((r) => {
    const n = r.name.toLowerCase();
    if (n.length < 3) return false;
    const looksLikeDental = /dent|ortho|invisalign|smile|teeth/.test(n);
    const trustedSource = r.source === "osm_overpass" || r.source === "three_best_rated" || r.source === "yell" || r.source === "nhs_find_dentist";
    return looksLikeDental || trustedSource;
  });
  const clusters = dedupe(filtered);
  log.info("PHASE 2: dedupe end", { clusters: clusters.length, dropped_non_dental: raw.length - filtered.length });
  return clusters;
}

interface EnrichedCluster {
  cluster: Cluster;
  crawl: Awaited<ReturnType<typeof crawlSite>>;
  bestEmail?: { value: string; source_url: string };
  bestPhone?: { value: string; source_url: string };
  bestOwner?: { name: string; title: string; source_url: string };
  postcode?: string;
  invisalignMentions: number;
  invisalignSourceUrl?: string;
  invisalignOnOwnSite: boolean;
}

async function phase3Crawl(clusters: Cluster[]): Promise<EnrichedCluster[]> {
  log.info("PHASE 3: website crawl begin", { candidates: clusters.length });
  const limit = pLimit(CONFIG.concurrency);
  let done = 0;
  const total = clusters.length;
  const progressInterval = setInterval(() => {
    log.info("crawl progress", { done, total, pct: total ? Math.floor((done / total) * 100) : 0 });
  }, 20_000);
  const results = await Promise.all(clusters.map((c) => limit(async (): Promise<EnrichedCluster> => {
    try {
    if (!c.website) {
      return { cluster: c, crawl: null, invisalignMentions: 0, invisalignOnOwnSite: false };
    }
    // Hard wall-clock guard: even if internal timeouts misbehave, we never hang the pipeline.
    const hardTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000));
    const crawl = await Promise.race([crawlSite(c.website), hardTimeout]);
    if (!crawl) return { cluster: c, crawl: null, invisalignMentions: 0, invisalignOnOwnSite: false };
    const dom = domainOf(c.website);
    const sameDomain = crawl.emails.filter((e) => dom && e.value.endsWith("@" + dom));
    const branded = crawl.emails.filter((e) => !/@(gmail|hotmail|yahoo|outlook|live|icloud|aol|msn)\./i.test(e.value));
    const picked = (sameDomain[0] ?? branded[0] ?? crawl.emails[0]);
    const ownerEmail = crawl.emails.find((e) => !isCommonFormFrontDeskEmail(e.value) && dom && e.value.endsWith("@" + dom));
    const bestEmail = ownerEmail ?? picked;
    const bestPhone = crawl.phones[0];
    const bestOwner = crawl.ownerCandidates[0];
    const pc = c.postcode ?? crawl.postcodes[0];
    return {
      cluster: c,
      crawl,
      bestEmail,
      bestPhone,
      bestOwner,
      postcode: pc,
      invisalignMentions: crawl.invisalignMentions,
      invisalignSourceUrl: crawl.invisalignPages[0],
      invisalignOnOwnSite: crawl.invisalignMentions > 0,
    };
    } finally { done++; }
  })));
  clearInterval(progressInterval);
  log.info("PHASE 3: website crawl end", { crawled: results.filter((r) => r.crawl).length });
  return results;
}

interface FilteredCluster extends EnrichedCluster {
  phone: string;
  phoneSource: string;
  email: string;
  emailSource: string;
}

function phase4Filter(enriched: EnrichedCluster[], relaxed: boolean): FilteredCluster[] {
  log.info("PHASE 4: filter begin", { relaxed, candidates: enriched.length });
  const out: FilteredCluster[] = [];
  for (const e of enriched) {
    const phoneObj = e.bestPhone ?? (e.cluster.phone
      ? { value: normalisePhone(e.cluster.phone) ?? "", source_url: [...e.cluster.sourceUrls][0] ?? "" }
      : undefined);
    const phone = phoneObj?.value ? normalisePhone(phoneObj.value) ?? "" : "";
    const phoneSource = phone ? phoneObj?.source_url ?? "" : "";
    const emailObj = e.bestEmail ?? (e.cluster.email
      ? { value: e.cluster.email.toLowerCase(), source_url: [...e.cluster.sourceUrls][0] ?? "" }
      : undefined);
    const email = emailObj?.value ?? "";
    const emailSource = email ? emailObj?.source_url ?? "" : "";
    if (!phone && !email) continue;
    const invisalignOk = e.invisalignOnOwnSite
      || (relaxed && (e.cluster.placesReviewInvisalign === true || /invisalign/i.test(e.cluster.placesDescription ?? "")));
    if (!invisalignOk) continue;
    out.push({ ...e, phone, phoneSource, email, emailSource });
  }
  log.info("PHASE 4: filter end", { kept: out.length });
  return out;
}

async function phase5CompaniesHouse(filtered: FilteredCluster[], topN: number): Promise<Map<string, { companyNumber: string; directorName?: string; sourceUrl: string }>> {
  const out = new Map<string, { companyNumber: string; directorName?: string; sourceUrl: string }>();
  if (!CONFIG.companiesHouseKey) { log.info("PHASE 5: skipped (no CH key)"); return out; }
  const ranked = filtered
    .map((f) => ({ f, score: scoreFor(f).total }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  log.info("PHASE 5: CH enrichment begin", { topN: ranked.length });
  const limit = pLimit(3);
  await Promise.all(ranked.map((r) => limit(async () => {
    const match = await lookupCompany(r.f.cluster.canonicalName, r.f.postcode);
    if (!match) return;
    out.set(r.f.cluster.canonicalName, {
      companyNumber: match.company_number,
      directorName: match.directors[0]?.name,
      sourceUrl: match.source_url,
    });
  })));
  log.info("PHASE 5: CH enrichment end", { enriched: out.size });
  return out;
}

function scoreFor(f: EnrichedCluster): { pop: number; prox: number; km: number; inv: number; total: number } {
  const pop = popularityScore(f.cluster.rating, f.cluster.reviewCount);
  const { score: prox, km } = proximityScore(f.cluster.lat, f.cluster.lng);
  const inv = invisalignScore(f.invisalignMentions);
  const total = totalScore(pop, prox, inv);
  return { pop, prox, km, inv, total };
}

function formatCHDirectorName(raw: string): string {
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((s) => s.trim());
    const tc = (s: string) => s.toLowerCase().replace(/(^|\s|-)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    return `${tc(first)} ${tc(last)}`.trim();
  }
  return raw;
}

function buildLeads(filtered: FilteredCluster[], chMap: Map<string, { companyNumber: string; directorName?: string; sourceUrl: string }>): Lead[] {
  const now = new Date().toISOString();
  return filtered.map((f): Lead => {
    const s = scoreFor(f);
    const ch = chMap.get(f.cluster.canonicalName);
    const ownerFromSite = f.bestOwner;
    let owner_name = "";
    let owner_title = "";
    let owner_source_url = "";
    if (ownerFromSite) {
      owner_name = ownerFromSite.name;
      owner_title = ownerFromSite.title;
      owner_source_url = ownerFromSite.source_url;
    } else if (ch?.directorName) {
      owner_name = formatCHDirectorName(ch.directorName);
      owner_title = "director";
      owner_source_url = ch.sourceUrl;
    }
    const city = (f.cluster.address ?? "").split(",").map((p) => p.trim()).find((p) => /^[A-Za-z]/.test(p) && !/^\d/.test(p) && p.length > 2 && !/^(Ltd|Limited|Dental|Practice)/i.test(p)) ?? "";
    const invisalignOwnSite = f.invisalignOnOwnSite;
    const invisalignSource = f.invisalignSourceUrl ?? (f.cluster.placesReviewInvisalign ? [...f.cluster.sourceUrls].find((u) => u.includes("places")) ?? "" : "");
    return {
      name: f.cluster.canonicalName,
      website: f.cluster.website ?? "",
      phone: f.phone,
      email: f.email,
      owner_name,
      owner_title,
      address: f.cluster.address ?? "",
      postcode: f.postcode ?? "",
      city,
      lat: f.cluster.lat ?? "",
      lng: f.cluster.lng ?? "",
      rating: f.cluster.rating ?? "",
      review_count: f.cluster.reviewCount ?? "",
      invisalign_mentions: f.invisalignMentions,
      invisalign_on_own_site: invisalignOwnSite,
      km_from_birmingham: Number(s.km.toFixed(2)),
      popularity_score: Number(s.pop.toFixed(3)),
      proximity_score: Number(s.prox.toFixed(3)),
      invisalign_score: Number(s.inv.toFixed(3)),
      total_score: Number(s.total.toFixed(3)),
      sources: [...f.cluster.sources].join("|"),
      source_urls: [...f.cluster.sourceUrls].slice(0, 6).join(" | "),
      owner_source_url,
      phone_source_url: f.phoneSource,
      email_source_url: f.emailSource,
      invisalign_source_url: invisalignSource,
      companies_house_number: ch?.companyNumber ?? "",
      fetched_at: now,
      notes: "",
    };
  })
  .sort((a, b) => b.total_score - a.total_score);
}

const LEAD_COLUMNS: Array<keyof Lead> = [
  "name", "website", "phone", "email",
  "owner_name", "owner_title",
  "address", "postcode", "city", "lat", "lng",
  "rating", "review_count",
  "invisalign_mentions", "invisalign_on_own_site",
  "km_from_birmingham",
  "popularity_score", "proximity_score", "invisalign_score", "total_score",
  "sources", "source_urls",
  "owner_source_url", "phone_source_url", "email_source_url", "invisalign_source_url",
  "companies_house_number", "fetched_at", "notes",
];

async function main(): Promise<void> {
  const target = CONFIG.targetLeads;
  const runTag = CONFIG.smoke ? "smoke" : "full";
  log.info("scrape starting", { target, runTag, concurrency: CONFIG.concurrency });

  const places_variants_default = ["Invisalign dentist", "orthodontist Invisalign"];
  const bbox = { ...OVERPASS_BBOX };
  let localitiesRun = [...LOCALITIES];
  if (CONFIG.smoke) localitiesRun = localitiesRun.slice(0, 3);

  const widenOpts = {
    places_variants: places_variants_default,
    places_localities: localitiesRun,
    include_yell: true,
    include_tbr: true,
    include_nhs: !CONFIG.smoke,
    bbox,
  };

  const discovery = await phase1Discovery(widenOpts);
  const clusters = phase2Dedupe(discovery.raw);

  let crawlCandidates = clusters;
  if (CONFIG.smoke) {
    crawlCandidates = [...clusters].sort((a, b) => {
      const sa = popularityScore(a.rating, a.reviewCount) + proximityScore(a.lat, a.lng).score;
      const sb = popularityScore(b.rating, b.reviewCount) + proximityScore(b.lat, b.lng).score;
      return sb - sa;
    }).slice(0, 60);
  }

  const enriched = await phase3Crawl(crawlCandidates);
  let filtered = phase4Filter(enriched, false);

  let wideningNotes: string[] = [];
  let extraClusters: Cluster[] = [];
  let wideningAttempt = 0;
  const maxAttempts = CONFIG.smoke ? 0 : 4;
  while (filtered.length < target && wideningAttempt < maxAttempts) {
    wideningAttempt++;
    log.warn("PHASE 7: widening", { attempt: wideningAttempt, have: filtered.length, target });
    if (wideningAttempt === 1) {
      filtered = phase4Filter(enriched, true);
      wideningNotes.push("relaxed Invisalign filter to include Places description/reviews");
      if (filtered.length >= target) break;
    }
    if (wideningAttempt === 2) {
      const extras = await phase1Discovery({
        ...widenOpts,
        places_variants: ["Invisalign clear braces", "clear aligners dentist", "cosmetic dentist Invisalign", "orthodontic clinic"],
        places_localities: LOCALITIES,
      });
      const merged = dedupe([...discovery.raw, ...extras.raw]);
      const newOnly = merged.filter((c) => !clusters.includes(c));
      wideningNotes.push(`added ${extras.raw.length} raw records from broader queries`);
      const crawledMore = await phase3Crawl(newOnly);
      enriched.push(...crawledMore);
      extraClusters.push(...newOnly);
      filtered = phase4Filter(enriched, true);
      if (filtered.length >= target) break;
    }
    if (wideningAttempt === 3) {
      const widerBbox = { south: bbox.south - 0.09, west: bbox.west - 0.15, north: bbox.north + 0.09, east: bbox.east + 0.15 };
      const extras = await phase1Discovery({
        ...widenOpts,
        bbox: widerBbox,
        places_localities: [
          ...LOCALITIES,
          { name: "Stafford", lat: 52.8066, lng: -2.1164 },
          { name: "Burton upon Trent", lat: 52.8028, lng: -1.6437 },
          { name: "Worcester", lat: 52.1919, lng: -2.2215 },
          { name: "Telford", lat: 52.6784, lng: -2.4453 },
        ],
      });
      const merged = dedupe([...discovery.raw, ...extras.raw]);
      const newOnly = merged.filter((c) => !clusters.includes(c) && !extraClusters.includes(c));
      wideningNotes.push(`expanded bbox +10km and added adjacent towns (${extras.raw.length} raw records)`);
      const crawledMore = await phase3Crawl(newOnly);
      enriched.push(...crawledMore);
      extraClusters.push(...newOnly);
      filtered = phase4Filter(enriched, true);
      if (filtered.length >= target) break;
    }
    if (wideningAttempt === 4) {
      wideningNotes.push("exhausted sources; keeping all filtered leads");
      break;
    }
  }

  const chMap = await phase5CompaniesHouse(filtered, Math.min(target + 20, filtered.length));
  const leadsAll = buildLeads(filtered, chMap);
  const leads = leadsAll.slice(0, target);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = resolve(DATA_DIR, `leads-${runTag}-${stamp}.csv`);
  const jsonPath = resolve(DATA_DIR, `leads-${runTag}-${stamp}.json`);
  writeCsv(csvPath, leads as unknown as Array<Record<string, unknown>>, LEAD_COLUMNS);
  writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    target,
    raw_counts: discovery.counts,
    raw_total: discovery.raw.length,
    clusters: clusters.length + extraClusters.length,
    filtered: filtered.length,
    final: leads.length,
    blocked: discovery.blocked,
    widening_notes: wideningNotes,
    leads,
  }, null, 2), "utf8");

  writeFileSync(resolve(DATA_DIR, `latest-${runTag}.json`), JSON.stringify({ csvPath, jsonPath }, null, 2));

  const top5 = leads.slice(0, 5);
  log.info("DONE", { csv: csvPath, final: leads.length });

  console.log("\n=========== PHASE SUMMARY ===========");
  console.log(`Run type       : ${runTag}`);
  console.log(`Target leads   : ${target}`);
  console.log(`Raw per source : ${JSON.stringify(discovery.counts)}`);
  console.log(`Raw total      : ${discovery.raw.length}`);
  console.log(`After dedupe   : ${clusters.length + extraClusters.length} clusters`);
  console.log(`After filter   : ${filtered.length}`);
  console.log(`Final count    : ${leads.length}`);
  console.log(`Blocked / skipped sources: ${discovery.blocked.join("; ") || "none"}`);
  console.log(`Widening notes : ${wideningNotes.join("; ") || "none (target met first pass)"}`);
  console.log(`CSV            : ${csvPath}`);
  console.log("\nTop 5 leads:");
  for (const l of top5) {
    console.log(`  ${l.total_score.toFixed(2).padStart(6)}  ${l.name}  (${l.postcode || "no postcode"}) ${l.website || ""}`);
  }
  console.log("=====================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
