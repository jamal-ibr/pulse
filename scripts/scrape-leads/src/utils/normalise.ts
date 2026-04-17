const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;
const UK_POSTCODE_RE_STRICT = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function normaliseName(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(the|ltd|limited|plc|dental|practice|clinic|surgery|orthodontics|orthodontic|centre|center)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameSlug(s: string): string {
  return normaliseName(s).replace(/\s+/g, "-");
}

export function extractPostcodes(text: string): string[] {
  const out = new Set<string>();
  const matches = text.matchAll(UK_POSTCODE_RE);
  for (const m of matches) {
    const pc = `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
    out.add(pc);
  }
  return [...out];
}

export function postcodeOutcode(pc: string | undefined): string {
  if (!pc) return "";
  const m = pc.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? m[1] : "";
}

export function isValidPostcode(pc: string): boolean {
  return UK_POSTCODE_RE_STRICT.test(pc.trim());
}

export function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+44")) d = "0" + d.slice(3);
  else if (d.startsWith("0044")) d = "0" + d.slice(4);
  else if (d.startsWith("44") && d.length === 12) d = "0" + d.slice(2);
  d = d.replace(/^00/, "");
  d = d.replace(/\D/g, "");
  if (d.length !== 11) return null;
  if (!/^0(1|2|3|7)/.test(d)) return null;
  // Format as "01xxx xxxxxx" or "020 xxxx xxxx" where helpful
  if (/^02/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (/^07/.test(d)) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export function phoneDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

const EMAIL_RE = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL_HOSTS = [
  "sentry.io", "sentry-next.wixpress.com", "wix.com", "wixpress.com",
  "example.com", "example.co.uk", "domain.com", "yourdomain.com",
  "godaddy.com", "cdn.shopify.com", "cloudflare.com", "google-analytics.com",
  "googletagmanager.com", "facebook.com", "fb.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "youtube.com", "vimeo.com",
  "mailto", "sentry.wixpress.com",
];
const BAD_EMAIL_LOCAL = ["you@", "your@", "name@", "example@", "test@", "noreply@"];
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)(\?|$)/i;

export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  const matches = text.matchAll(EMAIL_RE);
  for (const m of matches) {
    const e = m[0].toLowerCase().replace(/\.$/, "");
    if (IMAGE_EXT.test(e)) continue;
    if (BAD_EMAIL_LOCAL.some((p) => e.startsWith(p))) continue;
    const host = e.split("@")[1] ?? "";
    if (!host.includes(".")) continue;
    if (BAD_EMAIL_HOSTS.some((h) => host === h || host.endsWith("." + h))) continue;
    // Reject versioned sentry hosts like o12345.ingest.sentry.io
    if (/sentry/i.test(host)) continue;
    // Reject obvious tracking / analytics
    if (/(^|\.)cdn\./.test(host)) continue;
    out.add(e);
  }
  return [...out];
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  // Match probable UK phone patterns (loose match, then normalise)
  const re = /(\+?44\s?\d[\d\s().\-]{7,20}|\b0\d[\d\s().\-]{7,20})/g;
  const matches = text.match(re) ?? [];
  for (const m of matches) {
    const n = normalisePhone(m);
    if (n) out.add(n);
  }
  return [...out];
}

export function isCommonFormFrontDeskEmail(e: string): boolean {
  const l = e.split("@")[0];
  return ["info", "enquiries", "enquiry", "reception", "admin", "hello", "bookings", "appointments", "contact"]
    .includes(l);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLng = deg2rad(b.lng - a.lng);
  const la1 = deg2rad(a.lat), la2 = deg2rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function deg2rad(d: number): number { return d * Math.PI / 180; }

export function domainOf(u: string | undefined): string {
  if (!u) return "";
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h.replace(/^www\./, "");
  } catch { return ""; }
}

export function sameSiteUrl(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    const b = new URL(base);
    if (u.host.toLowerCase().replace(/^www\./, "") !== b.host.toLowerCase().replace(/^www\./, "")) return null;
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch { return null; }
}
