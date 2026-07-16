# Pulse AI Voice Agent — Setup Checklist

Work top to bottom, ticking each box. By the end you can ring a real phone
number, have a natural conversation with your agent, and watch a booking
appear in your Google Calendar.

Each part ends with a **✅ Checkpoint** — don't move on until it passes.

---

## Part 0 — Accounts & tools (15 min)

- [ ] Node.js 20+ installed (`node --version`)
- [ ] Anthropic account with an API key: https://platform.claude.com → API Keys → Create key (starts `sk-ant-`)
- [ ] Retell AI account: https://retellai.com (free credits are enough for testing)
- [ ] n8n account: https://n8n.io cloud (easiest), or your own self-hosted/Docker instance
- [ ] Google account whose calendar you want bookings in
- [ ] ngrok installed for the first test: https://ngrok.com/download (`ngrok version`)

---

## Part 1 — Backend running locally (10 min)

- [ ] Clone/pull this repo, then:
  ```bash
  cd voice-agent
  npm install
  cp .env.example .env
  ```
- [ ] Edit `.env`: paste your key into `ANTHROPIC_API_KEY=`
- [ ] Leave `CLAUDE_MODEL=` blank (defaults to `claude-opus-4-8`)
- [ ] Start the server:
  ```bash
  npm run dev
  ```
- [ ] In a second terminal:
  ```bash
  curl http://localhost:3000/health
  ```
  Expect `{"status":"ok", ...}`

**✅ Checkpoint 1:** health endpoint returns ok and the server logs show
"pulse voice agent listening".

---

## Part 2 — Prove the brain works (text-only, no phone) (5 min)

- [ ] With the dev server still running, in the second terminal:
  ```bash
  npm run simulate
  ```
- [ ] Read the agent's replies. Confirm:
  - [ ] It responds to "I want my teeth whitened for my graduation" with a
        brief, warm acknowledgement of the graduation before asking its next question
  - [ ] It does NOT quote a specific price (it should defer to the team)
  - [ ] Replies are short (1–3 sentences) and in British English
- [ ] In the server logs, confirm you see `lead extracted` with
      `treatment: whitening` and `hasPhone: true`
- [ ] Expect `workflow webhook URL not configured - send skipped` warnings —
      that's correct, n8n isn't wired up yet

**✅ Checkpoint 2:** simulated call reads naturally, warmth line works,
extraction fires.

If replies are the fallback line ("Sorry, I didn't quite catch that"),
your `ANTHROPIC_API_KEY` is wrong or missing — fix before continuing.

---

## Part 3 — n8n workflows (45 min, the longest part)

You'll build 4 workflows. Build the **booking one first** — it's the demo
centrepiece. All four start the same way:

> **Webhook node recipe (used 4 times):**
> 1. New workflow → add **Webhook** node
> 2. HTTP Method: `POST`
> 3. Path: give it a name (e.g. `pulse-booking`)
> 4. Respond: `Immediately`
> 5. **Activate the workflow** (toggle top-right) — only active workflows
>    have a working production URL
> 6. Copy the **Production URL** (not the Test URL) into `.env`

### 3a. Booking → Google Calendar

- [ ] Create workflow "Pulse — Booking" with a Webhook node (path `pulse-booking`) per the recipe
- [ ] Add a **Google Calendar** node after it:
  - [ ] Connect your Google account when prompted (n8n cloud: one-click OAuth;
        self-hosted: you'll need a Google Cloud OAuth credential — follow the
        n8n credential wizard)
  - [ ] Operation: **Create** an event
  - [ ] Calendar: pick your calendar
- [ ] Map the event fields. The caller's preferred date/time arrives as free
      text ("next Tuesday", "weekday morning"), so for the MVP create a
      **provisional event for tomorrow 9:00–9:30** with everything staff need
      in the title/description; staff confirm and drag it to the real slot:
  - [ ] Start: expression → `{{ $now.plus(1, 'day').set({hour: 9, minute: 0}) }}`
  - [ ] End: expression → `{{ $now.plus(1, 'day').set({hour: 9, minute: 30}) }}`
  - [ ] Summary/title: `CONFIRM BOOKING: {{ $json.body.treatment_interest }} — {{ $json.body.caller_name }}`
  - [ ] Description:
        ```
        Phone: {{ $json.body.caller_phone }}
        Email: {{ $json.body.caller_email }}
        Preferred: {{ $json.body.preferred_date }} {{ $json.body.preferred_time }}
        New/existing: {{ $json.body.new_or_existing_patient }}
        Notes: {{ $json.body.notes }}
        Call ID: {{ $json.body.callId }}
        ```
