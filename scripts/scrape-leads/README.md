# Pulse — Invisalign outreach pipeline (West Midlands)

End-to-end pipeline that finds Invisalign-providing dental / orthodontic
practices in Birmingham + the West Midlands, identifies the **practice
owner**, resolves contact details to the highest verifiable confidence,
flags practices currently **hiring receptionists** (your ideal prospect),
scores each one for client fit, and ships a phone-friendly Google Sheet
you can dial directly from.

---

## What you get

`data/outreach-outreach-full-<timestamp>.csv` — ranked top-200 leads, one
row per practice. Columns:

| Column | Meaning |
|---|---|
| `rank` | 1 = highest fit |
| `practice_name` | The practice |
| `owner_name` / `owner_title` | The decision-maker, where identified |
| `owner_email` + `owner_email_confidence` | Best verified email + how sure we are (`high` / `medium` / `low`) |
| `direct_phone` + `direct_phone_confidence` | Owner direct dial when found on site (rare). `low` means likely-not-direct. |
| `apollo_has_direct_phone` | `Yes` / `Maybe` / `No` / `Unknown` — does Apollo's DB hold a direct dial for this owner? Useful: if `Yes` and you got `(reception only)`, spending 1 credit on Apollo enrichment will retrieve it. |
| `practice_phone` | Main practice number. Will usually reach reception. |
| `hiring_receptionist` | `yes` if Apollo or their careers page shows an active receptionist / front-of-house role |
| `website` / `city` / `postcode` | The basics |
| `invisalign_strength` | `strong` (5+ on-site mentions) / `medium` / `weak` (Places signal only) |
| `fit_score` | 0–10 composite of Invisalign + reachability + hiring + reviews |
| `contact_confidence` | 0–10 how trustworthy this row's contact data is |
| `rating` / `review_count` | From Google Places |
| `notes` | One-line context, e.g. "HIRING receptionist — ideal pain match" |
| `*_source_url` | Provenance for every claim |

If `GDRIVE_UPLOAD=1`, the same data is also uploaded to your Google Drive
as both a CSV and a Google Sheet (one tap on your phone, no formatting work).

---

## Quick start

```bash
npm install                    # one-time, ~1 min
cp .env.example .env           # fill in keys (see below)
npm run scrape:leads:smoke     # 20-lead dry run (~3 min)
npm run scrape:leads           # full 200-lead run (~30–40 min)
npm run leads:drive            # re-upload latest run to Drive (no re-scrape)
npm run leads:calibrate        # spend ~10 Apollo credits to validate quality
```

All output lands in `data/` and `data/latest-outreach.json` always points
at the most recent run.

---

## API keys

```ini
# .env (gitignored)

# Required-ish (without these you'll get a stripped-down run):
GOOGLE_PLACES_API_KEY=...       # Places API (New); enables ratings / reviews
COMPANIES_HOUSE_API_KEY=...     # free; resolves legal owner names
APOLLO_API_KEY=...              # free Search; needed for owner & hiring signals

# Optional:
CONTACT_EMAIL=you@yourdomain.com
TARGET_LEADS=200
GDRIVE_UPLOAD=1                 # push the CSV + Sheet to Drive after each run
GDRIVE_FOLDER_ID=               # paste folder ID from drive.google.com URL
```

### Apollo — free, no credit burn

We call only the **People Search** endpoint, which Apollo documents as not
consuming credits. Two calls per practice:
1. `searchOwners(domain)` — finds owner/principal/director-level people at
   the practice. Gives us name + title + the `has_direct_phone` boolean.
2. `checkHiringReceptionist(domain)` — uses Apollo's
   `q_organization_job_titles` filter, which only matches people whose
   employer is currently advertising for that role.

