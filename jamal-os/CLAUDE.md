# CLAUDE.md - Jamal OS

## Purpose

Jamal OS is a local-first personal operating system for Jamal: executive
assistant, chief of staff, accountability system, life strategist, private
memory layer, and tool-building command centre. Prime directive: surface
what Jamal is avoiding and protect execution on the highest-leverage work,
especially Pulse AI outreach, health discipline, faith anchors, career
competence, and long-term legacy.

This is not a generic productivity app. It must tell the truth based on
logged data and never flatter.

## Architecture

- Next.js App Router + TypeScript + Tailwind CSS v4
- SQLite at `data/jamal-os.db` via Drizzle ORM + better-sqlite3
- Pure business logic in `src/lib/` (targets, avoidance, level, csv,
  redact, spending-logic, task-logic), services in `src/lib/services/`
- Server actions co-located with pages in `src/app/<route>/actions.ts`
- AI provider abstraction in `src/lib/ai/`: Anthropic when
  ANTHROPIC_API_KEY exists, deterministic mock otherwise
- Editable prompt templates in `/prompts/*.txt`
- Connector abstractions in `src/lib/email/` and `src/lib/calendar/`,
  mock-first; Gmail and Google Calendar are scaffolds
- Voice agent: pure intent logic in `src/lib/assistant.ts`, server
  action in `src/app/assistant/actions.ts`, UI orb in
  `src/components/voice-agent.tsx`, Web Speech API in the browser
- See `docs/architecture.md` for the full picture

## Commands

Run from `jamal-os/`:

- `npm run dev` - start the app (http://localhost:3000)
- `npm run build` - production build (must pass before completion claims)
- `npm test` - Vitest unit tests (must pass)
- `npm run db:generate` - generate Drizzle migrations from schema
- `npm run db:migrate` - apply migrations
- `npm run db:seed` - wipe and re-seed all data
- `npm run db:reset` - delete the database, migrate, seed
- `npm run db:studio` - Drizzle Studio

## Testing expectations

- Pure logic (anything in `src/lib/` that is not IO) gets unit tests in
  `/tests`
- The Pulse hard rule, avoidance flags, targets, level mapping,
  redaction, CSV parsing, takeaway rolling count, and defer logic are
  covered and must stay covered
- Run `npm test` and `npm run build` before claiming any change is done

## Privacy rules (non-negotiable)

- All personal data stays in local SQLite; no cloud sync by default
- No secrets in source code, ever; `.env.local` is gitignored
- Gmail is read-only only (`gmail.readonly`); never request send scopes
- Email replies are drafted locally and never sent
- External calendar writes require explicit click confirmation
- Everything sent to an AI provider passes through `src/lib/redact.ts`
- Memory items marked sensitive never reach AI unless explicitly included
- External writes and significant actions go to `audit_logs`

## Tone rules

Direct, honest, strategic, practical, faith-aware but not preachy, UK
English. No flattery, no hype, no inflated scores, no macho language.
Banned phrases include: "This is huge", "You are amazing", "King energy",
"Beast mode", "Main character energy". Good examples: "You are drifting
on this", "Do the outreach before improving the dashboard", "The scary
task is the signal".

## No em dash rule

Do not use em dashes anywhere: generated writing, UI copy, prompts,
docs, code comments, or seeded assistant tone. Use full stops, commas,
or colons instead.

## How future Claude Code sessions should behave

1. Read this file, DECISIONS.md, and docs/architecture.md first
2. Keep the app runnable at all times; prefer simple working versions
3. Build queue discipline applies to you too: do not add features beyond
   what was asked; Pulse outreach tooling never displaces outreach itself
4. Never fake completion; label scaffolded work as scaffolded
5. Update DECISIONS.md when making trade-offs
6. Keep business logic out of UI components; pure logic goes in
   `src/lib/` with tests

## Definition of done for future work

- `npm run build` passes
- `npm test` passes
- New pure logic has unit tests
- No secrets committed, no em dashes introduced
- Privacy rules above are upheld
- DECISIONS.md updated if a trade-off was made
