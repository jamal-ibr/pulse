# Pulse AI Voice Agent — Electrical Contractor

AI receptionist for an electrical contracting business. Answers inbound
calls, triages electrical safety hazards, qualifies the job, books an
engineer into the diary, and **puts genuine emergencies straight through
to the business owner**.

```
Caller's phone
   │  (audio)
Retell AI            ← telephony, speech-to-text, text-to-speech, turn-taking
   │  (WebSocket: transcript down, replies up)
This backend         ← the orchestrator
   │  (HTTPS)                    │  (fire-and-forget POST)      │
Claude API                       n8n                      Owner's mobile
   ← conversation + extraction     │  (transfer)
                        Google Calendar / Sheets / SMS / email
```

## What makes this different from a generic booking agent

| Concern | How it's handled |
|---|---|
| **Safety triage** | Fire/smoke → 999. Electric shock → 999/111. Gas smell → 0800 111 999. Whole-street power cut → **105** (the free national power cut line — not a chargeable callout). Burning smells, sparks, exposed wiring → isolate if safe, urgent engineer. The agent never diagnoses and never talks anyone through touching wiring. |
| **Emergency transfer** | Detected instantly from the caller's own words (no API round-trip), then the call is transferred to the owner. Details are texted/emailed to him at the same moment, so he has the address even if he misses the call. |
| **Address is mandatory** | A callout is worthless without somewhere to send the engineer, so a job is only "dispatchable" with an address or postcode plus a name and number. |
| **Arrival windows, not appointments** | Trades give "Tuesday morning, between eight and twelve" because jobs overrun. The diary is modelled in half-day windows. |
| **Engineer capacity** | The diary holds several engineers, so a window stays bookable until `ENGINEER_CAPACITY` jobs overlap it — three engineers means three simultaneous jobs. |
| **Customer type** | Tenants often can't authorise work. The agent captures homeowner / tenant / landlord / letting agent / business and asks who's instructing. |
| **Ad attribution** | Captures how they heard about the business, since the owner spends on Google Ads. |
| **No invented prices** | Never quotes a rate or callout charge. The engineer prices on site; the office sends written quotes for larger jobs. |

## Project layout

```
src/
  index.ts / server.ts       entry point, HTTP routes, WebSocket upgrade
  config.ts                  env loading + validation (business name, transfer number)
  retell/
    llmWebSocket.ts          Custom LLM handler: streaming, greeting, transfer
    transfer.ts              instant emergency/handover detection
    types.ts                 Retell protocol payloads (incl. transfer_number)
    webhook.ts               call_started / call_ended / call_analyzed
  claude/
    systemPrompt.ts          the receptionist persona (edit deliberately)
    claudeService.ts         streaming conversation calls
  extraction/
    jobSchema.ts             job schema: address, hazards, job types
    extractor.ts             structured extraction (isolated from the call)
  scheduling/
    openingHours.ts          working hours, arrival windows, capacity
    availability.ts          real diary lookup via n8n
  actions/actionEngine.ts    extraction cadence + idempotent workflow triggers
  workflows/workflowClient.ts webhook sends with retry, never throws
  state/callStore.ts         in-memory per-call state (TODO: Redis/Postgres)
```

## Setup

Follow the same flow as any deployment of this stack:

1. `npm install`, then `cp .env.example .env`
2. Fill in `ANTHROPIC_API_KEY`, `BUSINESS_NAME`, `OWNER_NAME`, and
   `OWNER_TRANSFER_NUMBER` (E.164, e.g. `+447700900123`)
3. `npm run dev`, then check `curl http://localhost:3000/health`
4. Prove the brain works with no phone involved:
   ```bash
   npm run simulate            # routine fault → booking
   npm run simulate:emergency  # burning smell → transfer fires
   ```
   The emergency run prints `*** TRANSFER TRIGGERED -> +44... ***` where a
   real call would connect.
5. Expose it: `ngrok http 3000` (testing) or deploy the included
   `Dockerfile` to Railway/Render/Fly (permanent, always-on)