- [ ] Activate, copy production URL → `.env` as `BOOKING_WEBHOOK_URL=`

### 3b. Lead → Google Sheets (your mini-CRM)

- [ ] Create a Google Sheet "Pulse Leads" with headers:
      `date | name | phone | email | treatment | urgency | next_action | summary`
- [ ] Workflow "Pulse — Lead": Webhook node (path `pulse-lead`) → **Google Sheets** node, operation **Append Row**
- [ ] Map columns from `{{ $json.body.lead.caller_name }}`,
      `{{ $json.body.lead.caller_phone }}`, `{{ $json.body.lead.treatment_interest }}`,
      `{{ $json.body.lead.urgency }}`, `{{ $json.body.lead.next_action }}`,
      `{{ $json.body.lead.summary_for_staff }}`, date = `{{ $now }}`
- [ ] Activate, copy production URL → `.env` as `LEAD_WEBHOOK_URL=`

### 3c. Staff alert → email (or WhatsApp/Slack later)

- [ ] Workflow "Pulse — Staff Alert": Webhook node (path `pulse-alert`) → **Gmail** node (Send)
- [ ] To: your email. Subject: `URGENT — {{ $json.body.reason }}: {{ $json.body.caller_name }}`
- [ ] Body: include `{{ $json.body.caller_phone }}`, `{{ $json.body.urgency }}`,
      `{{ $json.body.pain_or_symptoms }}`, `{{ $json.body.summary }}`
- [ ] Activate, copy production URL → `.env` as `STAFF_ALERT_WEBHOOK_URL=`

### 3d. Call summary → second tab or email

- [ ] Workflow "Pulse — Call Summary": Webhook node (path `pulse-summary`) →
      Google Sheets append (a "Calls" sheet) or a Gmail send — your choice
- [ ] Useful fields: `{{ $json.body.callId }}`, `{{ $json.body.summary }}`,
      `{{ $json.body.callStartedAt }}`, `{{ $json.body.callEndedAt }}`,
      `{{ $json.body.turnCount }}`
- [ ] Activate, copy production URL → `.env` as `CALL_SUMMARY_WEBHOOK_URL=`

### 3e. Test the wiring from your machine

- [ ] Restart the dev server (Ctrl-C, `npm run dev`) so it picks up the new `.env`
- [ ] Fire a test booking payload through the backend:
  ```bash
  curl -X POST http://localhost:3000/make/test \
    -H 'content-type: application/json' \
    -d '{"webhook":"booking","payload":{"caller_name":"Test Patient","caller_phone":"07700 900000","treatment_interest":"whitening","preferred_date":"next Tuesday","preferred_time":"morning","new_or_existing_patient":"new","notes":"wiring test"}}'
  ```
  Expect `{"ok":true,"delivered":true}`
- [ ] **Look at your Google Calendar** — a "CONFIRM BOOKING: whitening — Test Patient" event should be sitting at tomorrow 9:00
- [ ] Repeat for the other three (`"webhook":"lead"`, `"staffAlert"`, `"callSummary"`) and check the sheet row / email arrive
      (for `lead`, nest the fields under `"payload":{"lead":{...}}` to match the real shape)
- [ ] Run the full simulation again — `npm run simulate` — and confirm the
      lead row and booking event appear **without any curl**, driven purely
      by the conversation

**✅ Checkpoint 3:** a simulated conversation alone puts an event in your
calendar and a row in your sheet. The whole nervous system works — all
that's left is attaching a phone number.

---

## Part 4 — Expose the backend to the internet (5 min)

- [ ] With the dev server running:
  ```bash
  ngrok http 3000
  ```
- [ ] Copy the forwarding host (e.g. `a1b2c3.ngrok-free.app`)
- [ ] Verify from outside: open `https://<host>/health` in a browser → `{"status":"ok"}`

> Note: free ngrok URLs change on every restart — fine for today's test.
> Before demoing to a real prospect, deploy instead (Render/Railway/Fly:
> build `npm run build`, start `npm start`, set every var from your `.env`)
> so the URL is permanent and Retell config never goes stale.

**✅ Checkpoint 4:** `/health` reachable over the public URL.

---

## Part 5 — Retell: the phone number and the voice (20 min)

