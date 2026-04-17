import type { RawPlace } from "../types.js";
import { domainOf, haversineKm, normaliseName, postcodeOutcode } from "./normalise.js";

export interface Cluster {
  canonicalName: string;
  records: RawPlace[];
  website?: string;
  domain?: string;
  postcode?: string;
  outcode?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  address?: string;
  phone?: string;
  email?: string;
  sources: Set<string>;
  sourceUrls: Set<string>;
  placesDescription?: string;
  placesReviewInvisalign?: boolean;
}

function pickNotEmpty<T>(a: T | undefined, b: T | undefined): T | undefined {
  if (a !== undefined && a !== null && (typeof a !== "string" || a.trim() !== "")) return a;
  return b;
}

function clusterKey(r: RawPlace): { name: string; domain: string; outcode: string } {
  return {
    name: normaliseName(r.name),
    domain: domainOf(r.website),
    outcode: postcodeOutcode(r.postcode),
  };
}

export function dedupe(records: RawPlace[]): Cluster[] {
  const clusters: Cluster[] = [];

  const add = (c: Cluster, r: RawPlace): void => {
    c.records.push(r);
    c.sources.add(r.source);
    c.sourceUrls.add(r.source_url);
    c.canonicalName = c.canonicalName.length >= r.name.length ? c.canonicalName : r.name;
    c.website = pickNotEmpty(c.website, r.website);
    c.domain = c.website ? domainOf(c.website) : c.domain;
    c.postcode = pickNotEmpty(c.postcode, r.postcode);
    c.outcode = c.postcode ? postcodeOutcode(c.postcode) : c.outcode;
    c.lat = pickNotEmpty(c.lat, r.lat);
    c.lng = pickNotEmpty(c.lng, r.lng);
    c.rating = pickNotEmpty(c.rating, r.rating);
    c.reviewCount = pickNotEmpty(c.reviewCount, r.reviewCount);
    c.address = pickNotEmpty(c.address, r.address);
    c.phone = pickNotEmpty(c.phone, r.phone);
    c.email = pickNotEmpty(c.email, r.email);
    c.placesDescription = pickNotEmpty(c.placesDescription, r.placesDescription);
    if (r.placesReviewInvisalign) c.placesReviewInvisalign = true;
  };

  for (const r of records) {
    const key = clusterKey(r);
    const match = clusters.find((c) => {
      // Strong match: same domain
      if (c.domain && key.domain && c.domain === key.domain) return true;
      // Name + outcode match
      if (key.name && normaliseName(c.canonicalName) === key.name) {
        if (key.outcode && c.outcode && key.outcode === c.outcode) return true;
        // Also allow close coords (< 150m) if both sides have coords
        if (r.lat && r.lng && c.lat && c.lng) {
          if (haversineKm({ lat: r.lat, lng: r.lng }, { lat: c.lat, lng: c.lng }) < 0.15) return true;
        }
        if (!key.outcode && !c.outcode) return true;
      }
      // Coordinate cluster fallback (same normalised name word overlap)
      if (r.lat && r.lng && c.lat && c.lng) {
        const d = haversineKm({ lat: r.lat, lng: r.lng }, { lat: c.lat, lng: c.lng });
        if (d < 0.05) {
          const aw = new Set(normaliseName(c.canonicalName).split(" "));
          const bw = new Set(key.name.split(" "));
          const overlap = [...aw].filter((w) => bw.has(w)).length;
          if (overlap >= 2) return true;
        }
      }
      return false;
    });

    if (match) {
      add(match, r);
    } else {
      const c: Cluster = {
        canonicalName: r.name,
        records: [],
        sources: new Set(),
        sourceUrls: new Set(),
      };
      add(c, r);
      clusters.push(c);
    }
  }

  return clusters;
}
