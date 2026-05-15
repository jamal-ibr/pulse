import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";

// Tokens that, if found in the local-part of an extracted owner email,
// indicate upstream name-extraction captured surrounding text instead
// of an actual person's name. Source: the qualification artefacts users
// flagged in last night's run ("faizan.founder", "graham.oral", etc).
export const BAD_LOCAL_PART_TOKENS = [
  "founder", "principal", "owner", "dentist", "our", "is", "has",
  "completed", "gdc", "no", "practice", "oral", "clinical",
  "director", "specialist", "orthodontist",
];

const ROLE_INBOX_LOCALS = new Set([
  "info", "hello", "contact", "reception", "enquiries", "admin",
  "appointments", "bookings", "team", "practice", "frontdesk",
  "office", "hi", "mail", "support", "help", "recruitment",
  "careers", "jobs", "smile", "welcome",
]);

export type EmailLocalClass = "name_format" | "role_inbox" | "other";

export interface EmailValidation {
  ok: boolean;
  reason?: string;
  classification: EmailLocalClass;
  badToken?: string;
}

/**
 * Validate an extracted owner email. Returns ok=false when the local-part
 * contains a flagged token (likely an extraction artefact). Always returns
 * a classification of the local-part shape so the caller can adjust
 * confidence.
 */
export function validateOwnerEmail(email: string): EmailValidation {
  if (!email) return { ok: false, reason: "empty", classification: "other" };
  const lc = email.toLowerCase().trim();
  const m = lc.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) return { ok: false, reason: "bad_syntax", classification: "other" };
  const local = m[1];

  // Reject when any local-part token matches a bad token. Tokens are
  // separated by . _ - or word boundary.
  const tokens = local.split(/[._\-]+/).filter(Boolean);
  for (const t of tokens) {
    if (BAD_LOCAL_PART_TOKENS.includes(t)) {
      return { ok: false, reason: `bad_token:${t}`, classification: "other", badToken: t };
    }
  }

  if (ROLE_INBOX_LOCALS.has(local)) {
    return { ok: true, classification: "role_inbox" };
  }
  // Plausible name shapes: first, first.last, f.last, first_last, first-last,
  // and three-part names (first.middle.last). All-letter tokens only.
  const looksLikeName =
    /^[a-z]+$/.test(local) ||
    /^[a-z]+[._-][a-z]+$/.test(local) ||
    /^[a-z]\.[a-z]+$/.test(local) ||
    /^[a-z]+[._-][a-z]+[._-][a-z]+$/.test(local);
  if (looksLikeName) return { ok: true, classification: "name_format" };

  return { ok: true, classification: "other", reason: "unusual_local_part" };
}

// ─── Fallback scrape ─────────────────────────────────────────────────
const FALLBACK_PATHS = [
  "/contact", "/contact-us", "/contact.html",
  "/about", "/about-us",
  "/team", "/meet-the-team", "/our-team", "/meet-our-team",
];

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function stripTitles(name: string): string {
  return name.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Mx\.?|Prof\.?)\s+/i, "").trim();
}

function nameTokens(full: string): { first: string; last: string } {
  const cleaned = stripTitles(full).toLowerCase().replace(/[^a-z\s-]/g, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

/**
 * Re-scrape the practice's contact / about / team pages looking for an
 * email whose local-part contains the owner's first or last name. Used
 * as a fallback when the upstream-scraped email was rejected.
 */
export async function scrapeFallbackEmail(opts: {
  website: string;
  ownerName: string;
  domain: string;
}): Promise<{ email: string; sourceUrl: string } | null> {
  if (!opts.website || !opts.ownerName || !opts.domain) return null;
  let base: URL;
  try {
    base = new URL(opts.website);
  } catch {
    return null;
  }
  const { first, last } = nameTokens(opts.ownerName);
  if (!first && !last) return null;

  for (const path of FALLBACK_PATHS) {
    const url = `${base.origin}${path}`;
    let r;
    try {
      r = await fetchUrl(url, { acceptHtml: true });
    } catch {
      continue;
    }
    if (!r.ok || !r.body) continue;
    const matches = Array.from(new Set((r.body.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
    const sameDomain = matches.filter((e) => e.endsWith("@" + opts.domain));
    const nameMatch = sameDomain.find((e) => {
      const local = e.split("@")[0];
      return (first && local.includes(first)) || (last && last.length > 2 && local.includes(last));
    });
    if (nameMatch) {
      const v = validateOwnerEmail(nameMatch);
      if (v.ok) return { email: nameMatch, sourceUrl: r.url };
    }
  }
  log.debug(`fallback scrape: no email match for ${opts.ownerName} on ${opts.website}`);
  return null;
}
