import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";

import { CONFIG, LOCALITIES, OVERPASS_BBOX, ROOT } from "./config.js";
import { log } from "./utils/logger.js";
import {
  phase1Discovery,
  phase2Dedupe,
  phase3Crawl,
  phase4Filter,
  phase5CompaniesHouse,
  formatCHDirectorName,
  type EnrichedCluster,
  type FilteredCluster,
} from "./index.js";
import { domainOf } from "./utils/normalise.js";
import { popularityScore, proximityScore } from "./scraper/score.js";
import { searchOwners, getApolloStats, type ApolloPerson } from "./sources/apollo.js";
import { enrichOwnerContact, type OwnerEnrichmentResult } from "./scraper/owner-enrich.js";
import { detectHiring } from "./scraper/hiring.js";
import { computeFitScore, computeContactConfidence } from "./scoring/fit.js";
import { writeOutreachCsv } from "./utils/outreach-csv.js";
import type { ApolloDirectPhoneFlag, HiringSignal, InvisalignStrength, OutreachLead } from "./types.js";

const DATA_DIR = resolve(ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function classifyInvisalign(mentions: number, onOwnSite: boolean, placesSignal: boolean): InvisalignStrength {
  if (onOwnSite && mentions >= 5) return "strong";
  if (onOwnSite) return "medium";
  if (placesSignal) return "weak";
  return "weak";
}

function apolloPhoneFlag(person: ApolloPerson | null): ApolloDirectPhoneFlag {
  if (!person) return "Unknown";
  if (person.has_direct_phone === "Yes") return "Yes";
  if (typeof person.has_direct_phone === "string" && person.has_direct_phone.startsWith("Maybe")) return "Maybe";
  return "No";
}

function extractCity(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  return (
    parts.find((p) => /^[A-Za-z]/.test(p) && !/^\d/.test(p) && p.length > 2 && !/^(Ltd|Limited|Dental|Practice)/i.test(p)) ??
    ""
  );
}

interface FullyEnriched {
  f: FilteredCluster;
  owner_name: string;
  owner_title: string;
  owner_source_url: string;
  apolloFlag: ApolloDirectPhoneFlag;
  apolloPersonId?: string;
  homegrown: OwnerEnrichmentResult;
  hiring: HiringSignal;
}

async function main(): Promise<void> {
  const started = Date.now();
  const target = CONFIG.targetLeads;
  const runTag = CONFIG.smoke ? "outreach-smoke" : CONFIG.qualityMode ? "outreach-quality" : "outreach-full";
  log.info("outreach pipeline starting", { target, runTag, qualityMode: CONFIG.qualityMode });

  // ─── Phases 1–5: reuse the existing pipeline (discovery → CH) ─────────
  const placesVariants = ["Invisalign dentist", "orthodontist Invisalign"];
  const bbox = { ...OVERPASS_BBOX };
  let localitiesRun = [...LOCALITIES];
  if (CONFIG.smoke) localitiesRun = localitiesRun.slice(0, 3);

  const widenOpts = {
    places_variants: placesVariants,
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
    crawlCandidates = [...clusters]
      .sort((a, b) => {
        const sa = popularityScore(a.rating, a.reviewCount) + proximityScore(a.lat, a.lng).score;
        const sb = popularityScore(b.rating, b.reviewCount) + proximityScore(b.lat, b.lng).score;
        return sb - sa;
      })
      .slice(0, 60);
  }

  const enriched: EnrichedCluster[] = await phase3Crawl(crawlCandidates);
  let filtered = phase4Filter(enriched, false);
  if (!CONFIG.qualityMode && filtered.length < target * 2 && !CONFIG.smoke) {
    log.info("relaxing Invisalign filter to widen candidate pool");
    filtered = phase4Filter(enriched, true);
  }

  const chCap = CONFIG.qualityMode ? filtered.length : Math.min(filtered.length, target * 2);
  const chMap = await phase5CompaniesHouse(filtered, chCap);

  // ─── Phase 6: Apollo owner search (FREE) ─────────────────────────────
  log.info("PHASE 6: Apollo owner search begin", { candidates: filtered.length });
  const apolloLimit = pLimit(1);
  const apolloOwners = new Map<string, ApolloPerson | null>();
  if (CONFIG.apolloKey) {
    await Promise.all(
      filtered.map((f) =>
        apolloLimit(async () => {
          const dom = f.cluster.website ? domainOf(f.cluster.website) : "";
          if (!dom) {
            apolloOwners.set(f.cluster.canonicalName, null);
            return;
          }
          const people = await searchOwners({ domain: dom });
          apolloOwners.set(f.cluster.canonicalName, people[0] ?? null);
        }),
      ),
    );
    const withOwner = [...apolloOwners.values()].filter(Boolean).length;
    log.info("PHASE 6: Apollo owner search end", { withApolloOwner: withOwner });
  } else {
    log.warn("PHASE 6: Apollo skipped (no APOLLO_API_KEY)");
  }

  // ─── Phase 7+8: Owner enrichment + Hiring detection ──────────────────
  log.info("PHASE 7+8: owner enrichment + hiring detection begin");
  const enrichLimit = pLimit(4);
  const fullyEnriched: FullyEnriched[] = await Promise.all(
    filtered.map((f) =>
      enrichLimit(async (): Promise<FullyEnriched> => {
        const apollo = apolloOwners.get(f.cluster.canonicalName) ?? null;
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
          owner_title = "Director";
          owner_source_url = ch.sourceUrl;
        } else if (apollo) {
          const first = apollo.first_name ?? "";
          const lastObf = apollo.last_name_obfuscated ?? "";
          owner_name = [first, lastObf].filter(Boolean).join(" ");
          owner_title = apollo.title ?? "";
          owner_source_url = `apollo:person=${apollo.id}`;
        }

        const apolloFlag = apolloPhoneFlag(apollo);
        const dom = f.cluster.website ? domainOf(f.cluster.website) : "";
        const practicePhoneObj = f.phone ? { value: f.phone, source_url: f.phoneSource } : undefined;
        const homegrown = await enrichOwnerContact({
          domain: dom,
          ownerName: owner_name,
          ownerTitle: owner_title,
          crawl: f.crawl,
          practicePhone: practicePhoneObj,
        });
        const hiring = await detectHiring({ website: f.cluster.website, domain: dom });

        return {
          f,
          owner_name,
          owner_title,
          owner_source_url,
          apolloFlag,
          apolloPersonId: apollo?.id,
          homegrown,
          hiring,
        };
      }),
    ),
  );
  log.info("PHASE 7+8: end", { fullyEnriched: fullyEnriched.length });

  // ─── Phase 9: Drop policy + Phase 10: Scoring ────────────────────────
  let droppedNoContact = 0;
  let droppedQuality = 0;
  const allLeads: OutreachLead[] = [];
  for (const e of fullyEnriched) {
    const f = e.f;
    const invisalignStrength = classifyInvisalign(
      f.invisalignMentions,
      f.invisalignOnOwnSite,
      Boolean(f.cluster.placesReviewInvisalign || /invisalign/i.test(f.cluster.placesDescription ?? "")),
    );
    const hasOwnerEmail = Boolean(e.homegrown.email);
    const hasScrapedEmail =
      e.homegrown.emailMethod === "scraped_name_match" || e.homegrown.emailMethod === "scraped_same_domain";
    const hasDirectPhone = Boolean(e.homegrown.directPhone);
    const apolloConfirmsDirect = e.apolloFlag === "Yes";
    const isHiring = e.hiring.isHiringReceptionist;

    // ─── DROP POLICY ──────────────────────────────────────────────
    if (CONFIG.qualityMode) {
      // Strict: hiring is a free pass (active pain). Otherwise must be
      // Invisalign-STRONG AND have a real contact channel (not pattern guess).
      const passes =
        isHiring ||
        (invisalignStrength === "strong" && (hasScrapedEmail || apolloConfirmsDirect || hasDirectPhone));
      if (!passes) {
        droppedQuality++;
        continue;
      }
    } else {
      // Looser default: need any contact route at all.
      if (!hasOwnerEmail && !hasDirectPhone && !apolloConfirmsDirect) {
        droppedNoContact++;
        continue;
      }
    }

    const fit = computeFitScore({
      invisalignStrength,
      ownerNameKnown: Boolean(e.owner_name),
      ownerEmailConfidence: e.homegrown.emailConfidence,
      ownerDirectPhoneConfidence: e.homegrown.directPhoneConfidence,
      apolloHasDirectPhone: e.apolloFlag,
      hiringReceptionist: isHiring,
      rating: f.cluster.rating ?? 0,
      reviewCount: f.cluster.reviewCount ?? 0,
    });
    const conf = computeContactConfidence({
      ownerNameKnown: Boolean(e.owner_name),
      ownerEmailConfidence: e.homegrown.emailConfidence,
      ownerDirectPhoneConfidence: e.homegrown.directPhoneConfidence,
      apolloHasDirectPhone: e.apolloFlag,
      hasPracticePhone: Boolean(e.homegrown.practicePhone),
    });

    const notes: string[] = [];
    if (e.homegrown.emailMethod === "pattern") notes.push("email: pattern + MX verified (medium conf)");
    if (e.homegrown.emailMethod === "scraped_name_match") notes.push("email: scraped, name match");
    if (e.homegrown.emailMethod === "scraped_same_domain") notes.push("email: scraped same-domain");
    if (apolloConfirmsDirect && !hasDirectPhone) notes.push("Apollo confirms direct dial — enrich 1 credit to retrieve");
    if (isHiring) notes.push("HIRING receptionist — ideal pain match");

    allLeads.push({
      rank: 0,
      practice_name: f.cluster.canonicalName,
      owner_name: e.owner_name,
      owner_title: e.owner_title,
      owner_email: e.homegrown.email,
      owner_email_confidence: e.homegrown.emailConfidence,
      direct_phone: e.homegrown.directPhone,
      direct_phone_confidence: e.homegrown.directPhoneConfidence,
      apollo_has_direct_phone: e.apolloFlag,
      practice_phone: e.homegrown.practicePhone,
      hiring_receptionist: isHiring ? "yes" : CONFIG.apolloKey ? "no" : "unknown",
      website: f.cluster.website ?? "",
      city: extractCity(f.cluster.address ?? ""),
      postcode: f.postcode ?? "",
      invisalign_strength: invisalignStrength,
      fit_score: fit,
      contact_confidence: conf,
      rating: f.cluster.rating ?? "",
      review_count: f.cluster.reviewCount ?? "",
      notes: notes.join(" | "),
      owner_source_url: e.owner_source_url,
      email_source_url: e.homegrown.emailSourceUrl,
      direct_phone_source_url: e.homegrown.directPhoneSourceUrl,
      hiring_source_url: e.hiring.sourceUrl,
    });
  }

  // Rank: fit_score primary, contact_confidence secondary, rating tiebreak.
  // Quality mode: ship ALL passing leads. Default mode: cap at TARGET_LEADS.
  const sorted = allLeads
    .sort((a, b) => {
      if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
      if (b.contact_confidence !== a.contact_confidence) return b.contact_confidence - a.contact_confidence;
      const ar = typeof a.rating === "number" ? a.rating : 0;
      const br = typeof b.rating === "number" ? b.rating : 0;
      const arc = typeof a.review_count === "number" ? a.review_count : 0;
      const brc = typeof b.review_count === "number" ? b.review_count : 0;
      return br * Math.log10(brc + 10) - ar * Math.log10(arc + 10);
    });
  const ranked = (CONFIG.qualityMode ? sorted : sorted.slice(0, target)).map((l, i) => ({ ...l, rank: i + 1 }));

  // ─── Phase 11: Write outputs ─────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = resolve(DATA_DIR, `outreach-${runTag}-${stamp}.csv`);
  const jsonPath = resolve(DATA_DIR, `outreach-${runTag}-${stamp}.json`);
  writeOutreachCsv(csvPath, ranked);

  const apolloStats = getApolloStats();
  const hiringCount = fullyEnriched.filter((e) => e.hiring.isHiringReceptionist).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    qualityMode: CONFIG.qualityMode,
    target: CONFIG.qualityMode ? null : target,
    runMins: Math.round((Date.now() - started) / 60_000),
    funnel: {
      rawTotal: discovery.raw.length,
      rawCounts: discovery.counts,
      clusters: clusters.length,
      filtered: filtered.length,
      apolloOwnerFound: [...apolloOwners.values()].filter(Boolean).length,
      hiring: hiringCount,
      droppedNoContact,
      droppedQuality,
      delivered: ranked.length,
    },
    apollo: apolloStats,
    leads: ranked,
  };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  writeFileSync(
    resolve(DATA_DIR, "latest-outreach.json"),
    JSON.stringify({ csvPath, jsonPath, stamp }, null, 2),
  );

  log.ok(`outreach DONE: ${ranked.length} leads → ${csvPath} (${summary.runMins}m)`);

  // ─── Phase 12: Optional Drive upload ─────────────────────────────────
  let driveResult: { csvUrl?: string; sheetUrl?: string } | null = null;
  if (CONFIG.gdriveUpload) {
    try {
      const mod = await import("./drive/upload.js");
      driveResult = await mod.uploadOutreachToDrive({ csvPath, jsonPath, stamp });
      if (driveResult) log.ok(`drive: uploaded → ${driveResult.sheetUrl}`);
    } catch (e) {
      log.error(`drive upload failed: ${(e as Error).message}`);
    }
  }

  // ─── Console summary ─────────────────────────────────────────────────
  console.log("\n=========== OUTREACH SUMMARY ===========");
  console.log(`Run type       : ${runTag}${CONFIG.qualityMode ? " (quality bar = strict)" : ""}`);
  console.log(`Delivered      : ${ranked.length}${CONFIG.qualityMode ? " (no target cap)" : " / " + target}`);
  console.log(`Run mins       : ${summary.runMins}`);
  console.log(
    `Funnel         : raw=${summary.funnel.rawTotal} clusters=${summary.funnel.clusters} filtered=${summary.funnel.filtered} delivered=${summary.funnel.delivered}`,
  );
  console.log(`Apollo owner   : ${summary.funnel.apolloOwnerFound} found (${apolloStats.totalRequests} free reqs)`);
  console.log(`Hiring matches : ${summary.funnel.hiring}`);
  console.log(
    `Dropped        : ${summary.funnel.droppedQuality} quality-fail, ${summary.funnel.droppedNoContact} no-contact`,
  );
  console.log(`CSV            : ${csvPath}`);
  if (driveResult?.sheetUrl) console.log(`Google Sheet   : ${driveResult.sheetUrl}`);
  console.log("\nTop 10 by fit_score:");
  for (const l of ranked.slice(0, 10)) {
    const dir = l.direct_phone || (l.apollo_has_direct_phone === "Yes" ? "(Apollo: direct dial available)" : "(reception only)");
    const email = l.owner_email || "(no owner email)";
    const hire = l.hiring_receptionist === "yes" ? "  [HIRING]" : "";
    console.log(`  #${String(l.rank).padStart(3)} fit=${l.fit_score} conf=${l.contact_confidence}  ${l.practice_name}${hire}`);
    console.log(`        ${l.owner_name || "(no owner)"}${l.owner_title ? " — " + l.owner_title : ""}`);
    console.log(`        ${email}  ${dir}`);
  }
  console.log("========================================\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
