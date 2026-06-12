# SETUP.md - Jamal OS

The app works fully offline with zero configuration. This file covers
optional upgrades.

## Anthropic API key (optional, enables live AI)

1. Get a key at https://console.anthropic.com
2. Copy `.env.example` to `.env.local`
3. Set:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ```
4. Restart `npm run dev`. The Settings page shows the active provider.

Without a key, every AI feature returns deterministic mock output. All
input to the API passes through the redaction layer first
(`src/lib/redact.ts`).

## Gmail connector (read-only)

The Gmail connector is implemented. One-off setup, about 10 minutes:

1. Generate a local encryption key (tokens are encrypted at rest):
   `openssl rand -hex 32`, put it in `.env.local` as
   `LOCAL_ENCRYPTION_KEY=...`
2. Go to https://console.cloud.google.com and create a project
   (name it anything, e.g. "jamal-os")
3. APIs & Services, Library: search "Gmail API" and click Enable
4. APIs & Services, OAuth consent screen: choose External, fill in
   the app name and your email, and under Test users add your own
   Gmail address. You do not need to publish the app; Testing mode is
   fine because you are the only user. (Google expires test-user
   refresh tokens after 7 days of inactivity in Testing mode; if Sync
   stops working, just click Connect Gmail again.)
5. APIs & Services, Credentials: Create Credentials, OAuth client ID,
   type Web application. Under Authorised redirect URIs add exactly:
   `http://localhost:3000/api/oauth/google/callback`
6. Copy the client ID and secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
   ```
7. Restart the app, open the Email page, click "Connect Gmail
   (read-only)", and approve. Then use "Sync Gmail" to pull unread
   messages into triage.

### Gmail scope policy (hard rule)

- The app requests `https://www.googleapis.com/auth/gmail.readonly` ONLY
- Never request send or modify scopes
- Replies are drafted locally and copied manually

## Apple Health and Garmin (automatic, via your iPhone)

Jamal OS has an ingest endpoint at `POST /api/health/ingest`. The
Health Auto Export app pushes your Apple Health data to it on a
schedule; if your Garmin syncs to Apple Health, Garmin data arrives
through the same pipe.

1. Generate a token: `openssl rand -hex 16`, put it in `.env.local` as
   `HEALTH_INGEST_TOKEN=...`, restart the app
2. Install "Health Auto Export - JSON+CSV" on your iPhone
3. In the app, create an Automation of type REST API with:
   - URL: `http://<your-computer-ip>:3000/api/health/ingest`
     (or your Tailscale HTTPS URL, which also works away from home)
   - Headers: `Authorization: Bearer <your token>`
   - Format JSON, aggregation Daily; pick the metrics you care about
     (steps, sleep, heart rate, weight, workouts)
   - Schedule it (e.g. hourly or daily)
4. Tap "Run now" once to test; the app shows "Stored N records"

Weight and sleep flow into the existing Fitness and Habits views;
everything else lands in the `health_metrics` table. Notes: iOS may
delay background automations, and pushes fail silently while the
computer is asleep; the next successful push catches up because each
day's metrics upsert by date.

## Google Calendar connector (read-only)

Uses the same Google Cloud project and credentials as Gmail. Two extra
steps beyond the Gmail setup:

1. In the Google Cloud console, APIs & Services, Library: enable the
   "Google Calendar API" (same project as Gmail)
2. In Jamal OS, open the Calendar page and click "Connect Google
   Calendar (read-only)", then press "Sync Google Calendar"

Sync pulls the past week and next 60 days from your primary calendar
into the local calendar (deduped and refreshed by event id), which
also feeds the Daily Brief and the planner's overcommitment check.

Policy: the app requests `calendar.readonly` only. Nothing is ever
written to Google Calendar; local events stay local. If event push is
ever added, it requires the write scope, an explicit confirmation
click per event, and an audit log entry.

## Monzo connector (read-only)

Live bank feed for the Spending page using Monzo's official
personal-use API. The app only ever reads accounts and transactions.

