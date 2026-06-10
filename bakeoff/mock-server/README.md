# Bake-off mock tool server

Zero-dependency Vercel functions backing the three tools in
[`../tools.json`](../tools.json) during the Phase 0 bake-off. Deterministic
responses (always the same two slots), fast (<200ms), and every tool call is
logged as one JSON line so the scoring sheet can be filled from Vercel logs.

Both payload shapes are handled automatically: Vapi's
`message.toolCalls[…]` envelope and ElevenLabs' flat webhook body.

## Deploy (one time, ~2 minutes)

```bash
cd bakeoff/mock-server
vercel deploy --prod
vercel env add TOOL_SHARED_SECRET   # paste a long random string, e.g. `openssl rand -hex 24`
vercel deploy --prod                # redeploy so the env var is live
```

Endpoints (replace `<app>` with your deployment domain):

| Tool | URL |
|---|---|
| `classify_urgency` | `https://<app>.vercel.app/api/classify-urgency` |
| `capture_lead` | `https://<app>.vercel.app/api/capture-lead` |
| `book_consultation` | `https://<app>.vercel.app/api/book-consultation` |

## Wire into the platforms

**Both platforms:** when adding each tool, set the request header
`x-pulse-secret: <your TOOL_SHARED_SECRET value>`. Requests without it get
a 401 — these endpoints should not be open webhooks, even as mocks.

- **ElevenLabs Agents:** add each tool as a webhook tool; URL as above,
  method POST, parameters copied from `../tools.json`.
- **Vapi:** add each as a custom tool with the matching server URL. The
  Vapi tool-call envelope and `{ results: [...] }` response format are
  handled by the server automatically.

## Smoke test

```bash
curl -s -X POST https://<app>.vercel.app/api/book-consultation \
  -H 'content-type: application/json' \
  -H 'x-pulse-secret: <secret>' \
  -d '{"action":"check","window":"weekday evenings"}'
# → {"status":"ok","available_slots":[...Tuesday 6:30pm / Thursday 7pm...]}
```

## Reading the logs for the scoring sheet

`vercel logs <app> --follow` during test calls. Each tool call prints one
JSON line (`tool`, fields, timestamp) — use them to fill `actual_class`,
`lead_fields_captured`, and to verify booking flows on the scoring sheet.
