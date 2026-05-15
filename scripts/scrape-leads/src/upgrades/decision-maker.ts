import {
  matchAndEnrichByName,
  searchPersonByNameAndCity,
  enrichPerson,
  extractBestPhone,
  type BestPhoneResult,
  type EnrichedPersonResult,
} from "../sources/apollo.js";
import { readApolloCache, writeApolloCache } from "../utils/apollo-cache.js";
import { validateOwnerEmail, scrapeFallbackEmail } from "../scraper/email-cleanup.js";
import { log } from "../utils/logger.js";

export interface DecisionMakerUpgradeOpts {
  maxEnrich: number;
  phoneOnly: boolean;
}

export interface UpgradeReport {
  considered: number;
  enrichedAttempted: number;
  cacheHits: number;
  phonesFound: number;
  phonesNotFound: number;
  emailsRejected: number;
  emailsFixedByScrape: number;
  emailsNeedingReview: number;
  contradictions: Array<{ practice: string; field: "owner_name" | "owner_email"; existing: string; apollo: string }>;
}

export type LeadRow = Record<string, string>;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function nameSplit(full: string): { first: string; last: string } {
  const cleaned = full
    .replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Mx\.?|Prof\.?)\s+/i, "")
    .replace(/[^A-Za-z\s-]/g, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function normName(s: string): string {
  return s.toLowerCase().replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss|mx\.?|prof\.?)\s+/, "").replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, " ");
}

const NEW_COLUMNS = [
  "decision_maker_direct_phone",
  "decision_maker_phone_confidence",
  "apollo_person_id",
  "phone_fallback_strategy",
  "email_extraction_error",
  "email_local_part_classification",
] as const;

export function ensureNewColumns(rows: LeadRow[]): void {
  for (const r of rows) {
    for (const c of NEW_COLUMNS) if (!(c in r)) r[c] = "";
  }
}

export function newColumnNames(): string[] {
  return [...NEW_COLUMNS];
}

/**
 * Pick top-N leads by existing fit_score and enrich them with Apollo
 * decision-maker direct phone + (optionally) clean owner email. Mutates
 * the input rows in place to add the new columns. Idempotent via
 * domain+name cache (30-day TTL).
 */
