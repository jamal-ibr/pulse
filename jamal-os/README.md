# Jamal OS

Your private operating system for discipline, strategy, and becoming.

A local-first personal operating system: executive assistant, chief of
staff, accountability system, life strategist, private memory layer, and
tool-building command centre. It surfaces what you are avoiding and
protects execution on the highest-leverage work.

## Quickstart (2 minutes)

```bash
cd jamal-os
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. Everything works offline with seeded data and
the mock AI provider. No API keys, no Docker, no cloud database, no auth
provider.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run db:generate` | Generate migrations from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Wipe and re-seed all data |
| `npm run db:reset` | Delete DB, migrate, seed fresh |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Folder structure

```
jamal-os/
  src/app/            Pages and server actions (one folder per route)
  src/components/     Shared UI (shell, cards, copy button)
  src/db/             Drizzle schema and SQLite client
  src/lib/            Pure business logic (tested)
  src/lib/services/   Service layer (DB queries + aggregation)
  src/lib/ai/         AI provider abstraction (Anthropic + mock)
  src/lib/email/      Email connector abstraction (mock + Gmail scaffold)
  src/lib/calendar/   Calendar connector abstraction
  prompts/            Editable AI prompt templates
  tests/              Vitest unit tests
  scripts/            Seed, migrate, generated spawn scripts
  generated-prompts/  Claude Code prompts from the build queue
  context/            profile.md, the system's core local context
  docs/               Architecture, privacy, roadmap
  data/               SQLite database (gitignored)
```

## What works offline (everything)

- Daily Brief with the coded Pulse hard rule and mock AI
- Habit, sleep, weight, and fitness logging with streaks and compliance
- Tasks with required scariness, defer tracking, avoidance flags
- Projects with next actions and stall detection
- Pulse AI pipeline Kanban with outreach metrics
- Spending with CSV import and the rolling 30-day takeaway count
- Email triage, deadline detection, and local reply drafts (mock inbox)
- Calendar agenda and local events, day planner with prayer times
- Weekly review with code-computed avoidance flags
- Conservative level system
- Contacts CRM, reading tracker, memory system, build queue

## What is mocked or scaffolded

- AI output uses the deterministic mock provider unless
  `ANTHROPIC_API_KEY` is set in `.env.local`
- The inbox and some calendar events are seeded mock data
- Gmail (read-only) and Google Calendar providers are scaffolds: clean
  interfaces and documented setup, no OAuth flow implemented yet
- Prayer times use a static Birmingham monthly timetable

## How to reset seed data

```bash
npm run db:reset
```

## How to use the app

1. Start the day on the Daily Brief. If the Pulse pipeline has fewer
   than 5 contacted practices, outreach opens the brief. Do it first.
2. Use Plan my day to block time around salah anchors.
3. Log the full day on Habits in under 30 seconds, ideally at night.
4. Move pipeline cards and log every outreach send on Pipeline.
5. Run the Weekly Review on Sunday. Read the avoidance flags. Commit to
   one sentence for next week.
6. Capture tool ideas in the Build Queue instead of starting them at
   23:00.

See SETUP.md for API keys and connector setup, docs/privacy.md for the
privacy model, and DECISIONS.md for trade-offs.
