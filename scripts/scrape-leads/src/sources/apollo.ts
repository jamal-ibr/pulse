import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

const API_BASE = "https://api.apollo.io/api/v1";

// Apollo's documented limit: 600 People Search requests per hour.
const MIN_GAP_MS = 6_500;
const SAFETY_CAP_PER_HOUR = 580;

let lastRequestAt = 0;
let requestsThisHour = 0;
let hourStart = Date.now();
let totalRequests = 0;
const totalByType: Record<string, number> = {};

// ─── Credit budget (paid /people/match with reveal_*) ───────────────────
let creditsUsed = 0;
let maxCredits = Number(process.env.MAX_APOLLO_CREDITS_PER_RUN ?? 100);

export function setMaxApolloCredits(n: number): void {
  maxCredits = n;
}

export function getApolloCreditsUsed(): number {
  return creditsUsed;
}

export function getApolloMaxCredits(): number {
  return maxCredits;
}

function assertCreditBudget(): void {
  if (creditsUsed >= maxCredits) {
    throw new Error(
      `MAX_APOLLO_CREDITS_PER_RUN exceeded: ${creditsUsed}/${maxCredits} credits already used. Halting to protect cost. Raise the env var or rerun with --max-enrich lowered.`,
    );
  }
}

export function getApolloStats(): { totalRequests: number; byType: Record<string, number>; requestsThisHour: number; creditsUsed: number; maxCredits: number } {
  return { totalRequests, byType: { ...totalByType }, requestsThisHour, creditsUsed, maxCredits };
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
  has_direct_phone: string;
  organization?: { name?: string; has_phone?: boolean };
}

interface PeopleSearchResponse {
  total_entries?: number;
  people?: ApolloPerson[];
}

/**
 * Identify owner-level people at a practice by company domain. FREE.
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
 * Hiring-receptionist signal via Apollo's job-title filter. FREE.
 */
