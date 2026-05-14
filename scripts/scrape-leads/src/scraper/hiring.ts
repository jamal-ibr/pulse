import { checkHiringReceptionist } from "../sources/apollo.js";
import { fetchUrl } from "../utils/http.js";
import { CONFIG } from "../config.js";
import type { HiringSignal } from "../types.js";
import { log } from "../utils/logger.js";

const CAREERS_PATHS = [
  "/careers",
  "/jobs",
  "/vacancies",
  "/recruitment",
  "/work-with-us",
  "/join-us",
  "/join-our-team",
];

const HIRING_KEYWORDS = /(receptionist|front of house|patient coordinator|treatment coordinator|front\s?desk)/i;
const JOB_KEYWORDS = /(hire|hiring|join|apply|vacanc|recruit|opportun|currently looking|we are looking|now looking|career)/i;

/**
 * Detect whether a practice is actively hiring receptionists or front-of-house
 * staff. Apollo's q_organization_job_titles filter is the primary signal
 * (free). If Apollo says no, we still scan the practice's own /careers page
 * because Apollo's hiring data can lag the site by weeks.
 */
export async function detectHiring(opts: { website?: string; domain: string }): Promise<HiringSignal> {
  const empty: HiringSignal = { isHiringReceptionist: false, apolloOpenRoles: [], sourceUrl: "" };
  if (!opts.domain) return empty;

  // Primary: Apollo (free)
  if (CONFIG.apolloKey) {
    try {
      const apollo = await checkHiringReceptionist({ domain: opts.domain });
      if (apollo.hiring) {
        return {
          isHiringReceptionist: true,
          apolloOpenRoles: apollo.openRoles,
          sourceUrl: `apollo:hiring:domain=${opts.domain}`,
        };
      }
    } catch (e) {
      log.debug(`hiring: apollo check failed: ${(e as Error).message}`);
    }
  }

  // Fallback: scan the practice's own careers page
  if (opts.website) {
    let base: URL;
    try {
      base = new URL(opts.website);
    } catch {
      return empty;
    }
    for (const path of CAREERS_PATHS) {
      const url = `${base.origin}${path}`;
      const r = await fetchUrl(url, { acceptHtml: true });
      if (!r.ok) continue;
      const text = r.body;
      if (HIRING_KEYWORDS.test(text) && JOB_KEYWORDS.test(text)) {
        return {
          isHiringReceptionist: true,
          apolloOpenRoles: ["receptionist (careers page)"],
          sourceUrl: r.url,
        };
      }
    }
  }

  return empty;
}
