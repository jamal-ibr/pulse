import type { OutreachLead } from "../types.js";
import type { Angle, AngleClassification } from "./types.js";

/**
 * Rule-based, deterministic classifier. Picks the SINGLE strongest angle per
 * lead per the spec. Hiring overrides unless cosmetic signal is exceptionally
 * strong; LOW_PERSONALISATION_FALLBACK is the last resort.
 */
export function classifyAngle(lead: OutreachLead): AngleClassification {
  const reviewCount = typeof lead.review_count === "number" ? lead.review_count : 0;
  const rating = typeof lead.rating === "number" ? lead.rating : 0;
  const isStrongCosmetic = lead.invisalign_strength === "strong";
  const exceptionalCosmetic = isStrongCosmetic && (reviewCount >= 200 || rating >= 4.7);

  if (lead.hiring_receptionist === "yes") {
    if (exceptionalCosmetic) {
      return {
        angle: "HIGH_VALUE_COSMETIC_LEADS",
        justification: `hiring receptionist AND exceptionally strong Invisalign signal (${rating}★, ${reviewCount} reviews)`,
      };
    }
    return {
      angle: "RECEPTION_OVERLOAD",
      justification: `active receptionist hiring (${lead.hiring_source_url || "signal source recorded"})`,
    };
  }

  if (isStrongCosmetic && rating >= 4.5 && reviewCount >= 100) {
    return {
      angle: "HIGH_VALUE_COSMETIC_LEADS",
      justification: `strong Invisalign positioning + social proof (${rating}★, ${reviewCount} reviews)`,
    };
  }

  if (reviewCount >= 300) {
    return {
      angle: "REVIEW_VOLUME_SIGNAL",
      justification: `${reviewCount} reviews indicates very high patient throughput`,
    };
  }

  if (/\b(group|practices|clinics)\b/i.test(lead.practice_name)) {
    return {
      angle: "MULTI_LOCATION_ADMIN_LOAD",
      justification: `practice name suggests multi-site (“${lead.practice_name}”)`,
    };
  }

  if (reviewCount >= 100 && rating >= 4.3) {
    return {
      angle: "MISSED_AFTER_HOURS_ENQUIRIES",
      justification: `${reviewCount} reviews at ${rating}★ — likely high inbound, likely overflowing out-of-hours`,
    };
  }

  return {
    angle: "LOW_PERSONALISATION_FALLBACK",
    justification: "no specific hook above confidence threshold in available data",
  };
}

export const ANGLE_DESCRIPTIONS: Record<Angle, string> = {
  RECEPTION_OVERLOAD:
    "Active receptionist hiring signal. Lead with that fact specifically — they are literally telling the market they need front-desk help.",
  HIGH_VALUE_COSMETIC_LEADS:
    "Strong Invisalign / cosmetic positioning. Anchor on the value of high-ticket cosmetic enquiries quietly being lost to missed calls.",
  MISSED_AFTER_HOURS_ENQUIRIES:
    "Busy practice with strong review volume. Anchor on the cost of after-hours / evening / weekend enquiries that fall through reception's gap.",
  MULTI_LOCATION_ADMIN_LOAD:
    "Multi-site or group practice. Anchor on reception load being spread thin across locations and a single AI receptionist covering all sites consistently.",
  REVIEW_VOLUME_SIGNAL:
    "Very high review count — exceptional patient throughput. Anchor on the missed-enquiry tail an operation that big inevitably has.",
  LOW_PERSONALISATION_FALLBACK:
    "Data does not support a specific hook. Use a generalised but still honest angle — never fabricate a hook. Confidence is LOW by default.",
};
