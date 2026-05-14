# Handoff — Invisalign lead scraper

**Status:** shipped. 200 verified leads produced on 2026-04-17. Branch `leads/invisalign-birmingham`, 4 commits, not pushed.

## What this does

End-to-end pipeline that produces real, verified cold-outreach leads for Pulse's AI-receptionist sales motion. Target: UK dental / orthodontic practices in Birmingham and the West Midlands whose own website mentions **Invisalign**. Every cell in every CSV row is traceable to a `source_url` that was actually fetched.

## Run it

```bash
cd "/Users/jamalibrahim/Desktop/Lead Scraping"
npm install                    # one-time
npm run scrape:leads:smoke     # 20-lead smoke test (~2 min)
npm run scrape:leads           # full run, TARGET_LEADS default 200 (~30 min)
npm run scrape:leads:verify    # Phase 8 re-fetch sanity check (uses latest run)
```

Env in `.env` (gitignored):
```
GOOGLE_PLACES_API_KEY=...
COMPANIES_HOUSE_API_KEY=...
CONTACT_EMAIL=jamal.ibrx@gmail.com
TARGET_LEADS=200
SCRAPE_CONCURRENCY=6
```

## Last run

- CSV: [data/leads-full-2026-04-17T17-13-09-569Z.csv](data/leads-full-2026-04-17T17-13-09-569Z.csv) — 200 rows, 208 KB.
- 1,331 raw → 545 deduped → 341 crawled → 219 passed filter → 200 final.
- Phase 8 verify: 9/10 re-fetch checks PASS.

## Pipeline (8 phases)

See [scripts/scrape-leads/README.md](scripts/scrape-leads/README.md) for full detail. Quick map:

1. **Discovery** — Google Places (requires Places API (New) *enabled* on the GCP project), OSM Overpass, Three Best Rated. NHS is a polite skip (CSRF POST form). Yell is blocked.
2. **Dedupe** — name + outcode, domain, <150 m coord match.
3. **Crawl** — same-origin BFS, max 8 pages, robots.txt respected, 300 ms per-domain gap, 2.5 MB cap, hard 120 s per-site wall-clock.
4. **Filter** — must have UK phone/email AND Invisalign mention on own site.
5. **Companies House** — fills `owner_name` from active directors when site doesn't reveal an owner.
6. **Score** — `popularity × proximity × invisalign` (formula in README).
7. **Widen** — if < target: relax Invisalign → Places desc/reviews, add query variants, expand bbox +10 km, add adjacent towns.
8. **Verify** — re-fetch one source URL for 10 random final rows; report pass/fail.

## Known tech debt

- `verify.ts` picks ONE source URL per row and checks all fields against it. Emails often live on `/contact` while phone lives on the homepage — so clean rows can log "email✗" spuriously. Fix: check each field against its own `*_source_url`. Small change in [scripts/scrape-leads/src/verify.ts](scripts/scrape-leads/src/verify.ts).
- One site in the last run hit the 120 s per-site hard timeout. If multiple sites start doing this, investigate the HTTP stream timeout path in [scripts/scrape-leads/src/utils/http.ts](scripts/scrape-leads/src/utils/http.ts).
- NHS "Find a dentist" is currently a skip. If you want NHS coverage, the only clean path is a headless browser — that's an explicit dep bump and off the original minimal-deps preference.
- Yell stays blocked. Don't try to evade.

## Before any outreach — compliance

Re-read the Compliance section in [scripts/scrape-leads/README.md](scripts/scrape-leads/README.md). Non-negotiables:

- **TPS / CTPS screening** on every number before calling (PECR).
- **Document an LIA** per batch (UK GDPR, legitimate interest).
- **Sole traders & partnerships** get treated as individuals — personal-capacity email addresses need prior consent.
- **Opt-out in every email**, immediate honouring of objections.

## If you want to extend

- **More geography:** add to `LOCALITIES` and `OVERPASS_BBOX` in [scripts/scrape-leads/src/config.ts](scripts/scrape-leads/src/config.ts).
- **Different ICP (e.g. cosmetic surgery, physio):** the filter logic in `phase4Filter` / `extractOwnerPairs` is the main thing to adjust; most other code is vertical-agnostic.
- **Persist across runs:** add a small JSON cache keyed on `domain` in the `crawlSite` layer so re-runs don't re-fetch unchanged sites.

## Commit history on this branch

```
f9b055d feat(leads): pipeline orchestrator with auto-widening + Phase 8 verify
569378b feat(leads): discovery sources, website crawler, Companies House enrichment
e39cc73 feat(leads): config, types, and core utilities (http/robots, normalise, dedupe, csv)
7e6025a chore(leads): scaffold scrape-leads TS project
```
