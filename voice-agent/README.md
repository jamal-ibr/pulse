# Pulse AI Voice Agent Backend

MVP backend for Pulse AI Technologies' dental/cosmetic clinic voice agent.

```
Caller ──phone──▶ Retell AI ──Custom LLM WebSocket──▶ this backend ──▶ Claude API
                                                          │
                                                          └──fire-and-forget──▶ Make.com webhooks
                                                              (lead, booking, staff alert, call summary)
```

- **Retell** handles telephony/voice and connects here via its Custom LLM WebSocket.
- **Claude** generates every conversational reply (streamed back token-by-token for low time-to-first-audio).
- **Make.com** receives structured lead/booking/alert/summary payloads for clinic workflows.
- Extraction and webhook sends run **off the caller-facing path** — they can never block or break a live call.

## Project layout

```
src/
  index.ts                 entry point
  server.ts                Fastify HTTP routes + WebSocket upgrade wiring
  config.ts                env loading + validation (zod)
  logger.ts                structured pino logger
  retell/
    types.ts               Retell event schemas (flexible parsing + TODOs)
    llmWebSocket.ts        /retell/llm/:callId Custom LLM handler (streaming)
    webhook.ts             POST /retell/webhook (call_started/ended/analyzed)
  claude/
    systemPrompt.ts        the receptionist personality (edit deliberately)
    claudeService.ts       streaming conversation calls
  extraction/
    leadSchema.ts          zod + JSON schema for structured lead data
    extractor.ts           Claude structured-output extraction (isolated)
  actions/
    actionEngine.ts        extraction cadence + idempotent Make triggers
  make/
    makeClient.ts          webhook sends with retry, never throws
  state/
    callStore.ts           in-memory per-call state (TODO: Redis/Postgres)
scripts/
  simulate-retell.ts       local WebSocket call simulation
```

## 1. Install

```bash
cd voice-agent
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum:

- `ANTHROPIC_API_KEY` — from https://platform.claude.com
- `CLAUDE_MODEL` — verify the current model string at
  https://platform.claude.com/docs/en/about-claude/models/overview.
  Recommended: `claude-opus-4-8` (best conversation quality, the default if
  left blank). For the absolute lowest time-to-first-audio you can use
  `claude-haiku-4-5` — test both on a real call and pick by ear.
- At least one `MAKE_*_WEBHOOK_URL` (see step 6).

## 3. Run the dev server

```bash
npm run dev
```

Check it's alive:

```bash
curl http://localhost:3000/health
```

## 4. Simulate a call locally (no Retell needed)

With the dev server running:

```bash
npm run simulate
```

This drives a scripted whitening enquiry — including the "for my graduation"
line — over the real WebSocket path, so you can verify streaming works and the
agent acknowledges the occasion warmly before continuing to qualify. Watch the
server logs for `lead extracted` and `make webhook triggered`.

Test the Retell webhook endpoint:

```bash
curl -X POST http://localhost:3000/retell/webhook \
  -H 'content-type: application/json' \
  -d '{"event":"call_ended","call":{"call_id":"test-call-1"}}'
```

Test Make forwarding (sends `{"test":true,...}` to your lead webhook):

```bash
curl -X POST http://localhost:3000/make/test \
  -H 'content-type: application/json' \
  -d '{"webhook":"lead","payload":{"hello":"world"}}'
```

## 5. Expose your local server and wire up Retell

```bash
ngrok http 3000
# or: cloudflared tunnel --url http://localhost:3000
```

In the Retell dashboard:

1. **Custom LLM config** → set the WebSocket URL to
   `wss://<your-tunnel-host>/retell/llm/{call_id}`
   (Retell substitutes `{call_id}`; TODO: confirm the exact placeholder
   syntax against current Retell Custom LLM docs).
2. **Webhook config** → set the call-events webhook to
   `https://<your-tunnel-host>/retell/webhook`.
3. Attach the Custom LLM agent to a Retell phone number.

## 6. Create Make.com webhooks

In Make, create four scenarios each starting with a **Custom webhook** trigger,
and paste the generated URLs into `.env`:

| Env var | Fires when | Sample payload |
|---|---|---|
| `MAKE_LEAD_WEBHOOK_URL` | caller is qualified (contact + intent) — once per call | see below |
| `MAKE_BOOKING_WEBHOOK_URL` | booking intent + enough details — once per call | name, phone, treatment, preferred date/time |
| `MAKE_STAFF_ALERT_WEBHOOK_URL` | human handover / callback / emergency — once per call | reason, urgency, symptoms |
| `MAKE_CALL_SUMMARY_WEBHOOK_URL` | call ends — once per call | full lead + `summary_for_staff` |

Sample lead payload:

```json
{
  "callId": "abc123",
  "lead": {
    "caller_name": "Sophie Turner",
    "caller_phone": "07700 900123",
    "caller_email": null,
    "clinic_location_requested": null,
    "treatment_interest": "whitening",
    "urgency": "flexible",
    "preferred_date": null,
    "preferred_time": "weekday morning",
    "budget_or_price_question": "asked about whitening cost",
    "pain_or_symptoms": null,
    "new_or_existing_patient": "new",
    "consent_to_callback": true,
    "summary_for_staff": "New patient Sophie wants whitening before her graduation on 20 Aug. Prefers weekday mornings. Confirm appointment and pricing.",
    "next_action": "book"
  },
  "_meta": { "source": "pulse-voice-agent", "webhook": "lead", "sentAt": "..." }
}
```

## 7. Test one full call flow

1. `npm run dev` + tunnel running, Retell + Make configured.
2. Ring the Retell number.
3. Say: *"I'd like my teeth whitened for my graduation."* — the agent should
   acknowledge the occasion warmly, then continue qualifying.
4. Give a name + phone number and ask to book.
5. Hang up, then check: Make lead + booking scenarios fired during the call,
   and the call-summary scenario fired after hangup.

## Tests

```bash
npm test        # unit tests (schema, make client, state store, action engine)
npm run typecheck
```

## Operational notes / TODOs

- **State is in-memory** — one process only. Swap `src/state/callStore.ts`
  for Redis/Postgres before scaling to multiple instances.
- **Retell payload shapes** — parsing is deliberately tolerant; grep for
  `TODO(retell)` and verify event/response formats against current Retell
  Custom LLM docs before going live.
- **Webhook signature verification** — `POST /retell/webhook` logs but does
  not yet verify `x-retell-signature`; see `TODO(retell)` in
  `src/retell/webhook.ts`.
- **Latency** — the only awaited work on the caller path is the Claude
  stream itself; the server logs `first token sent` with a `ttfbMs` figure
  per turn so you can measure time-to-first-audio.
- **Deployment** — plain Node app: `npm run build && npm start` works on
  Render/Railway/Fly.io/any VPS. Set the env vars from `.env.example`; make
  sure the platform supports WebSockets (all of the above do).
- Secrets live only in env vars; nothing is hardcoded or committed.
