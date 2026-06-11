# Roadmap

## Phase 1: MVP (done)

Local-first app with Daily Brief, hard-coded Pulse rule, habit/sleep/
weight logging, tasks and projects with avoidance detection, pipeline
Kanban with outreach metrics, spending with CSV import and the takeaway
baseline, mock email triage with local drafts, calendar with local
events, weekly review with code-computed flags, conservative level
system, contacts CRM, reading tracker, memory system, build queue with
prompt generation, settings with permission registry and audit logs.

## Phase 2: Real connectors

- Gmail read-only OAuth flow with encrypted token storage
- Google Calendar read, then write behind confirmation modals
- Apple Calendar .ics import
- AI-assisted email categorisation on top of the keyword rules
- Journal page over the existing journal table
- Global command palette and quick-add

## Phase 3: Voice assistant

- Local voice input for sub-10-second logging
- Daily Brief read aloud
- Pulse outreach call note dictation

## Phase 4: PWA and mobile polishing

- Installable PWA with offline shell
- Home-screen quick-log shortcuts
- Push-style local reminders for salah windows and shutdown routine

## Phase 5: Local screen context

- Opt-in local screen time ingestion to replace manual phone-hours entry
- Strictly local processing; nothing leaves the machine

## Phase 6: Advanced agent and GitHub automation

- Build queue spawn scripts upgraded to managed Claude Code sessions
- Automated weekly review draft PRs against a journal repository
- Pipeline enrichment agent (practice research) behind explicit runs
