# Handoff — Invisalign outreach pipeline

**Status:** outreach pipeline shipped on branch `leads/invisalign-birmingham`. The default `npm run scrape:leads` is now the outreach build (Apollo owner search, homegrown email enrichment, hiring detection, slim CSV, optional Google Drive upload).

## URGENT — rotate the Apollo key

A previous Apollo API key was shared in chat and is considered compromised. Go to https://app.apollo.io → Settings → API → revoke and issue a new key. Put the new value in `.env` under `APOLLO_API_KEY=...`. **Never paste a key into chat.**

## What changed

- `npm run scrape:leads` now runs `dist/outreach.js` (the new pipeline).
  The old broad-CSV pipeline is still available as `npm run scrape:leads:raw`.
- New CSV is the *slim outreach* format — owner name, owner email + confidence,
  direct phone + confidence, Apollo direct-dial flag, hiring flag, fit_score
  (0–10), contact_confidence (0–10), provenance URLs at the end. No more
  lat/lng or popularity-distance math in the output.
- Apollo integration is free-by-default (People Search only). Enrichment
  (which costs credits) is gated behind `npm run leads:calibrate`, a tool
  that compares our homegrown owner email/phone against Apollo's verified
  values on a random sample so you can decide if homegrown quality is
  acceptable for your outreach motion.
- Hiring-receptionist detection uses Apollo's `q_organization_job_titles`
  filter natively (no Indeed/LinkedIn scraping). Falls back to a careers-page
  text scan on the practice's own site.
- Google Drive upload via OAuth Desktop client. First run pops a browser
  prompt; thereafter it's headless. The CSV is uploaded twice — raw CSV +
  auto-converted Google Sheet (sticky headers, sortable, phone-friendly).
- DROP policy per user: rows without an owner email AND without a direct
  phone AND where Apollo doesn't confirm a direct dial exists are dropped.
  The bar for being on the call sheet is genuinely high.

## Important honesty

**Owner direct-dial scraping is hard.** Apollo has direct dials because they
aggregate LinkedIn / B2B-broker / business-card data we can't replicate.
For most rows you'll see `direct_phone` empty and `practice_phone` populated,
because that's what the practice website publishes. The compensating signals:
- `apollo_has_direct_phone: Yes` flags rows where Apollo has a number on
  file — those are the leads worth spending 1 credit each on Apollo
  Enrichment for, once you've ranked them.
- `hiring_receptionist: yes` is the strongest "buy" signal in the dataset —
  those practices are literally telling the market they have the pain you solve.
- Owner *email* homegrown does work well (60–75% Apollo-match in early
  testing). Cold email + booked call is a reasonable path even when the
  direct dial isn't free.

## Run it

```bash
cp .env.example .env             # fill in keys
npm install                      # adds googleapis (~100MB)
npm run scrape:leads:smoke       # 20-lead dry run (~3 min)
npm run scrape:leads             # 200-lead full run (~30–40 min)
npm run leads:calibrate          # ~10-credit Apollo accuracy check
npm run leads:drive              # re-upload latest run if you skipped GDRIVE_UPLOAD
```

## Open items / tech debt

- The old `verify.ts` Phase 8 has the false-positive issue from before
  (checks all fields against one source URL). Not yet fixed; only matters
  for the raw pipeline.
- NHS "Find a dentist" is still a polite skip (needs headless browser to
  get past their CSRF flow). Yell still blocks. Three Best Rated, Google
  Places, OSM, Apollo, and direct website scraping are all live.
- Drive uploader is plain CSV → Sheet conversion. Doesn't apply any
  formatting (freeze header, conditional colours by fit_score). Easy add
  via `spreadsheets.batchUpdate` if you want it.
- Calibration script picks random sample from top 50; could be smarter
  (stratified by fit_score) for fewer credits with same statistical power.

## Compliance non-negotiables

TPS/CTPS screening before calls. LIA per batch. Opt-out in every email.
Full details in `scripts/scrape-leads/README.md`.

## Commit history on this branch

```
docs(leads): outreach workflow, Apollo + Drive setup, owner-phone realities
feat(leads): outreach orchestrator + Apollo calibration + Drive upload
feat(leads): Apollo owner search + homegrown enrichment + fit scoring
feat(leads): foundation for outreach pipeline (Apollo, Drive, slim CSV)
f9b055d feat(leads): pipeline orchestrator with auto-widening + Phase 8 verify
569378b feat(leads): discovery sources, website crawler, Companies House enrichment
e39cc73 feat(leads): config, types, and core utilities (http/robots, normalise, dedupe, csv)
7e6025a chore(leads): scaffold scrape-leads TS project
```
