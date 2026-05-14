import type { ApolloDirectPhoneFlag, Confidence, InvisalignStrength } from "../types.js";

export interface FitInput {
  invisalignStrength: InvisalignStrength;
  ownerNameKnown: boolean;
  ownerEmailConfidence: Confidence;
  ownerDirectPhoneConfidence: Confidence;
  apolloHasDirectPhone: ApolloDirectPhoneFlag;
  hiringReceptionist: boolean;
  rating: number;       // 0 if unknown
  reviewCount: number;
}

/**
 * Composite fit score (0-10). Higher = better client fit for AI receptionist.
 *
 * Weights:
 *   - Invisalign provider (ICP match):           up to 3
 *   - Owner reachable (email + phone confidence): up to 3
 *   - Currently hiring receptionist (pain we solve): 2
 *   - Social proof / budget (rating & reviews):  up to 2
 */
export function computeFitScore(input: FitInput): number {
  let s = 0;

  if (input.invisalignStrength === "strong") s += 3;
  else if (input.invisalignStrength === "medium") s += 2;
  else s += 1;

  const emailGood = input.ownerEmailConfidence === "high" || input.ownerEmailConfidence === "medium";
  const phoneGood = input.ownerDirectPhoneConfidence === "high" || input.apolloHasDirectPhone === "Yes";
  if (emailGood && phoneGood) s += 3;
  else if (emailGood || phoneGood) s += 2;
  else if (input.ownerNameKnown) s += 1;

  if (input.hiringReceptionist) s += 2;

  if (input.rating >= 4.5 && input.reviewCount >= 100) s += 2;
  else if (input.rating >= 4.3 && input.reviewCount >= 50) s += 1;

  return Math.min(10, s);
}

export interface ContactConfidenceInput {
  ownerNameKnown: boolean;
  ownerEmailConfidence: Confidence;
  ownerDirectPhoneConfidence: Confidence;
  apolloHasDirectPhone: ApolloDirectPhoneFlag;
  hasPracticePhone: boolean;
}

/**
 * How much should you trust this row before you dial / hit send? (0-10)
 *
 * High score = clear owner identity, verified contact channel, multiple
 * supporting signals.  Low score = identity uncertain or pattern-only
 * email with no MX-confirmed direct phone.
 */
export function computeContactConfidence(input: ContactConfidenceInput): number {
  let s = 0;
  if (input.ownerNameKnown) s += 2;
  if (input.ownerEmailConfidence === "high") s += 4;
  else if (input.ownerEmailConfidence === "medium") s += 2;
  else if (input.ownerEmailConfidence === "low") s += 1;
  if (input.ownerDirectPhoneConfidence === "high") s += 3;
  else if (input.ownerDirectPhoneConfidence === "medium") s += 2;
  else if (input.apolloHasDirectPhone === "Yes") s += 1;
  if (input.hasPracticePhone) s += 1;
  return Math.min(10, s);
}
