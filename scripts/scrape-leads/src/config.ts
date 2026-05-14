import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = resolve(__dirname, "..", "..", "..");

function loadDotenv(): void {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  const txt = readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, rawV] = m;
    const v = rawV.replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv();

const SCRAPE_LEADS_DIR = resolve(ROOT, "scripts", "scrape-leads");

export const CONFIG = {
  contactEmail: process.env.CONTACT_EMAIL ?? "contact@example.com",
  googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  companiesHouseKey: process.env.COMPANIES_HOUSE_API_KEY ?? "",
  targetLeads: Number(process.env.TARGET_LEADS ?? 200),
  concurrency: Math.min(6, Number(process.env.SCRAPE_CONCURRENCY ?? 6)),
  smoke: process.env.SMOKE === "1",
  // Strict drop policy: ignore TARGET_LEADS, ship only Invisalign-strong
  // rows with verifiable owner contact (or active hiring signal).
  qualityMode: process.env.QUALITY_MODE === "1",
  userAgent: `PulseLeadBot/1.0 (contact: ${process.env.CONTACT_EMAIL ?? "contact@example.com"})`,
  maxBytes: 2.5 * 1024 * 1024,
  minDelayMsPerDomain: 300,
  httpTimeoutMs: 12_000,
  siteCrawlTimeoutMs: 90_000,
  birminghamCentre: { lat: 52.4862, lng: -1.8904 },

  // Apollo (Search = free, Enrichment = credits)
  apolloKey: process.env.APOLLO_API_KEY ?? "",
  apolloCalibrationSampleSize: Number(process.env.APOLLO_CALIBRATION_SAMPLE_SIZE ?? 10),

  // Google Drive
  gdriveUpload: process.env.GDRIVE_UPLOAD === "1",
  gdriveFolderId: process.env.GDRIVE_FOLDER_ID ?? "",
  // Service account JSON (preferred for CI / headless). When set, auth
  // uses JWT instead of OAuth Desktop — no browser prompt.
  gdriveServiceAccountJson: process.env.GDRIVE_SERVICE_ACCOUNT_JSON ?? "",
  // OAuth Desktop fallback for local interactive auth.
  gdriveCredentialsPath:
    process.env.GDRIVE_CREDENTIALS_PATH ||
    resolve(SCRAPE_LEADS_DIR, ".gdrive", "credentials.json"),
  gdriveTokenPath:
    process.env.GDRIVE_TOKEN_PATH ||
    resolve(SCRAPE_LEADS_DIR, ".gdrive", "token.json"),
};

export const LOCALITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
  { name: "Solihull", lat: 52.4128, lng: -1.7783 },
  { name: "Sutton Coldfield", lat: 52.5702, lng: -1.8242 },
  { name: "Wolverhampton", lat: 52.5870, lng: -2.1288 },
  { name: "Walsall", lat: 52.5862, lng: -1.9820 },
  { name: "Dudley", lat: 52.5120, lng: -2.0810 },
  { name: "West Bromwich", lat: 52.5186, lng: -1.9945 },
  { name: "Coventry", lat: 52.4068, lng: -1.5197 },
  { name: "Halesowen", lat: 52.4500, lng: -2.0500 },
  { name: "Stourbridge", lat: 52.4580, lng: -2.1486 },
  { name: "Kidderminster", lat: 52.3880, lng: -2.2498 },
  { name: "Redditch", lat: 52.3064, lng: -1.9445 },
  { name: "Bromsgrove", lat: 52.3370, lng: -2.0566 },
  { name: "Tamworth", lat: 52.6333, lng: -1.6957 },
  { name: "Lichfield", lat: 52.6818, lng: -1.8287 },
  { name: "Leamington Spa", lat: 52.2852, lng: -1.5336 },
  { name: "Warwick", lat: 52.2823, lng: -1.5849 },
  { name: "Kenilworth", lat: 52.3470, lng: -1.5716 },
  { name: "Nuneaton", lat: 52.5233, lng: -1.4649 },
  { name: "Rugby", lat: 52.3705, lng: -1.2627 },
];

export const OVERPASS_BBOX = { south: 52.15, west: -2.45, north: 52.78, east: -1.30 };

export const CRAWL_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/contact.html",
  "/about",
  "/about-us",
  "/team",
  "/meet-the-team",
  "/our-team",
  "/meet-our-team",
  "/invisalign",
  "/treatments/invisalign",
  "/services/invisalign",
];