export async function checkHiringReceptionist(opts: { domain: string }): Promise<{ hiring: boolean; openRoles: string[]; totalEntries: number }> {
  if (!opts.domain) return { hiring: false, openRoles: [], totalEntries: 0 };
  const params = {
    q_organization_domains_list: [opts.domain],
    q_organization_job_titles: [
      "receptionist", "dental receptionist", "front of house",
      "practice receptionist", "patient coordinator", "treatment coordinator",
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
  name?: string;
  email?: string;
  linkedin_url?: string;
  phone_numbers?: Array<{ raw_number?: string; sanitized_number?: string; type?: string; status?: string }>;
  organization?: { name?: string; website_url?: string };
  raw: unknown;
}

/**
 * Enrich a person to reveal direct phone / email. CONSUMES 1 CREDIT when
 * Apollo finds a match (no credit if no match). Respects MAX_APOLLO_CREDITS_PER_RUN.
 */
export async function enrichPerson(opts: { id: string; revealPhone: boolean; revealEmail: boolean }): Promise<EnrichedPersonResult | null> {
  if (opts.revealPhone || opts.revealEmail) assertCreditBudget();
  const params: Record<string, unknown> = { id: opts.id };
  if (opts.revealPhone) params.reveal_phone_number = true;
  if (opts.revealEmail) params.reveal_personal_emails = true;
  try {
    const data = (await apolloRequest("/people/match", params, "enrichPerson")) as { person?: Record<string, unknown> } | undefined;
    const p = (data?.person ?? data) as Record<string, unknown> | undefined;
    if (!p || !p.id) return null;
    if (opts.revealPhone || opts.revealEmail) creditsUsed++;
    return toEnrichedPerson(p, opts.id);
  } catch (e) {
    log.warn(`apollo enrichPerson failed for ${opts.id}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Match + enrich a person by NAME + (domain OR organization name).
 * Apollo only charges a credit when it finds a match.
 */
export async function matchAndEnrichByName(opts: {
  firstName: string;
  lastName: string;
  domain?: string;
  organizationName?: string;
  revealPhone: boolean;
  revealEmail: boolean;
}): Promise<EnrichedPersonResult | null> {
  if (!opts.firstName && !opts.lastName) return null;
  if (opts.revealPhone || opts.revealEmail) assertCreditBudget();

  const params: Record<string, unknown> = {};
  if (opts.firstName) params.first_name = opts.firstName;
  if (opts.lastName) params.last_name = opts.lastName;
  if (opts.domain) params.domain = opts.domain;
  if (opts.organizationName) params.organization_name = opts.organizationName;
  if (opts.revealPhone) params.reveal_phone_number = true;
  if (opts.revealEmail) params.reveal_personal_emails = true;

  try {
    const data = (await apolloRequest("/people/match", params, "matchByName")) as { person?: Record<string, unknown> } | undefined;
    const p = (data?.person ?? data) as Record<string, unknown> | undefined;
    if (!p || !p.id) return null;
    if (opts.revealPhone || opts.revealEmail) creditsUsed++;
    return toEnrichedPerson(p);
  } catch (e) {
    log.warn(`apollo matchAndEnrichByName failed for ${opts.firstName} ${opts.lastName}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Search by name + city (no domain). Returns an ApolloPerson candidate
 * to feed into enrichPerson() if we want to pay for direct contact data.
 * FREE.
 */
export async function searchPersonByNameAndCity(opts: {
  firstName: string;
  lastName: string;
  city: string;
}): Promise<ApolloPerson | null> {
  if (!opts.firstName || !opts.city) return null;
  const params = {
    q_keywords: `${opts.firstName} ${opts.lastName}`.trim(),
    person_locations: [opts.city],
    page: 1,
    per_page: 5,
  };
  try {
    const data = (await apolloRequest("/mixed_people/search", params, "searchByNameCity")) as PeopleSearchResponse | undefined;
    const people = data?.people ?? [];
    // Pick best name match
    const wantedFirst = opts.firstName.toLowerCase();
    const wantedLast = opts.lastName.toLowerCase();
    return (
      people.find(
        (p) =>
          (p.first_name ?? "").toLowerCase() === wantedFirst ||
          ((p.first_name ?? "").toLowerCase().startsWith(wantedFirst) && wantedLast.length > 0),
      ) ?? people[0] ?? null
    );
  } catch (e) {
    log.warn(`apollo searchPersonByNameAndCity failed: ${(e as Error).message}`);
    return null;
  }
}

// ─── Phone selection ──────────────────────────────────────────────────

export interface BestPhoneResult {
  number: string;
  confidence: "high" | "medium" | "low";
  apolloType: string;
  apolloPersonId: string;
}

function normalizeDigits(s: string | undefined): string {
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  return d.startsWith("44") ? "0" + d.slice(2) : d;
}

/**
 * Pick the best phone for a decision-maker, preference:
 *   verified mobile > verified direct office > general work line.
 * Skips numbers equal to any of the practice's known main lines.
 */
export function extractBestPhone(
  person: EnrichedPersonResult,
  practiceMainPhones: string[] = [],
): BestPhoneResult | null {
  const phones = person.phone_numbers ?? [];
  if (phones.length === 0) return null;
  const mainDigits = new Set(practiceMainPhones.map(normalizeDigits).filter(Boolean));

  function score(p: { type?: string; sanitized_number?: string; raw_number?: string; status?: string }): number {
    const num = normalizeDigits(p.sanitized_number ?? p.raw_number);
    if (!num || mainDigits.has(num)) return -1;
    const t = (p.type ?? "").toLowerCase();
    const s = (p.status ?? "").toLowerCase();
    const verifiedBoost = s.includes("verified") || s.includes("good") ? 10 : 0;
    if (t.includes("mobile") || t.includes("cell")) return 100 + verifiedBoost;
    if (t.includes("direct")) return 80 + verifiedBoost;
    if (t === "work" || t === "office" || t.includes("hq")) return 60 + verifiedBoost;
    return 40 + verifiedBoost;
  }

  const ranked = [...phones]
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  if (ranked.length === 0) return null;

  const best = ranked[0].p;
  const num = best.sanitized_number ?? best.raw_number ?? "";
  const t = (best.type ?? "").toLowerCase();
  const verified = (best.status ?? "").toLowerCase().includes("verified") || (best.status ?? "").toLowerCase().includes("good");
  const conf: "high" | "medium" | "low" =
    t.includes("mobile") || t.includes("cell")
      ? "high"
      : t.includes("direct")
        ? verified ? "high" : "medium"
        : t === "work" || t === "office"
          ? "medium"
          : "low";

  return { number: num, confidence: conf, apolloType: best.type ?? "unknown", apolloPersonId: person.id };
}

function toEnrichedPerson(p: Record<string, unknown>, fallbackId?: string): EnrichedPersonResult {
  return {
    id: String(p.id ?? fallbackId ?? ""),
    first_name: p.first_name as string | undefined,
    last_name: p.last_name as string | undefined,
    name: p.name as string | undefined,
    email: p.email as string | undefined,
    linkedin_url: p.linkedin_url as string | undefined,
    phone_numbers: p.phone_numbers as EnrichedPersonResult["phone_numbers"],
    organization: p.organization as EnrichedPersonResult["organization"],
    raw: p,
  };
}
