import type { OutreachLead } from "../types.js";
import type { Angle, PersonalisationBrief, PersonalisationConfidence } from "./types.js";

export interface ConfidenceInput {
  lead: OutreachLead;
  angle: Angle;
  brief: PersonalisationBrief;
}

/**
 * HIGH: a specific verifiable hook (named job posting URL, specific review
 *       theme tied to volume, specific cosmetic focus on own site).
 * MEDIUM: hook is real but less specific; the opener could plausibly fit a
 *         few similar practices.
 * LOW: hook is generic; data thin/stale; or angle is the fallback.
 */
export function scoreConfidence(input: ConfidenceInput): PersonalisationConfidence {
  if (input.angle === "LOW_PERSONALISATION_FALLBACK") return "LOW";

  const factsWithSources = input.brief.facts.filter((f) => Boolean(f.source_url)).length;
  const hasHiringSource = input.lead.hiring_receptionist === "yes" && Boolean(input.lead.hiring_source_url);
  const exceptionalReviews =
    typeof input.lead.review_count === "number" &&
    typeof input.lead.rating === "number" &&
    input.lead.review_count >= 200 &&
    input.lead.rating >= 4.5;

  // HIGH — angle is hiring with a real source URL, OR strong cosmetic +
  // exceptional review signal, OR multi-source brief with 3+ source-backed facts.
  if (input.angle === "RECEPTION_OVERLOAD" && hasHiringSource) return "HIGH";
  if (input.angle === "HIGH_VALUE_COSMETIC_LEADS" && input.lead.invisalign_strength === "strong" && exceptionalReviews) {
    return "HIGH";
  }
  if (input.angle === "REVIEW_VOLUME_SIGNAL" && typeof input.lead.review_count === "number" && input.lead.review_count >= 500) {
    return "HIGH";
  }
  if (factsWithSources >= 3) return "HIGH";

  // MEDIUM — angle has supporting evidence but the hook is less unique.
  if (factsWithSources >= 1) return "MEDIUM";
  if (input.angle === "MULTI_LOCATION_ADMIN_LOAD") return "MEDIUM";
  if (input.angle === "MISSED_AFTER_HOURS_ENQUIRIES") return "MEDIUM";

  return "LOW";
}
