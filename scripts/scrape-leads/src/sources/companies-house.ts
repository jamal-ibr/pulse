import { CONFIG } from "../config.js";
import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";
import { normaliseName, postcodeOutcode } from "../utils/normalise.js";

const BASE = "https://api.company-information.service.gov.uk";

interface SearchCompaniesResp {
  items?: Array<{
    company_number?: string;
    title?: string;
    company_status?: string;
    address?: { postal_code?: string; address_line_1?: string; locality?: string };
  }>;
}

interface OfficersResp {
  items?: Array<{
    name?: string;
    officer_role?: string;
    resigned_on?: string;
    appointed_on?: string;
  }>;
}

function authHeader(): Record<string, string> {
  const b64 = Buffer.from(`${CONFIG.companiesHouseKey}:`).toString("base64");
  return { Authorization: `Basic ${b64}` };
}

export interface CHMatch {
  company_number: string;
  company_name: string;
  postcode?: string;
  directors: Array<{ name: string; role: string }>;
  source_url: string;
}

export async function lookupCompany(practiceName: string, postcode?: string): Promise<CHMatch | null> {
  if (!CONFIG.companiesHouseKey) return null;
  const q = encodeURIComponent(practiceName);
  const url = `${BASE}/search/companies?q=${q}&items_per_page=20`;
  const r = await fetchUrl(url, { acceptJson: true, headers: authHeader(), bypassRobots: true });
  if (!r.ok) {
    if (r.status === 401) log.warn("companies_house auth failed (check API key)");
    return null;
  }
  let parsed: SearchCompaniesResp;
  try { parsed = JSON.parse(r.body); } catch { return null; }
  const wanted = normaliseName(practiceName);
  const targetOutcode = postcodeOutcode(postcode);
  // Rank candidates: active first; postcode match first; name similarity
  const scored = (parsed.items ?? []).map((it) => {
    const n = normaliseName(it.title ?? "");
    const activeScore = it.company_status === "active" ? 10 : 0;
    const pcScore = targetOutcode && it.address?.postal_code && postcodeOutcode(it.address.postal_code) === targetOutcode ? 20 : 0;
    let nameScore = 0;
    if (n === wanted) nameScore = 50;
    else if (n.startsWith(wanted) || wanted.startsWith(n)) nameScore = 30;
    else {
      const a = new Set(n.split(" "));
      const b = new Set(wanted.split(" "));
      const overlap = [...a].filter((w) => b.has(w) && w.length > 2).length;
      nameScore = overlap * 5;
    }
    return { it, score: activeScore + pcScore + nameScore };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 15 || !best.it.company_number) return null;
  // Fetch officers
  const officersUrl = `${BASE}/company/${best.it.company_number}/officers`;
  const or = await fetchUrl(officersUrl, { acceptJson: true, headers: authHeader(), bypassRobots: true });
  if (!or.ok) return null;
  let officers: OfficersResp;
  try { officers = JSON.parse(or.body); } catch { return null; }
  const directors = (officers.items ?? [])
    .filter((o) => !o.resigned_on && /director/i.test(o.officer_role ?? ""))
    .map((o) => ({ name: (o.name ?? "").trim(), role: o.officer_role ?? "director" }))
    .filter((d) => d.name);
  return {
    company_number: best.it.company_number,
    company_name: best.it.title ?? "",
    postcode: best.it.address?.postal_code,
    directors,
    source_url: `https://find-and-update.company-information.service.gov.uk/company/${best.it.company_number}/officers`,
  };
}
