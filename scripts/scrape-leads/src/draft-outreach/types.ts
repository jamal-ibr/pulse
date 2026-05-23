import type { OutreachLead } from "../types.js";

export type Angle =
  | "RECEPTION_OVERLOAD"
  | "HIGH_VALUE_COSMETIC_LEADS"
  | "MISSED_AFTER_HOURS_ENQUIRIES"
  | "MULTI_LOCATION_ADMIN_LOAD"
  | "REVIEW_VOLUME_SIGNAL"
  | "LOW_PERSONALISATION_FALLBACK";

export interface AngleClassification {
  angle: Angle;
  justification: string;
}

export interface BriefFact {
  text: string;
  source_url?: string;
}

export interface PersonalisationBrief {
  facts: BriefFact[];
}

export type PersonalisationConfidence = "HIGH" | "MEDIUM" | "LOW";
export type DraftChannel = "email" | "phone-or-role-inbox";

export interface DraftResult {
  lead: OutreachLead;
  angle: Angle;
  angle_justification: string;
  brief: PersonalisationBrief;
  subject: string;
  body: string;
  channel: DraftChannel;
  confidence: PersonalisationConfidence;
  word_count: number;
  regenerations: number;
  regenerate_reasons: string[];
  skipped?: { reason: string };
}

export interface BatchOutputs {
  drafts: DraftResult[];
  skipped: Array<{ practice_name: string; reason: string }>;
}
