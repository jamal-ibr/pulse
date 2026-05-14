import type { Confidence, CrawlFindings } from "../types.js";
import { checkEmail, emailLooksPersonal } from "./email-verify.js";

export interface OwnerEnrichmentInput {
  domain: string;
  ownerName: string;
  ownerTitle: string;
  crawl: CrawlFindings | null;
  /** Practice main phone, already scraped (likely reception). */
  practicePhone?: { value: string; source_url: string };
}

export interface OwnerEnrichmentResult {
  email: string;
  emailConfidence: Confidence;
  emailMethod: "scraped_name_match" | "scraped_same_domain" | "pattern" | "none";
  emailSourceUrl: string;
  directPhone: string;
  directPhoneConfidence: Confidence;
  directPhoneMethod: "scraped_near_owner" | "scraped_generic" | "none";
  directPhoneSourceUrl: string;
  practicePhone: string;
  practicePhoneSourceUrl: string;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function nameParts(full: string): { first: string; last: string } {
  const cleaned = stripDiacritics(full)
    .replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Mx\.?|Prof\.?)\s+/i, "")
    .replace(/[^A-Za-z\s-]/g, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { first: (parts[0] ?? "").toLowerCase(), last: "" };
  }
  return { first: parts[0].toLowerCase(), last: parts[parts.length - 1].toLowerCase() };
}

function patternCandidates(first: string, last: string, domain: string): string[] {
  if (!first) return [];
  const f = first;
  const l = last;
  const out = new Set<string>();
  if (l) {
    out.add(`${f}.${l}@${domain}`);
    out.add(`${f}${l}@${domain}`);
    out.add(`${f[0]}${l}@${domain}`);
    out.add(`${f[0]}.${l}@${domain}`);
    out.add(`${f}_${l}@${domain}`);
    out.add(`${l}.${f}@${domain}`);
    out.add(`${l}@${domain}`);
  }
  out.add(`${f}@${domain}`);
  return [...out];
}

/**
 * Replicate Apollo's owner-contact resolution without burning credits.
 *
 * Three strategies, in priority order:
 *  1. SCRAPED-NAME-MATCH — a same-domain email scraped from the practice
 *     site whose local part contains the owner's first or last name.
 *     High confidence.
 *  2. SCRAPED-SAME-DOMAIN — a same-domain email that LOOKS personal
 *     (first.last form, not a role address). Medium confidence.
 *  3. PATTERN — generate first.last@domain (etc.) and validate via DNS MX
 *     record. Medium confidence.
 *
 * Phone direct-dial is rarely published; we surface the practice phone
 * (likely reception) and let Apollo's has_direct_phone flag indicate
 * whether a true direct dial *exists* in Apollo's data for paid enrichment.
 */
export async function enrichOwnerContact(input: OwnerEnrichmentInput): Promise<OwnerEnrichmentResult> {
  const empty: OwnerEnrichmentResult = {
    email: "", emailConfidence: "none", emailMethod: "none", emailSourceUrl: "",
    directPhone: "", directPhoneConfidence: "none", directPhoneMethod: "none", directPhoneSourceUrl: "",
    practicePhone: input.practicePhone?.value ?? "",
    practicePhoneSourceUrl: input.practicePhone?.source_url ?? "",
  };

  const { ownerName, domain, crawl } = input;
  const { first, last } = nameParts(ownerName);
  if (!domain) return empty;

  const result = { ...empty };

  // STRATEGY 1 — scraped same-domain email containing owner's name parts
  if (crawl && (first || last)) {
    const personalMatch = crawl.emails.find((e) => {
      const lc = e.value.toLowerCase();
      const [local, host] = lc.split("@");
      if (!host || !host.endsWith(domain)) return false;
      const matchesName = (first && local.includes(first)) || (last && last.length > 2 && local.includes(last));
      return Boolean(matchesName);
    });
    if (personalMatch) {
      const check = await checkEmail(personalMatch.value);
      if (check.syntaxOk && check.hasMx && !check.isDisposable) {
        result.email = personalMatch.value;
        result.emailConfidence = "high";
        result.emailMethod = "scraped_name_match";
        result.emailSourceUrl = personalMatch.source_url;
      }
    }
  }

  // STRATEGY 2 — any personal-looking same-domain email
  if (!result.email && crawl) {
    const sameDomain = crawl.emails.find((e) => {
      const lc = e.value.toLowerCase();
      return lc.endsWith("@" + domain) && emailLooksPersonal(lc);
    });
    if (sameDomain) {
      const check = await checkEmail(sameDomain.value);
      if (check.syntaxOk && check.hasMx && !check.isDisposable) {
        result.email = sameDomain.value;
        result.emailConfidence = "medium";
        result.emailMethod = "scraped_same_domain";
        result.emailSourceUrl = sameDomain.source_url;
      }
    }
  }

  // STRATEGY 3 — pattern guess + MX-verify
  if (!result.email && first) {
    const candidates = patternCandidates(first, last, domain);
    for (const cand of candidates) {
      const check = await checkEmail(cand);
      if (check.syntaxOk && check.hasMx && !check.isDisposable) {
        // Pattern + valid MX = the domain accepts mail and this address is
        // syntactically valid. We can't confirm deliverability without SMTP
        // (which is unreliable due to catch-alls / anti-abuse), so cap at medium.
        result.email = cand;
        result.emailConfidence = "medium";
        result.emailMethod = "pattern";
        result.emailSourceUrl = `pattern:${cand}`;
        break;
      }
    }
  }

  // PHONE — direct-dial heuristic: if an owner candidate's source page also
  // appears in the phones list with a *different* number than the practice
  // main, treat that as a possible direct line (low confidence).
  if (crawl && crawl.ownerCandidates.length > 0) {
    const ownerPages = new Set(crawl.ownerCandidates.map((o) => o.source_url));
    const ownerPagePhones = crawl.phones.filter((p) => ownerPages.has(p.source_url));
    const practiceNumber = input.practicePhone?.value;
    const distinct = ownerPagePhones.find((p) => p.value !== practiceNumber);
    if (distinct) {
      result.directPhone = distinct.value;
      result.directPhoneConfidence = "low";
      result.directPhoneMethod = "scraped_near_owner";
      result.directPhoneSourceUrl = distinct.source_url;
    }
  }

  return result;
}
