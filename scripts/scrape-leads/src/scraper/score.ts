import { CONFIG } from "../config.js";
import { haversineKm } from "../utils/normalise.js";

export function popularityScore(rating: number | undefined, reviewCount: number | undefined): number {
  const r = rating ?? 3.5;
  const c = reviewCount ?? 0;
  return r * Math.log10(c + 10);
}

export function proximityScore(lat: number | undefined, lng: number | undefined): { score: number; km: number } {
  if (lat === undefined || lng === undefined) return { score: 0, km: 9999 };
  const km = haversineKm({ lat, lng }, CONFIG.birminghamCentre);
  return { score: 10 / (1 + km), km };
}

export function invisalignScore(mentions: number): number {
  return 1 + Math.min(mentions, 20) / 20;
}

export function totalScore(pop: number, prox: number, inv: number): number {
  return pop * prox * inv;
}
