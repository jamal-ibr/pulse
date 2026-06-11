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

- `src/lib/email/`: `types.ts` defines `EmailProvider`;
  `mock-provider.ts` reads the seeded inbox; `gmail-readonly-provider.ts`
  is a scaffold hard-coded to the gmail.readonly scope
- `src/lib/calendar/`: same pattern; local events are first-class rows
  in `calendar_events` with `source_provider` and `write_status`
- All connectors are opt-in and start in mock mode
  (`connector_accounts.mode`)

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

## Redaction flow

Every outbound AI call is redacted. Patterns cover card numbers, NI
numbers, API keys (Anthropic, generic sk-, AWS), bearer and OAuth
tokens, private key blocks, and password-style assignments. Sensitive
email bodies and sensitive memory items are withheld entirely.

## Permission model

- `permission_rules` table is the registry shown in Settings
- Gmail: read-only scope only, no send, ever
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