export async function enrichDecisionMakerContacts(
  rows: LeadRow[],
  opts: DecisionMakerUpgradeOpts,
): Promise<UpgradeReport> {
  ensureNewColumns(rows);

  const report: UpgradeReport = {
    considered: rows.length,
    enrichedAttempted: 0,
    cacheHits: 0,
    phonesFound: 0,
    phonesNotFound: 0,
    emailsRejected: 0,
    emailsFixedByScrape: 0,
    emailsNeedingReview: 0,
    contradictions: [],
  };

  // Pick top-N by fit_score (existing column).
  const ranked = [...rows].sort((a, b) => Number(b.fit_score ?? 0) - Number(a.fit_score ?? 0));
  const topNames = new Set(ranked.slice(0, opts.maxEnrich).map((r) => r.practice_name));

  for (const row of rows) {
    if (!topNames.has(row.practice_name)) continue;
    report.enrichedAttempted++;

    const ownerName = row.owner_name ?? "";
    const domain = domainOf(row.website ?? "");
    const city = row.city ?? "";

    // ─── PHONE ENRICHMENT ────────────────────────────────────────────────
    let phone: BestPhoneResult | null = null;
    let enriched: EnrichedPersonResult | null = null;

    if (!ownerName) {
      // No owner to match against — skip phone, set fallback strategy.
      row.decision_maker_phone_confidence = "not_found";
      row.phone_fallback_strategy = "Call main line, ask for the practice principal by name";
      report.phonesNotFound++;
    } else {
      const cached = readApolloCache<{ enriched: EnrichedPersonResult | null; phone: BestPhoneResult | null }>(domain || city, ownerName);
      if (cached) {
        report.cacheHits++;
        enriched = cached.enriched;
        phone = cached.phone;
      } else {
        const { first, last } = nameSplit(ownerName);
        try {
          // Primary: name + domain
          enriched = await matchAndEnrichByName({
            firstName: first,
            lastName: last,
            domain: domain || undefined,
            organizationName: row.practice_name,
            revealPhone: true,
            revealEmail: !opts.phoneOnly,
          });
          // Fallback: name + city (search free, enrich paid)
          if (!enriched && city) {
            const cand = await searchPersonByNameAndCity({ firstName: first, lastName: last, city });
            if (cand?.id) {
              enriched = await enrichPerson({
                id: cand.id,
                revealPhone: true,
                revealEmail: !opts.phoneOnly,
              });
            }
          }
          if (enriched) {
            const mainPhones = [row.practice_phone].filter(Boolean);
            phone = extractBestPhone(enriched, mainPhones);
          }
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("MAX_APOLLO_CREDITS_PER_RUN exceeded")) {
            log.error(msg);
            throw e; // fail loud per spec
          }
          log.warn(`enrich failed for ${row.practice_name}: ${msg}`);
        }
        writeApolloCache(domain || city, ownerName, { enriched, phone });
      }

      if (phone) {
        row.decision_maker_direct_phone = phone.number;
        row.decision_maker_phone_confidence = phone.confidence;
        row.apollo_person_id = phone.apolloPersonId;
        row.phone_fallback_strategy = "";
        report.phonesFound++;
      } else {
        row.decision_maker_direct_phone = "";
        row.decision_maker_phone_confidence = "not_found";
        row.apollo_person_id = enriched?.id ?? "";
        const linkedIn = enriched?.linkedin_url ?? (enriched?.raw as { linkedin_url?: string } | undefined)?.linkedin_url ?? "";
        const hasGoodEmail = row.owner_email && row.owner_email !== "needs_manual_review";
        if (linkedIn) {
          row.phone_fallback_strategy = `LinkedIn DM: ${linkedIn}`;
        } else if (hasGoodEmail) {
          row.phone_fallback_strategy = `Email then call main line asking for ${ownerName} re receptionist hiring`;
        } else {
          row.phone_fallback_strategy = `Call main line, ask for ${ownerName} by name`;
        }
        report.phonesNotFound++;
      }

      // Contradiction detection
      if (enriched) {
        const apolloFull = enriched.name ?? [enriched.first_name, enriched.last_name].filter(Boolean).join(" ");
        if (apolloFull && ownerName && normName(apolloFull) && normName(apolloFull) !== normName(ownerName)) {
          report.contradictions.push({
            practice: row.practice_name,
            field: "owner_name",
            existing: ownerName,
            apollo: apolloFull,
          });
        }
        if (
          enriched.email &&
          row.owner_email &&
          row.owner_email !== "needs_manual_review" &&
          enriched.email.toLowerCase() !== row.owner_email.toLowerCase()
        ) {
          report.contradictions.push({
            practice: row.practice_name,
            field: "owner_email",
            existing: row.owner_email,
            apollo: enriched.email,
          });
        }
      }
    }

    // ─── EMAIL CLEANUP ──────────────────────────────────────────────────────
    if (opts.phoneOnly) continue;

    const currentEmail = row.owner_email ?? "";
    if (!currentEmail || currentEmail === "needs_manual_review") {
      row.email_local_part_classification = "";
      continue;
    }

    const validation = validateOwnerEmail(currentEmail);
    row.email_local_part_classification = validation.classification;

    if (!validation.ok && validation.badToken) {
      // Bad token — rejected
      row.email_extraction_error = currentEmail;
      row.owner_email = "needs_manual_review";
      row.owner_email_confidence = "none";
      report.emailsRejected++;

      // Fallback: scrape the practice site for a clean email
      if (row.website && ownerName) {
        try {
          const found = await scrapeFallbackEmail({
            website: row.website,
            ownerName,
            domain,
          });
          if (found) {
            row.owner_email = found.email;
            row.owner_email_confidence = "medium";
            row.email_source_url = found.sourceUrl;
            // Re-classify
            row.email_local_part_classification = validateOwnerEmail(found.email).classification;
            report.emailsFixedByScrape++;
          } else {
            report.emailsNeedingReview++;
          }
        } catch (e) {
          log.warn(`fallback email scrape failed for ${row.practice_name}: ${(e as Error).message}`);
          report.emailsNeedingReview++;
        }
      } else {
        report.emailsNeedingReview++;
      }
    } else if (validation.classification === "other" && row.owner_email_confidence === "high") {
      // Plausible but not name-shape and not role-inbox — downgrade confidence.
      row.owner_email_confidence = "low";
    }
  }

  return report;
}
