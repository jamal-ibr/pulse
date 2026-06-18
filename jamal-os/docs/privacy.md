# Privacy

## Local-first model

All personal data lives in `data/jamal-os.db`, a SQLite file on this
machine. It is gitignored. There is no cloud sync, no telemetry, no
analytics, and no auth provider. The app binds to localhost via
`npm run dev`.

## What reaches AI

Only when an AI feature is invoked, and only if `ANTHROPIC_API_KEY` is
configured (otherwise the mock provider runs entirely locally):

- Structured fact strings built in code (counts, dates, task titles,
  habit numbers, pipeline stage names)
- Email sender, subject, and redacted body for reply drafting
- Everything passes through `src/lib/redact.ts` first

## What never reaches AI

- Memory items marked `sensitive` (unless explicitly included by a
  future opt-in flow; no such flow exists today)
- Email bodies marked sensitive (withheld entirely)
- Card numbers, NI numbers, API keys, tokens, private keys, password
  assignments (masked by redaction)
- The raw database

## Redaction

Regex masking, deliberately over-broad. Unit-tested in
`tests/redact.test.ts`. False positives are accepted as the cost of
avoiding false negatives.

## OAuth token handling plan

No OAuth flow is implemented yet. When it is: tokens are encrypted with
AES using `LOCAL_ENCRYPTION_KEY` from `.env.local` before storage in
`connector_accounts.encrypted_token`, and never logged or committed.

## Audit logs

`audit_logs` records significant actions with timestamps, including
`is_external_write` and `confirmed` flags. Visible in Settings.

## External write confirmations

Nothing writes outside this machine today. The design rule, enforced in
scaffolds and documented in CLAUDE.md: any future external write
(Google Calendar event creation, anything else) requires an explicit
confirmation click at the moment of the write, and an audit log row.
Gmail will never gain write capability; replies are drafted locally and
copied manually.

## Data mode indicator

The sidebar shows the current mode at all times: local mock, local real
data, connected read-only, or connected write-enabled. Set it in
Settings.
