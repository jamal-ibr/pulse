import { OVERPASS_BBOX } from "../config.js";
import { fetchUrl } from "../utils/http.js";
import { log } from "../utils/logger.js";
import type { RawPlace } from "../types.js";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

interface OverpassEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function collectFromOsm(bbox = OVERPASS_BBOX): Promise<RawPlace[]> {
  const { south, west, north, east } = bbox;
  const q = `[out:json][timeout:60];
(
  node["healthcare"="dentist"](${south},${west},${north},${east});
  way["healthcare"="dentist"](${south},${west},${north},${east});
  node["amenity"="dentist"](${south},${west},${north},${east});
  way["amenity"="dentist"](${south},${west},${north},${east});
  node["healthcare"="orthodontist"](${south},${west},${north},${east});
  way["healthcare"="orthodontist"](${south},${west},${north},${east});
  node["healthcare:speciality"~"orthodont",i](${south},${west},${north},${east});
);
out tags center;`;

  let result: Awaited<ReturnType<typeof fetchUrl>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const endpoint of ENDPOINTS) {
      const r = await fetchUrl(endpoint, {
        method: "POST",
        acceptJson: true,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        bypassRobots: true,
        timeoutMs: 90_000,
      });
      if (r.ok && r.body.trim().startsWith("{")) { result = r; break; }
      log.debug("overpass endpoint failed", { endpoint, status: r.status, err: r.error });
    }
    if (result) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  if (!result || !result.ok) {
    log.warn("osm overpass failed after retries", { status: result?.status, err: result?.error });
    return [];
  }
  let parsed: { elements?: OverpassEl[] };
  try { parsed = JSON.parse(result.body); } catch {
    log.warn("osm overpass json parse error"); return [];
  }
  const out: RawPlace[] = [];
  const sourceUrlBase = `${ENDPOINTS[0]}?data=${encodeURIComponent(q)}`;
  for (const el of parsed.elements ?? []) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? tags["name:en"] ?? "").trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const website = tags.website ?? tags["contact:website"] ?? tags.url;
    const phone = tags.phone ?? tags["contact:phone"] ?? tags["contact:mobile"];
    const email = tags.email ?? tags["contact:email"];
    const postcode = tags["addr:postcode"] ?? tags.postcode;
    const street = tags["addr:street"];
    const housenumber = tags["addr:housenumber"];
    const city = tags["addr:city"] ?? tags["addr:town"] ?? "";
    const address = [housenumber, street, city, postcode].filter(Boolean).join(", ");
    out.push({
      source: "osm_overpass",
      source_url: `${sourceUrlBase}#${el.type}/${el.id}`,
      name,
      website: website || undefined,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      postcode: postcode || undefined,
      lat,
      lng,
      fetchedAt: new Date().toISOString(),
    });
  }
  log.info("osm_overpass", { found: out.length });
  return out;
}