1. Go to https://developers.monzo.com and sign in with your Monzo
   account (it emails you a magic link)
2. Create a new OAuth client:
   - Redirect URL: `http://localhost:3000/api/oauth/monzo/callback`
   - Confidentiality: Confidential (required for refresh tokens)
3. Copy the client ID and secret into `.env.local`:
   ```
   MONZO_CLIENT_ID=oauth2client_...
   MONZO_CLIENT_SECRET=mnzconf...
   MONZO_REDIRECT_URI=http://localhost:3000/api/oauth/monzo/callback
   ```
4. Make sure `LOCAL_ENCRYPTION_KEY` is set (same key as Gmail)
5. Restart the app, open Spending, click "Connect Monzo (read-only)",
   approve the emailed magic link, then approve the connection inside
   the Monzo app on your phone (Monzo requires this extra step)
6. Press "Sync Monzo". First sync pulls 90 days; after that it
   resumes from the newest stored transaction

Mapping notes: amounts arrive in pennies and are stored in pounds;
"Eating out" maps to the takeaway counter; declined payments, income,
refunds, and internal pot transfers are skipped; duplicates are
prevented by Monzo's transaction id.

## CSV spending import

Use the import on the Spending page. The parser auto-detects columns
from headers and accepts:

- Date columns: `Date`, `Transaction Date`, `Created`
- Amount columns: `Amount`, `Value`, `Debit`, `Money Out`, `Amount (GBP)`
- Optional: `Merchant`/`Name`/`Payee`, `Description`/`Reference`,
  `Category`/`Type`
- Date formats: ISO (`2026-06-01`) and UK (`01/06/2026`)
- Amounts may include `£` signs and commas; negatives are treated as
  spend (Monzo convention)

### Monzo export

Monzo app: Home, search icon, set a date range, Export CSV. The export
has `Date`, `Name`, `Category`, `Amount`, `Description` headers and
imports directly. Monzo categories like "Eating out" map to `takeaway`.

### Typical UK bank exports

Barclays, HSBC, Lloyds, NatWest, Starling exports with
`Date,Description,Amount` style headers import directly. If a bank uses
unusual headers, rename the header row to `Date,Description,Amount`
before importing.

## Use it on your phone

Jamal OS is a PWA. The easiest route is your home Wi-Fi:

1. On your computer, run `npm run dev:lan` (or `npm run build` then
   `npm run start:lan` for the faster production build)
2. Find your computer's local IP address:
   - macOS: System Settings, Wi-Fi, Details
   - Windows: `ipconfig` (look for IPv4 Address)
   - Linux: `hostname -I`
3. On your phone (same Wi-Fi), open `http://<that-ip>:3000`
4. Add it to your home screen:
   - iPhone (Safari): Share button, "Add to Home Screen". It opens
     full screen with the Jamal OS icon, no browser chrome.
   - Android (Chrome): menu, "Add to Home screen"

Notes:

- Your computer must be on and running the server for the phone to
  reach it. The data lives in the SQLite file on the computer, so
  phone and desktop always see the same state.
- Over plain `http://` on a LAN, Android treats the page as insecure
  and gives a shortcut rather than a full install. iPhone gives the
  full-screen app experience either way. For a proper installed app
  everywhere, serve over HTTPS (Tailscale Serve is the simplest:
  `tailscale serve 3000` gives you a private HTTPS URL that works
  away from home too).
- Do not deploy this to a public host without adding authentication.
  Everything in it is private by design.

## Troubleshooting

- "no such table": run `npm run db:migrate` then `npm run db:seed`
- Empty pages: run `npm run db:seed`
- Stale or broken data: `npm run db:reset`
- better-sqlite3 build errors after a Node upgrade:
  `npm rebuild better-sqlite3`
- Port in use: `npm run dev -- -p 3001`
- AI shows "mock" despite a key: confirm the key is in
  `jamal-os/.env.local` (not the repo root) and restart the dev server