- [ ] In the Retell dashboard, create a new **Agent**
- [ ] Choose **Custom LLM** as the LLM/engine option
- [ ] Set the Custom LLM WebSocket URL to:
      `wss://<your-ngrok-host>/retell/llm`
      Retell appends `/{call_id}` itself. If their UI shows a placeholder
      format instead, use `wss://<host>/retell/llm/{call_id}`.
      (Check their Custom LLM docs page if unsure — the backend accepts
      any `/retell/llm/<anything>` path.)
- [ ] Pick the **voice**: filter for British English and audition a few —
      choose calm and warm over energetic. This is 50% of the demo's feel.
- [ ] Set the **begin message** (greeting spoken instantly on pickup):
      `Good morning, thank you for calling the clinic. How can I help you today?`
- [ ] Recommended conversation settings (names vary slightly in their UI):
  - [ ] Interruption sensitivity: on/medium — callers talk over receptionists
  - [ ] Backchannel ("mm-hm"): on, sparse
  - [ ] Ambient sound: optional, subtle office background sells realism
- [ ] Set the agent/account **webhook URL** to:
      `https://<your-ngrok-host>/retell/webhook`
      and enable `call_started`, `call_ended`, `call_analyzed` events
- [ ] Buy/claim a **phone number** in Retell and attach this agent to it
- [ ] Write the number down 📞
- [ ] (Optional) paste your Retell API key into `.env` as `RETELL_API_KEY=`

**✅ Checkpoint 5:** Retell agent saved, number attached, both URLs point
at your ngrok host.

---

## Part 6 — The real call 🎉 (10 min)

Keep the server logs and your Google Calendar visible, then ring the number
and run this script:

- [ ] **Ring the number.** You hear the greeting within ~1 second
- [ ] Say: *"Hi, I'd like my teeth whitened for my graduation next month."*
  - [ ] Agent acknowledges the graduation warmly, briefly, then asks a question
- [ ] Ask: *"How much does whitening cost?"*
  - [ ] Agent is helpful but does NOT invent a price
- [ ] Say: *"My name is <your name>, my number is <a mobile>. I'm a new patient."*
- [ ] Say: *"Could I come in on a weekday morning? I'd like to book."*
  - [ ] Agent confirms the team will finalise the appointment
- [ ] Interrupt it mid-sentence once — it should stop and yield
- [ ] Hang up

Then verify the paper trail:

- [ ] Server logs show: `retell websocket opened` → `first token sent` (note
      the `ttfbMs`) → `lead extracted` → `workflow webhook triggered` (lead,
      booking) → `call ended` → summary webhook
- [ ] Google Calendar: CONFIRM BOOKING event with your name on it
- [ ] Google Sheet: a lead row
- [ ] Call summary arrived (sheet/email)

**✅ Checkpoint 6: you are done.** A stranger can ring this number and your
agent will qualify them, book them, and leave staff a summary.

---

## Part 7 — Hardening before a real prospect demo (later, not today)

- [ ] Deploy the backend permanently (Render/Railway/Fly) and update both
      Retell URLs from ngrok to the real domain
- [ ] If replies feel slow on the phone, set `CLAUDE_MODEL=claude-haiku-4-5`
      and re-listen — pick by ear, quality vs snappiness
- [ ] Verify Retell webhook signatures (`TODO(retell)` in `src/retell/webhook.ts`)
- [ ] Double-check Retell event payload shapes against their current docs
      (`TODO(retell)` markers in `src/retell/types.ts`)
- [ ] Before live clinic traffic (not demos): DPAs with Retell/Anthropic/n8n,
      UK/EU-hosted n8n — patient data is UK GDPR territory

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Agent only ever says "Sorry, I didn't quite catch that" | `ANTHROPIC_API_KEY` missing/invalid, or no API credit. Check server logs for `claude conversation call failed` |
| Call connects, greeting plays, then silence | Retell can't reach your WebSocket: ngrok died, URL has `https://` instead of `wss://`, or wrong path. Server logs should show `retell websocket opened` on every call — if not, the URL is wrong |
| `delivered:false` from /make/test | n8n workflow not **activated**, or you copied the Test URL instead of the Production URL |
| Calendar event missing but webhook "triggered" in logs | Open the n8n execution list for the booking workflow — the Google Calendar node likely failed (auth expired or a bad field expression) |
| Webhooks fire twice | They can't per call (claim-gated). If you see two calendar events, check n8n isn't running the workflow twice (duplicate webhook node/workflow) |
| ngrok URL stopped working | Free tunnels rotate on restart — update both URLs in Retell, or deploy properly |
| Wrong voice vibe | Change the voice in Retell only — no backend changes needed |