Rate-limited internally to ~550 req/hr (under Apollo's 600/hr cap). For 200
leads × 2 calls = ~400 requests ≈ 45 min.

When Apollo says `has_direct_phone: "Yes"` but we couldn't scrape one,
you're seeing the value of Apollo's proprietary data — spending 1 credit
via `npm run leads:calibrate` (or doing it manually for high-priority leads)
will reveal that number.

### Google Drive — OAuth Desktop

One-off setup:
1. <https://console.cloud.google.com> → create or pick a project.
2. APIs & Services → Library → enable **Google Drive API**.
3. APIs & Services → OAuth consent screen → set up External, add your
   Google email as a test user.
4. APIs & Services → Credentials → Create credentials → OAuth client ID
   → Application type: **Desktop app**.
5. Download the JSON. Save it to
   `scripts/scrape-leads/.gdrive/credentials.json` (already gitignored).
6. Set `GDRIVE_UPLOAD=1` in `.env` and run the pipeline. First run prints an
   auth URL — visit it, approve, paste the code back into the terminal. The
   refresh token is cached to `scripts/scrape-leads/.gdrive/token.json` for
   future runs.

The app uses the `drive.file` scope, so it can only touch files it creates.
It cannot read the rest of your Drive.

---

## How the pipeline works

```
        ┌─── Google Places ───┐
 raw ───┤    OSM Overpass    ├──── dedupe ─── crawl ─── filter
        │   NHS / Yell / TBR │         (clusters)  (homepage +     (must have
        └──────────────────────┘                       /contact /team    Invisalign +
                                                       /invisalign       1 contact)
                                                       … + robots.txt)
                                                                            │
                                                                            ▼
                                            Companies House director match
                                                                            │
                                                                            ▼
                                              Apollo People Search (FREE)
                                                  └ owner identity
                                                  └ has_direct_phone flag
                                                                            │
                                                                            ▼
                                              Apollo hiring filter (FREE)
                                                  └ receptionist?
                                                                            │
                                                                            ▼
                                              Homegrown enrichment
                                                  └ email pattern + MX
                                                  └ scrape-name-match
                                                  └ phone near owner
                                                                            │
                                                                            ▼
                                              DROP if no owner email AND
                                              no direct phone AND Apollo
                                              doesn't confirm direct dial
                                                                            │
                                                                            ▼
                                              fit_score + contact_confidence
                                                                            │
                                                                            ▼
                                              slim CSV + Google Sheet upload
```

### fit_score (0–10)

- Invisalign provider (ICP fit): up to **3** (`strong` = 3, `medium` = 2)
- Owner reachable: up to **3** (both email + phone good = 3)
- Currently hiring receptionist: **2** (this is your direct ICP pain)
- Social proof / budget: up to **2** (4.5+ rating with 100+ reviews)

### contact_confidence (0–10)

- Owner name known: **2**
- Email confidence: 4 / 2 / 1 (high / medium / low)
- Direct phone confidence: 3 / 2 / 0 (or +1 if Apollo confirms direct dial exists)
- Practice phone available: **1**

---

## The owner-phone reality (read before complaining about "reception phones")

Apollo's direct dials come from a proprietary dataset built from LinkedIn,
business cards, public records, and various B2B sources we cannot legally
or cheaply replicate. **For small UK dental practices, the number listed on
the website is reception in 95%+ of cases** — owners don't publish their
mobile.

What we do instead:
- Find a phone published *adjacent to the owner's name* on /about or /team
  pages, and label it `direct_phone_confidence: low` (it might be a direct
  line, often is not).
- Show Apollo's `has_direct_phone` flag. When it says `Yes`, Apollo has a
  real direct dial in their DB — you can spend 1 credit (via the calibration
  script or manually) to retrieve it for high-priority leads.
- For owner *emails*, homegrown does much better: name-match scraping +
  pattern guess + MX verification gives `medium` confidence in most cases,
  `high` when the email is visible on the team page.

Use `npm run leads:calibrate` to see how close our homegrown emails are to
Apollo's verified ones. A typical run gets 60–75% exact-match on emails for
practices with team-page bios; mostly `close-match` (same domain, slightly
different local part) otherwise.

---

## Calibration mode

Validates our homegrown email/phone work against Apollo's paid enrichment.

```bash
export APOLLO_CALIBRATION_SAMPLE_SIZE=10   # default
npm run leads:calibrate
# → data/calibration-<stamp>.csv with homegrown vs Apollo side-by-side
# → console summary: how many exact / close-match / miss
```

Budget: **N Apollo credits per run** (default 10). Skip it once you trust
the pipeline.

---

## Compliance — read before any outreach

Non-negotiable for UK B2B outreach:
- **TPS / CTPS screening** on every number before calling (PECR).
- **Document an LIA** (Legitimate Interests Assessment) per outreach batch (UK GDPR).
- **Sole traders & partnerships** are treated as individuals — personal-capacity
  email/phone needs prior consent.
- **Opt-out in every email**, immediate honouring of objections.
- We respect `robots.txt` everywhere, identify ourselves in the User-Agent,
  and rate-limit per domain.

---

## Commands reference

| Command | What it does |
|---|---|
| `npm run scrape:leads:smoke` | 20-lead dry run for quick checks (~3 min) |
| `npm run scrape:leads` | Full pipeline — target 200 outreach-ready leads (~30–40 min) |
| `npm run scrape:leads:raw` | Old raw discovery+crawl CSV (no Apollo, no Drive) |
| `npm run scrape:leads:verify` | Phase 8 re-fetch sanity check on latest raw run |
| `npm run leads:calibrate` | Apollo Enrichment compare vs homegrown (burns credits) |
| `npm run leads:drive` | Re-upload the latest outreach CSV+Sheet to Drive |

---

## Extending

- **More geography:** add to `LOCALITIES` and widen `OVERPASS_BBOX` in `src/config.ts`.
- **Different ICP** (cosmetic surgery, physio, vet clinics): tweak the
  `person_titles` array in `src/sources/apollo.ts` and the hiring keywords
  in `src/scraper/hiring.ts`; the rest is vertical-agnostic.
- **Tighter drop policy:** in `src/outreach.ts` Phase 9, remove the
  `apolloConfirmsDirect` clause to require an actual scraped contact channel.
