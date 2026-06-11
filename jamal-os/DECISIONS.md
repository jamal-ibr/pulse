# DECISIONS.md - Jamal OS

Decisions made during the build, with trade-offs and upgrade paths.
Nothing here is hidden in chat history; this is the record.

## Repository placement

The repo root already contains Jamal's Astro portfolio site
(pulsewebsite). Jamal OS lives in `jamal-os/` instead of replacing it.
`npm run dev` runs from inside `jamal-os/`. Trade-off: one extra `cd`.
Upgrade path: move to its own repository when convenient; the folder is
fully self-contained.

## Stack choices

- Next.js 15 App Router with server components and server actions: no
  separate API layer needed for a single-user local app
- Tailwind CSS v4 via `@tailwindcss/postcss` with theme tokens in
  `globals.css`: no tailwind.config.js needed
- Custom lightweight component set instead of shadcn/ui: the app needs
  about ten primitives; pulling the full shadcn toolchain was not worth
  the dependency weight. The component structure (`src/components/ui.tsx`)
  is shadcn-like and easy to swap later
- System font stack instead of a downloaded webfont: keeps the build
  fully offline-capable

## Database

- One `habit_logs` row per day with one column per metric, rather than a
  generic habit/value EAV table: makes sub-30-second logging and
  compliance queries trivial. Trade-off: adding a new habit means a
  migration. Acceptable for a personal system
- Dates stored as ISO text, timestamps as ISO text with SQLite defaults:
  simple, sortable, timezone-naive by design for a single-user local app
- `training_sessions` also gets a row when training is logged via the
  daily habit form, keeping the fitness page consistent

## Outreach counting

"Outreach sent this week" counts `pipeline_events` rows with event
`outreach_sent`. Moving a card from identified to contacted records one
automatically; the "Log outreach" button records follow-up sends. This
keeps the primary metric honest without a separate logging screen.

## Level system calibration

- Pillar scores derive from a 28-day evidence window: compliance rate
  scaled to a max of 70, plus a consistency bonus of up to 20 earned
  over 8+ weeks, all multiplied by data completeness. Perfect compliance
  with thin history lands in the 60s at best
- Career has no logging source yet, so it is scored on capped thin
  evidence with an explicit note. Upgrade path: count EY/BPP project
  activity once it accumulates
- Overall level is a weighted composite where missing pillars contribute
  zero to the numerator but full weight to the denominator
- Snapshot gains are capped at +3 per snapshot (`dampenLevelJump`)
- Score 100 is reserved and unreachable; `clampScore` caps at 99

## Weekly review pillar scores

Out-of-10 scores are computed in code from the week's logs with the
denominator fixed at 7 days, so unlogged days lower the score. The AI
receives these as facts and may not change them.

## Prayer times

Static Birmingham monthly timetable in `src/lib/prayer-times.ts`
(approximate mid-month values, UK clock time). A live package was not
worth a network dependency for the MVP. Upgrade path: the `adhan` npm
package computes precise times offline from coordinates; swap
`getBirminghamPrayerTimes` internals without changing callers.

## Email and calendar connectors

Mock-first. The Gmail provider scaffold throws with a clear message and
bakes the read-only scope into the file. The Google Calendar scaffold
does the same. OAuth token encryption is specified
(LOCAL_ENCRYPTION_KEY) but not implemented because no tokens exist yet.
Apple Calendar .ics import is documented as a planned upgrade
(docs/roadmap.md), not implemented.

## AI mock provider

Deterministic string templates keyed by prompt name, extracting a few
facts from the structured input. Honest about being mock output in every
response. This keeps every AI-touching feature testable and usable
offline.

## Redaction

Regex-based masking, deliberately over-broad (for example, the NI number
pattern accepts invalid prefix letters): for outbound redaction, false
positives are safer than false negatives. Sensitive email bodies are
withheld entirely rather than masked.

## CSV import

Hand-rolled RFC-4180-ish parser (quotes, escaped quotes, CRLF) rather
than a dependency; about 60 lines and unit-tested. Header detection
covers Monzo and common UK bank exports; unknown headers produce a clear
error instead of bad rows.

