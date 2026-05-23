import type { OutreachLead } from "../types.js";
import type { BriefFact, PersonalisationBrief } from "./types.js";
import { fetchUrl } from "../utils/http.js";

const REVIEW_SNIPPET_PAGES = ["/", "/about", "/about-us"];

/**
 * Assemble 3-4 specific factual points from the CSV row, with an optional
 * cheap homepage fetch to add one more specific detail (e.g. a service
 * line mentioned in the H1). Does NOT re-hit paid APIs.
 */
export async function buildBrief(lead: OutreachLead): Promise<PersonalisationBrief> {
  const facts: BriefFact[] = [];

  if (lead.hiring_receptionist === "yes") {
    facts.push({
      text: `Currently advertising a receptionist / front-of-house role`,
      source_url: lead.hiring_source_url || undefined,
    });
  }

  if (lead.invisalign_strength === "strong") {
    facts.push({
      text: `Invisalign is visibly a strong part of their positioning (multiple on-site references)`,
      source_url: lead.email_source_url || lead.owner_source_url || lead.website || undefined,
    });
  } else if (lead.invisalign_strength === "medium") {
    facts.push({
      text: `Offers Invisalign (covered on the site, not headline)`,
      source_url: lead.website || undefined,
    });
  }

  if (typeof lead.rating === "number" && typeof lead.review_count === "number" && lead.review_count > 0) {
    facts.push({
      text: `${lead.rating.toFixed(1)}★ across ${lead.review_count} Google reviews`,
    });
  }

  if (lead.owner_name && lead.owner_title) {
    facts.push({
      text: `${lead.owner_name} is listed as ${lead.owner_title}`,
      source_url: lead.owner_source_url || undefined,
    });
  }

  // Optional cheap homepage fetch if we don't yet have 3 facts.
  if (facts.length < 3 && lead.website) {
    const snippet = await fetchHomepageSignal(lead.website).catch(() => null);
    if (snippet) facts.push({ text: snippet, source_url: lead.website });
  }

  if (lead.city) {
    // Demote city to last-resort fact (we never anchor an opener on it,
    // but Claude may use it for context).
    facts.push({ text: `Located in ${lead.city}` });
  }

  return { facts: facts.slice(0, 4) };
}

async function fetchHomepageSignal(website: string): Promise<string | null> {
  for (const path of REVIEW_SNIPPET_PAGES) {
    try {
      const url = new URL(path, website).toString();
      const r = await fetchUrl(url, { acceptHtml: true });
      if (!r.ok || !r.body) continue;
      // Extract page title and h1 as low-risk specific signals.
      const title = r.body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim().slice(0, 90);
      const h1 = r.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
      if (title && h1 && title.toLowerCase() !== h1.toLowerCase()) return `Site headline: “${h1}”`;
      if (h1) return `Site headline: “${h1}”`;
      if (title) return `Site title: “${title}”`;
    } catch {
      /* ignore */
    }
  }
  return null;
}
