import { CONFIG, LOCALITIES } from "../config.js";
import { log } from "../utils/logger.js";
import type { RawPlace } from "../types.js";
import { fetchUrl } from "../utils/http.js";

const BASE = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.editorialSummary",
  "places.types",
  "places.reviews.text",
  "places.reviews.rating",
].join(",");

interface PlacesResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    websiteUri?: string;
    internationalPhoneNumber?: string;
    nationalPhoneNumber?: string;
    editorialSummary?: { text?: string };
    types?: string[];
    reviews?: Array<{ text?: { text?: string }; rating?: number }>;
  }>;
  error?: { message?: string; status?: string };
}

export async function searchPlaces(
  locality: string,
  variant: string,
): Promise<RawPlace[]> {
  if (!CONFIG.googlePlacesKey) {
    log.warn("google_places skipped: no API key");
    return [];
  }
  const out: RawPlace[] = [];
  const query = `${variant} ${locality} UK`;
  let pageToken: string | undefined;
  const MAX_PAGES = 3;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      regionCode: "GB",
      languageCode: "en",
      maxResultCount: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    const result = await fetchUrl(BASE, {
      method: "POST",
      acceptJson: true,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": CONFIG.googlePlacesKey,
        "X-Goog-FieldMask": FIELD_MASK + (page === 0 ? ",nextPageToken" : ",nextPageToken"),
      },
      body: JSON.stringify(body),
      bypassRobots: true,
    });
    if (!result.ok) {
      log.warn("google_places request failed", { status: result.status, query, err: result.error });
      break;
    }
    let parsed: PlacesResponse;
    try { parsed = JSON.parse(result.body); } catch {
      log.warn("google_places json parse error", { query });
      break;
    }
    if (parsed.error) {
      log.warn("google_places api error", parsed.error);
      break;
    }
    const places = parsed.places ?? [];
    for (const p of places) {
      const name = p.displayName?.text?.trim();
      if (!name) continue;
      // Filter to dental / health related
      const types = (p.types ?? []).join(",").toLowerCase();
      if (types && !/dent|ortho|health|doctor|beauty|clinic/i.test(types) && !/dent|ortho/i.test(name.toLowerCase())) continue;
      const editorial = p.editorialSummary?.text ?? "";
      const reviewsText = (p.reviews ?? []).map((r) => r?.text?.text ?? "").join(" \n ");
      const placesReviewInvisalign = /invisalign/i.test(reviewsText) || /invisalign/i.test(editorial);
      const sourceUrl = `https://places.googleapis.com/v1/places:searchText?q=${encodeURIComponent(query)}#place=${encodeURIComponent(p.id ?? name)}`;
      out.push({
        source: "google_places",
        source_url: sourceUrl,
        name,
        website: p.websiteUri,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
        address: p.formattedAddress,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
        rating: p.rating,
        reviewCount: p.userRatingCount,
        placesDescription: editorial || undefined,
        placesReviewInvisalign,
        fetchedAt: new Date().toISOString(),
      });
    }
    const token = (parsed as unknown as { nextPageToken?: string }).nextPageToken;
    if (!token) break;
    pageToken = token;
    // Google requires a short delay before nextPageToken becomes active
    await new Promise((r) => setTimeout(r, 2000));
  }
  log.info("google_places query", { query, found: out.length });
  return out;
}

export async function collectFromPlaces(variants: string[], localities = LOCALITIES): Promise<RawPlace[]> {
  const all: RawPlace[] = [];
  for (const loc of localities) {
    for (const v of variants) {
      const rows = await searchPlaces(loc.name, v);
      all.push(...rows);
    }
  }
  return all;
}
