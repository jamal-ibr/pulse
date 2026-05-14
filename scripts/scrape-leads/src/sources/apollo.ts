import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

const API_BASE = "https://api.apollo.io/api/v1";

// Apollo's documented limit: 600 People Search requests per hour.
// We pace ourselves to ~553/hr (one every 6.5s) to keep safety headroom.
const MIN_GAP_MS = 6_500;
const SAFETY_CAP_PER_HOUR = 580;

let lastRequestAt = 0;
let requestsThisHour = 0;
let hourStart = Date.now();
let totalRequests = 0;
const totalByType: Record<string, number> = {};

export function getApolloStats(): { totalRequests: number; byType: Record<string, number>; requestsThisHour: number } {
  return { totalRequests, byType: { ...totalByType }, requestsThisHour };
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  if (now - hourStart >= 60 * 60 * 1000) {
    hourStart = now;
    requestsThisHour = 0;
  }
  if (requestsThisHour >= SAFETY_CAP_PER_HOUR) {
    const wait = hourStart + 60 * 60 * 1000 - now + 1_000;
    log.warn(`apollo: hit ${SAFETY_CAP_PER_HOUR}/hr cap, sleeping ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
    hourStart = Date.now();
    requestsThisHour = 0;
  }
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - sinceLast));
  }
  lastRequestAt = Date.now();
  requestsThisHour++;
  totalRequests++;
}

async function apolloRequest(path: string, params: Record<string, unknown>, type: string): Promise<unknown> {
  if (!CONFIG.apolloKey) throw new Error("APOLLO_API_KEY not set");
  await rateLimit();
  totalByType[type] = (totalByType[type] ?? 0) + 1;
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": CONFIG.apolloKey,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(params),
  });
  if (res.status === 429) {
    log.warn("apollo 429; sleeping 60s and retrying");
    await new Promise((r) => setTimeout(r, 60_000));
    return apolloRequest(path, params, type);
  }
  if (res.status === 403) {
    const text = await res.text();
    throw new Error(`apollo 403 (master API key required?): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`apollo ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name_obfuscated?: string;
  title?: string | null;
  has_email: boolean;
  has_direct_phone: string; // "Yes" | "Maybe: please request..." | etc.
  organization?: { name?: string; has_phone?: boolean };
}

interface PeopleSearchResponse {
  total_entries?: number;
  people?: ApolloPerson[];
}

/**
 * Identify owner-level people at a practice by company domain.
 * FREE — People Search does not consume credits per Apollo docs.
 */
export async function searchOwners(opts: { domain: string }): Promise<ApolloPerson[]> {
  if (!opts.domain) return [];
  const params = {
    q_organization_domains_list: [opts.domain],
    person_seniorities: ["owner", "founder", "c_suite", "partner", "head"],
    person_titles: [
      "practice owner",
      "principal dentist",
      "principal orthodontist",
      "clinical director",
      "practice principal",
      "dental director",
      "owner",
      "managing director",
    ],
    include_similar_titles: true,
    page: 1,
    per_page: 10,
  };
  try {
    const data = (await apolloRequest("/mixed_people/search", params, "searchOwners")) as PeopleSearchResponse | undefined;
    return data?.people ?? [];
  } catch (e) {
    log.warn(`apollo searchOwners failed for ${opts.domain}: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Detect whether a practice is actively hiring receptionists or similar
 * front-of-house roles via Apollo's q_organization_job_titles filter.
 * FREE.
 */
export async function checkHiringReceptionist(opts: { domain: string }): Promise<{ hiring: boolean; openRoles: string[]; totalEntries: number }> {
  if (!opts.domain) return { hiring: false, openRoles: [], totalEntries: 0 };
  const params = {
    q_organization_domains_list: [opts.domain],
    q_organization_job_titles: [
      "receptionist",
      "dental receptionist",
      "front of house",
      "practice receptionist",
      "patient coordinator",
      "treatment coordinator",
    ],
    page: 1,
    per_page: 1,
  };
  try {
    const data = (await apolloRequest("/mixed_people/search", params, "checkHiring")) as PeopleSearchResponse | undefined;
    const total = data?.total_entries ?? 0;
    return { hiring: total > 0, openRoles: [], totalEntries: total };
  } catch (e) {
    log.warn(`apollo checkHiring failed for ${opts.domain}: ${(e as Error).message}`);
    return { hiring: false, openRoles: [], totalEntries: 0 };
  }
}

export interface EnrichedPersonResult {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_numbers?: Array<{ raw_number?: string; sanitized_number?: string; type?: string }>;
  organization?: { name?: string; website_url?: string };
  raw: unknown;
}

/**
 * Enrich a person to reveal direct phone / email.
 * CALIBRATION-ONLY — burns credits. Used by `npm run leads:calibrate` to
 * verify that our homegrown owner enrichment is close to Apollo's truth.
 */
export async function enrichPerson(opts: { id: string; revealPhone: boolean; revealEmail: boolean }): Promise<EnrichedPersonResult | null> {
  const params: Record<string, unknown> = { id: opts.id };
  if (opts.revealPhone) params.reveal_phone_number = true;
  if (opts.revealEmail) params.reveal_personal_emails = true;
  try {
    const data = (await apolloRequest("/people/match", params, "enrichPerson")) as { person?: Record<string, unknown> } | undefined;
    const p = (data?.person ?? data) as Record<string, unknown> | undefined;
    if (!p) return null;
    return {
      id: String(p.id ?? opts.id),
      first_name: p.first_name as string | undefined,
      last_name: p.last_name as string | undefined,
      email: p.email as string | undefined,
      phone_numbers: p.phone_numbers as EnrichedPersonResult["phone_numbers"],
      organization: p.organization as EnrichedPersonResult["organization"],
      raw: p,
    };
  } catch (e) {
    log.warn(`apollo enrichPerson failed for ${opts.id}: ${(e as Error).message}`);
    return null;
  }
}
