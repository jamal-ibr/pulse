export type SourceName =
  | "google_places"
  | "osm_overpass"
  | "nhs_find_dentist"
  | "yell"
  | "three_best_rated"
  | "website"
  | "companies_house"
  | "apollo";

export interface RawPlace {
  source: SourceName;
  source_url: string;
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  placesDescription?: string;
  placesReviewInvisalign?: boolean;
  fetchedAt: string;
}

export interface CrawlFindings {
  pagesFetched: string[];
  emails: Array<{ value: string; source_url: string }>;
  phones: Array<{ value: string; source_url: string }>;
  postcodes: string[];
  ownerCandidates: Array<{ name: string; title: string; source_url: string }>;
  invisalignMentions: number;
  invisalignPages: string[];
  blocked: boolean;
}

export interface Lead {
  name: string;
  website: string;
  phone: string;
  email: string;
  owner_name: string;
  owner_title: string;
  address: string;
  postcode: string;
  city: string;
  lat: number | "";
  lng: number | "";
  rating: number | "";
  review_count: number | "";
  invisalign_mentions: number;
  invisalign_on_own_site: boolean;
  km_from_birmingham: number;
  popularity_score: number;
  proximity_score: number;
  invisalign_score: number;
  total_score: number;
  sources: string;
  source_urls: string;
  owner_source_url: string;
  phone_source_url: string;
  email_source_url: string;
  invisalign_source_url: string;
  companies_house_number: string;
  fetched_at: string;
  notes: string;
}

// ─── Outreach pipeline types ───────────────────────────────────────
export type Confidence = "high" | "medium" | "low" | "none";
export type ApolloDirectPhoneFlag = "Yes" | "Maybe" | "No" | "Unknown";
export type InvisalignStrength = "strong" | "medium" | "weak";

export interface OwnerContact {
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
  apolloHasDirectPhone: ApolloDirectPhoneFlag;
  apolloPersonId?: string;
}

export interface HiringSignal {
  isHiringReceptionist: boolean;
  apolloOpenRoles: string[];
  sourceUrl: string;
}

export interface OutreachLead {
  rank: number;
  practice_name: string;
  owner_name: string;
  owner_title: string;
  owner_email: string;
  owner_email_confidence: Confidence;
  practice_phone: string;
  direct_phone: string;
  direct_phone_confidence: Confidence;
  apollo_has_direct_phone: ApolloDirectPhoneFlag;
  hiring_receptionist: "yes" | "no" | "unknown";
  website: string;
  city: string;
  postcode: string;
  invisalign_strength: InvisalignStrength;
  fit_score: number;          // 0-10
  contact_confidence: number; // 0-10
  rating: number | "";
  review_count: number | "";
  notes: string;
  // Provenance — every claim traceable
  owner_source_url: string;
  email_source_url: string;
  direct_phone_source_url: string;
  hiring_source_url: string;
}
