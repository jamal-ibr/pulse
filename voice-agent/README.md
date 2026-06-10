# Pulse voice agent — post-call pipeline

Phase 1 component from [docs/VOICE-AGENT-PLAN.md](../docs/VOICE-AGENT-PLAN.md) §4:
the serverless endpoint that runs **after** a call ends. Platform-agnostic — it
accepts end-of-call webhooks from either bake-off candidate (Vapi or ElevenLabs
Agents), so it can be deployed before the platform decision is made.

```
call ends → /api/post-call
  1. verify shared secret
  2. normalize the payload (Vapi end-of-call-report | ElevenLabs post_call_transcription)
  3. Claude (Sonnet 4.6, structured output) → urgency, lead fields, lead quality,
     ready-to-send SMS text, recommended action
  4. forward structured handoff to HANDOFF_WEBHOOK_URL (Make.com)
     → Make.com does SMS (Twilio) + email + lead sheet, as before
```

**Design rule: a model error never loses a lead.** If summarization fails, the
handoff still fires with `degraded: true` and the raw transcript — Make.com
routes degraded handoffs to a "manual review" branch.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `WEBHOOK_SHARED_SECRET` | yes | Must match the `x-pulse-secret` header configured on the platform webhook |
| `HANDOFF_WEBHOOK_URL` | yes in prod | Make.com scenario webhook that does SMS/email/sheet |
| `PRACTICE_NAME` | recommended | Used in the summarization prompt and handoff payload |
| `SUMMARY_MODEL` | no | Defaults to `claude-sonnet-4-6` |

## Deploy & wire up

```bash
cd voice-agent
npm install && npm test        # 8 tests, no network needed
vercel deploy --prod
vercel env add ANTHROPIC_API_KEY
vercel env add WEBHOOK_SHARED_SECRET   # e.g. openssl rand -hex 24
vercel env add HANDOFF_WEBHOOK_URL
vercel env add PRACTICE_NAME
vercel deploy --prod
```

- **Vapi:** assistant → Server URL → `https://<app>.vercel.app/api/post-call`,
  enable the `end-of-call-report` server message, add header
  `x-pulse-secret: <secret>`.
- **ElevenLabs Agents:** agent → post-call webhook → same URL. If your plan
  only signs webhooks via HMAC instead of custom headers, add HMAC
  verification of the raw body as a Phase 1 hardening task before go-live
  (tracked in the plan §6 compliance checklist).

Other webhook types the platforms send to the same URL (status updates,
mid-call transcripts) are acknowledged with `{"status":"ignored"}` and skipped.

## Handoff payload (what Make.com receives)

```json
{
  "practice": "SmileFirst Dental",
  "platform": "vapi",
  "call_id": "call_123",
  "caller_number": "+447700900123",
  "duration_seconds": 142,
  "degraded": false,
  "lead": {
    "urgency": "high_value",
    "caller_name": "Sarah",
    "phone": "+447700900123",
    "treatment_interest": "Invisalign",
    "budget_signal": "£3-4k",
    "preferred_timing": "weekday evenings",
    "booking_status": "booked",
    "lead_quality": "hot",
    "summary": "…",
    "sms_text": "…ready to send, <320 chars…",
    "recommended_action": "…"
  },
  "transcript": "…full transcript…",
  "received_at": "2026-06-10T21:00:00.000Z"
}
```

Make.com scenario: router on `degraded` (true → manual-review email with
transcript) and on `lead.urgency` (`emergency` → on-call SMS immediately),
otherwise SMS `lead.sms_text` to the practice + append a row to the lead sheet.

## Notes

- Field paths in `lib/normalize.js` follow each platform's documented webhook
  shape — capture one real payload per platform during integration and
  re-verify before go-live.
- Every stage logs one JSON line (`summarize_usage`, `post_call_processed`,
  `summarize_failed`, `handoff_failed`) — these feed the per-client cost and
  latency metrics in plan §8.
- Multi-tenant: deploy one Vercel project per practice initially (env vars are
  per-practice config); consolidate behind a practice-ID lookup when client
  count justifies it.
