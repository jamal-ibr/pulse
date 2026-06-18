# Roadmap

## Phase 1: MVP (done)

Local-first app with Daily Brief, hard-coded Pulse rule, habit/sleep/
weight logging, tasks and projects with avoidance detection, pipeline
Kanban with outreach metrics, spending with CSV import and the takeaway
baseline, mock email triage with local drafts, calendar with local
events, weekly review with code-computed flags, conservative level
system, contacts CRM, reading tracker, memory system, build queue with
prompt generation, settings with permission registry and audit logs.

## Phase 2: Real connectors (mostly done)

- Gmail read-only OAuth flow with encrypted token storage (done)
- Google Calendar read (done, calendar.readonly); write behind
  confirmation modals (not built, deliberately)
- Monzo read-only bank feed (done; replaced the aggregator idea)
- Apple Health / Garmin ingest endpoint (done; supersedes manual
  fitness logging)
- Apple Calendar .ics import (not built)
- AI-assisted email categorisation on top of the keyword rules
  (not built; revisit once Gmail is connected and in daily use)
- Journal page over the existing journal table (done)
- Global command palette and quick-add (not built; the voice agent
  covers quick-add by voice or text)

## Phase 3: Voice assistant (done)

- Voice agent orb on every page: speech in, spoken replies out
- Brief, pipeline, avoidance, and habit questions answered from
  local data; tasks added by voice
- Call note dictation (not built; "add a task to ..." covers it
  meanwhile)

## Phase 4: PWA and mobile polishing (mostly done)

- Installable PWA (done; the service worker is deliberately
  cache-free so data is never stale)
- Home-screen quick-log shortcuts (done: habits, pipeline, tasks,
  journal)
- Push-style local reminders for salah windows and shutdown routine
  (not built)

## Phase 5: Local screen context

- Opt-in local screen time ingestion to replace manual phone-hours entry
- Strictly local processing; nothing leaves the machine

## Phase 6: Advanced agent and GitHub automation

- Build queue spawn scripts upgraded to managed Claude Code sessions
- Automated weekly review draft PRs against a journal repository
- Pipeline enrichment agent (practice research) behind explicit runs