## Command bar and quick add

The spec's global command bar and quick-add button were simplified to
fast per-page forms plus the mobile bottom nav. A true command palette is
listed in the roadmap. Trade-off accepted to keep the MVP focused; every
logging flow is still under 30 seconds.

## Simplified or deferred

- `/journal` exists as a table and seed but has no dedicated page yet;
  journal entries surface nowhere in the UI. Roadmap item
- `notes`, `body_metrics`, `finance_goals` tables exist with minimal or
  no UI; schema-first so future sessions need no migrations
- Email triage categories are stored on seed and computed via keyword
  rules for new mail; AI categorisation is a roadmap item
- `jamal-os/.claude/settings.json` allows the npm/db commands, denies
  reads of `.env.local` and the database, and adds one safe Stop hook
  (a test/build reminder echo). No destructive hooks. It applies when a
  Claude Code session runs inside `jamal-os/`; the repo root settings
  are untouched because the repo is shared with the portfolio site

## Lint command

`npm run lint` maps to `next lint`, which requires an interactive ESLint
setup on first run and was not configured in this session. Type safety is
enforced by `npm run build` (full type-check) and correctness by
`npm test`. Upgrade path: add `eslint` and `eslint-config-next` to
devDependencies with a flat config, then lint runs non-interactively.

## Known limitations

- Single user, no auth, local machine only (by design)
- Streak calculations look back 7 days only
- The dev server and any LAN device can reach the app; do not run it on
  untrusted networks with sensitive data loaded
- Mock AI output is intentionally generic; the system's edge comes from
  the coded rules, which never depend on the AI

## HUD restyle and PWA (June 2026)

- The UI was rethemed to a JARVIS-inspired HUD on request: deep navy
  black with cyan instrumentation, defined entirely through the OKLCH
  tokens in `src/app/globals.css`. Pages were untouched except two
  hardcoded emerald values; everything else flows through tokens and
  the shared primitives. DESIGN.md and PRODUCT.md capture the system.
- PWA support: `src/app/manifest.ts`, icons in `public/` (generated by
  `scripts/make-icons.mjs` using `sharp`, which is available as a
  transitive dependency; outputs are committed so the script never
  needs to run again), and a deliberately cache-free service worker.
  No caching because every screen must show live local data; a stale
  cached Daily Brief would violate the truth rule.
- The service worker only registers in production builds. Over plain
  LAN HTTP, Android offers a shortcut rather than a full install
  (secure-context rule); SETUP.md documents the Tailscale Serve route
  for HTTPS.
- `dev:lan` and `start:lan` scripts bind 0.0.0.0 for phone access on
  the same network.

## Simplification and voice agent (June 2026)

- Navigation flattened on request: six primary links (Daily Brief,
  Pulse Pipeline, Tasks, Habits, Planner, Weekly Review) and a
  collapsible More section for the remaining eleven routes. No pages
  were deleted; everything stays reachable.
- Daily Brief reduced to: hard-rule banner, brief, one metrics card,
  Scary tasks, Today. Habit gaps, pipeline attention, overdue list,
  and top project moved off the home screen; the brief text still
  reports overdue counts, and each detail lives on its own page.
- The grid backdrop was removed; only the top bloom remains.
- Voice agent: floating orb in the shell, available on every page.
  Intent parsing and deterministic answers are pure logic in
  src/lib/assistant.ts (tested). Data questions (brief, pipeline,
  avoidance, habits) are answered from SQLite without any AI call.
  "Add a task to X" inserts a real task (pillar Systems, scariness 1).
  Only free-form chat reaches the AI provider, through the existing
  redaction and logging path with the voice-assistant prompt.
- Speech uses the browser Web Speech API: SpeechRecognition for input
  (Chrome sends audio to Google's recognition service; Safari is
  mostly on-device; the agent degrades to text input where the API is
  missing) and speechSynthesis for spoken replies, which can be muted.
  No audio is stored and nothing new leaves the machine beyond what
  the chosen recognition engine does.
