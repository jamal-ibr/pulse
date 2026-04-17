# Pulse Lead Scraper — Invisalign / West Midlands

Produces verified, traceable cold-outreach leads: dental and orthodontic practices in Birmingham and the wider West Midlands whose own website mentions Invisalign. Every row is traceable to a `source_url` the scraper actually fetched.

## Run

```
npm install
cp .env.example .env   # fill in keys
npm run scrape:leads:smoke    # 20-lead smoke test
npm run scrape:leads          # full run (TARGET_LEADS, default 200)
npm run scrape:leads:verify   # re-fetch 10 random rows and confirm
```

Outputs `data/leads-{smoke|full}-{timestamp}.csv` and a matching `.json`.

## Environment

- `GOOGLE_PLACES_API_KEY` — Places API (New) Text Search.
- `COMPANIES_HOUSE_API_KEY` — Companies House REST API.
- `CONTACT_EMAIL` — goes into `User-Agent` so admins can reach you.
- `TARGET_LEADS` (default 200), `SCRAPE_CONCURRENCY` (default 6, capped at 6).

## Sources

- Google Places API (New) Text Search across ~20 West Midlands localities × Invisalign query variants.
- OpenStreetMap via Overpass API (`healthcare=dentist|orthodontist`) inside the configured bbox.
- NHS "Find a dentist" public directory (postcode sweep).
- Yell.com business listings (robots-respecting; skipped if blocked).
- Three Best Rated UK city pages.

## Pipeline phases

1. **Discovery** — pull raw practice records from every enabled source.
2. **Dedupe** — cluster on normalised name + outcode, domain match, and <150 m coordinate match.
3. **Website crawl** — same-origin BFS on `/`, `/contact*`, `/about*`, `/team*`, `/meet-the-team*`, `/invisalign*` (max 8 pages per site, 2.5 MB cap, robots-respected, ≥300 ms per-domain gap).
4. **Filter** — drop rows with no UK phone/email or no Invisalign mention on their own site.
5. **Enrich** — Companies House officers lookup on top candidates to fill `owner_name` where the site didn't reveal one.
6. **Score** — `popularity × proximity × invisalign`.
7. **Widen (automatic)** — if < target, relax Invisalign rule to include Places description/reviews, add query variants, expand bbox +10 km, add adjacent towns.
8. **Verify** — re-fetch one source URL for 10 random final rows and confirm phone/email/owner still appears.

## Scoring

```
popularity = rating × log10(review_count + 10)        # rating defaults to 3.5 if unknown
proximity  = 10 / (1 + km_from_birmingham_centre)
invisalign = 1 + min(invisalign_mentions, 20) / 20
total      = popularity × proximity × invisalign
```

## Absolute rules

1. No invented leads. Every cell is traceable to `source_url`.
2. Every row must have a valid UK phone *or* a non-dummy email *and* at least one Invisalign mention on the practice's own site (relaxed only in widening, and flagged as such).
3. UK phones are normalised and must start with 01/02/03/07, 11 digits.
4. Emails exclude sentry/wix/cdn hosts, image extensions, placeholders, and `you@`/`your@`/`noreply@` locals.
5. Polite crawling: `User-Agent: PulseLeadBot/1.0 (contact: <CONTACT_EMAIL>)`; ≤6 global concurrent requests; ≥300 ms between sequential requests to the same domain; 2.5 MB response cap; robots.txt respected.
6. No bypassing anti-scraping walls. Blocked sources are logged and skipped.

## Compliance (UK marketing law)

**Read before any outreach.** Scraping publicly available B2B contact details is lawful; using them for marketing is separately regulated.

- **PECR (telephone)** — screen **every** phone number against **TPS / CTPS** before calling. TPS/CTPS registration is legally binding; calling a registered number risks ICO enforcement. Limited companies registered on CTPS must not be called for marketing even with "legitimate interest".
- **UK GDPR** — your lawful basis is *legitimate interest*. You must document a **Legitimate Interests Assessment (LIA)** per practice batch (purpose, necessity, balancing test) *before* contacting. Keep the LIA on file.
- **Sole traders and partnerships are treated as individuals** for marketing purposes, not as corporate entities. Stricter rules apply: unsolicited marketing emails to personal-capacity addresses require prior consent (soft opt-in at a minimum). If a practice is not a limited company, treat the owner's email as personal and be much more cautious.
- **Email (B2B)** — a corporate email (`@practice.co.uk`) to a limited company is allowed under legitimate interest with an opt-out in every message. Personal `@gmail.com` addresses shift the risk materially — prefer the corporate address or skip.
- **Right to object / erase** — honour unsubscribe and data-removal requests immediately; record them.
- **Every outreach email must carry an unambiguous opt-out** (e.g. "reply STOP" or a one-click unsubscribe link) and your identity/registered address.
- **Record of processing** — keep the scraped source URL, timestamp, and retention period per contact; purge after a defined period if no engagement.

None of this is legal advice. If you're unsure about a specific lead, don't contact it — ask a solicitor or the ICO.

## Project layout

```
scripts/scrape-leads/
  src/
    index.ts              # orchestrator (phases 1-7)
    verify.ts             # phase 8
    config.ts             # env, localities, paths
    types.ts
    utils/                # http, logger, normalise, dedupe, csv
    sources/              # google-places, osm, nhs, yell, three-best-rated, companies-house
    scraper/              # site-crawler, score
  tsconfig.json           # standalone (does NOT inherit any root tsconfig)
  dist/                   # tsc output (gitignored)
```

Runs as `tsc → node` (not tsx) to sidestep the tsx + Node 22 path-alias crash noted upstream.