6. In Retell: create an agent with **Custom LLM**, set the WebSocket URL to
   `wss://<host>/retell/llm`, pick a British voice, set the webhook to
   `https://<host>/retell/webhook`, and attach a phone number
7. Build the n8n workflows below and paste their production URLs into `.env`

### n8n workflows

Each starts with a **Webhook** node (POST) — activate it and use the
**production** URL.

| Env var | Fires when | Wire it to |
|---|---|---|
| `AVAILABILITY_WEBHOOK_URL` | at the start of every call | Google Calendar → **Get Many** events → Code node → **Respond to Webhook**. Must set the Webhook node to *Respond: Using 'Respond to Webhook' node* and reply with `{ "busy": [ { "start": "<ISO>", "end": "<ISO>" } ] }` |
| `JOB_BOOKING_WEBHOOK_URL` | job booked with an address | Google Calendar → Create event at `confirmed_start`/`confirmed_end`; optional Twilio SMS confirmation to `caller_phone` |
| `URGENT_ALERT_WEBHOOK_URL` | emergency or handover, immediately | SMS/WhatsApp/call to the owner — include `postcode`, `safety_flags`, `job_description` |
| `LEAD_WEBHOOK_URL` | caller qualified | Google Sheets row (include `how_they_heard` for ad ROI) |
| `CALL_SUMMARY_WEBHOOK_URL` | call ends | Sheet row or email digest |

Booking node field mapping:
- Start: `{{ $json.body.confirmed_start }}`
- End: `{{ $json.body.confirmed_end }}`
- Title: `{{ $json.body.job_type }} — {{ $json.body.caller_name }} — {{ $json.body.postcode }}`

## Call transfer — what's verified and what isn't

Transfer is driven from this backend by setting `transfer_number` on the
Custom LLM response payload. Verified against Retell's published demo type
definitions and generated SDK types.

**Known limitations, designed around in the code:**

- **Cold transfer only.** The Custom LLM path exposes a bare
  `transfer_number` string — there is no warm transfer, no handoff message
  and no ring timeout on this path (those exist only for Retell's own LLM /
  Conversation Flow engines). The agent therefore *announces* the handoff
  itself before the transfer fires.
- **`transfer_number` is attached to the first content chunk, not the
  last.** Transfers set on the closing chunk have been reported to be
  silently dropped.
- **Failure behaviour is undocumented.** We don't know for certain whether a
  no-answer returns the caller to the agent or drops the call, so the
  handler watches for any further `response_required` after a transfer and
  treats it as a failed transfer, recovering the conversation and marking
  the alert.
- **The urgent alert fires when the transfer is *flagged*, not when it
  succeeds** — so the owner gets the address and fault on his phone whether
  or not he picks up.

TODOs are marked `TODO(retell)` in the code. Worth confirming against
`docs.retellai.com/api-references/llm-websocket` before going live.

## Tests

```bash
npm test        # 68 tests: transfer detection, hours/windows/capacity, schema, actions
npm run typecheck
```

## Splitting this into its own repo

This folder is self-contained. To give it its own GitHub repo:

```bash
# from the parent of this folder
cp -r electrical-agent ~/pulse-electrical-agent
cd ~/pulse-electrical-agent
rm -rf node_modules dist .env
git init && git add -A && git commit -m "Initial commit: electrical voice agent"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/pulse-electrical-agent.git
git push -u origin main
```

Then point Railway at the new repo (root directory `.`, it will find the
Dockerfile) and set the environment variables from `.env.example`.

## Operational notes

- **State is in-memory** — one process only. Swap `src/state/callStore.ts`
  for Redis/Postgres before running multiple instances.
- **Latency** — the only awaited work on the caller path is the Claude
  stream. Availability, extraction and webhooks are all fire-and-forget.
  Logs print `ttfbMs` per turn so you can measure time-to-first-audio.
- **Data protection** — customer names, addresses and phone numbers flow
  through Retell, Anthropic and n8n. Get data processing agreements in
  place and prefer UK/EU-hosted n8n before handling real customer traffic.
