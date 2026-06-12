# Architecture

## System overview

Jamal OS is a single Next.js application backed by a local SQLite file.
There is no separate backend, no cloud database, and no auth provider.
Pages are server components that read from SQLite through a service
layer; mutations are server actions co-located with each route.

```
Browser (dark, mobile-first UI)
   |
Next.js App Router (server components + server actions)
   |
Service layer (src/lib/services/*)        Pure logic (src/lib/*)
   |                                        - targets, avoidance, level
Drizzle ORM + better-sqlite3                - csv, redact, spending, task
   |                                        - unit-tested in /tests
SQLite at data/jamal-os.db
```

## Data flow

1. A page (server component) calls a service
2. The service queries Drizzle and runs pure logic over the rows
3. Hard rules (Pulse outreach rule, avoidance flags, level damping) are
   computed in code, never delegated to AI
4. If a feature needs AI, the service builds a structured facts string,
   passes it through redaction, and calls the provider abstraction
5. Server actions validate input with Zod, write via Drizzle, append to
   audit_logs where relevant, and revalidate affected paths

## Connectors

All connectors are opt-in, read-only, and implemented:

- Gmail (`src/lib/email/gmail-readonly-provider.ts` + `gmail-mapper.ts`):
  gmail.readonly scope only; Sync pulls unread snippets into
  `email_messages`, deduped by message id
- Google Calendar (`src/lib/calendar/google-provider.ts` + mapper):
  calendar.readonly scope; Sync upserts the past 7 and next 60 days
  into `calendar_events` by event id
- Monzo (`src/lib/monzo.ts`): official personal API, GET-only; Sync
  maps transactions into `spending` (pounds, category map, dedupe by
  transaction id)
- Apple Health / Garmin: the phone pushes Health Auto Export JSON to
  `POST /api/health/ingest` (bearer token, constant-time compared,
  512KB cap); parsing in `src/lib/health-ingest.ts` upserts
  weight_logs, sleep_logs, and the generic health_metrics table

OAuth plumbing: routes under `src/app/api/oauth/<provider>/` use a
state cookie CSRF check; tokens are AES-256-GCM encrypted
(`src/lib/crypto.ts`, key from LOCAL_ENCRYPTION_KEY) and stored in
`connector_accounts.encrypted_token` with per-provider refresh in
`src/lib/services/connectors.ts`. Mock providers still serve every
feature when nothing is connected.

## Service layer

- settings, pipeline, habits, daily-brief, weekly-review, level,
  planner, build-queue under `src/lib/services/`
- Smaller domains (tasks, spending, contacts, reading, memory, email,
  calendar) keep their logic in route server actions plus the pure-logic
  modules, because each is a thin CRUD layer over one or two tables

## Database

Schema in `src/db/schema.ts` (single file, grouped by domain), generated
SQL migrations in `/drizzle`, applied by `scripts/migrate.ts`. The seed
script (`scripts/seed.ts`) is idempotent and dates everything relative
to today.

## AI flow

```
facts (structured, code-built)
  -> redact()                      src/lib/redact.ts
  -> provider                      src/lib/ai/provider.ts
       Anthropic (if key)  --or--  deterministic mock
  -> ai_interactions row logged (provider, input summary, output)
```

Prompt templates are plain text files in `/prompts`, loaded at call
time, freely editable without code changes.

## Voice agent

The orb in the shell (`src/components/voice-agent.tsx`) uses the
browser Web Speech API for input and speech synthesis for replies.
Intent parsing and deterministic answers are pure logic in
`src/lib/assistant.ts` (tested); the server action
(`src/app/assistant/actions.ts`) answers data questions straight from
SQLite, inserts tasks for "add a task to ...", and only sends
free-form chat to the AI provider through the redaction path.

## PWA shell

`src/app/manifest.ts` plus icons in `/public` make the app
installable; `public/sw.js` is a deliberately cache-free service
worker (stale data would violate the truth rule), registered in
production only. `dev:lan` / `start:lan` bind 0.0.0.0 for phone
access. Security headers (frame deny, nosniff, no-referrer) are set
in `next.config.ts`.

## Redaction flow

Every outbound AI call is redacted. Patterns cover card numbers, NI
numbers, API keys (Anthropic, generic sk-, AWS), bearer and OAuth
tokens, private key blocks, and password-style assignments. Sensitive
email bodies and sensitive memory items are withheld entirely.

## Permission model

- `permission_rules` table is the registry shown in Settings
- Gmail and Google Calendar: read-only scopes only, no send or write,
  ever; Monzo: GET endpoints only
- Calendar external writes: allowed only behind an explicit
  confirmation click; nothing implemented writes externally today
- `audit_logs` records seeds, imports, local calendar writes, generated
  build prompts, and memory deletions, with `is_external_write` and
  `confirmed` flags

## Tool runner design (build queue)

Build queue ideas generate a scoped Claude Code prompt
(`generated-prompts/<slug>.md`) and a spawn script
(`scripts/spawn-<slug>.sh`). The script creates a sibling directory and
starts the Claude Code CLI with the prompt, or prints install
instructions if the CLI is missing. Scripts are never executed by the
app; the user runs them manually. Guardrails: ideas added after 22:30
are flagged, and a pipeline under 5 contacted practices shows a
"build queue is secondary" warning.
