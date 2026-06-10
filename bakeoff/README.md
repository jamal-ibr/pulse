# Phase 0 Bake-off Kit — ElevenLabs Agents vs tuned Vapi

Everything needed to run the platform decision described in
[docs/VOICE-AGENT-PLAN.md](../docs/VOICE-AGENT-PLAN.md) §7 Phase 0.

The rule of the bake-off: **identical brain, identical voice, identical
scenarios** — the only variable is the platform. Both platforms accept the
same `{{variable}}` template syntax and OpenAI-style tool definitions, so
these files work on both without edits.

## Files

| File | What it is |
|---|---|
| `system-prompt.md` | The receptionist system prompt (shared verbatim by both platforms) |
| `tools.json` | Tool definitions: `classify_urgency`, `capture_lead`, `book_consultation` |
| `practice-config.example.json` | Per-practice variables that fill the prompt template |
| `test-call-protocol.md` | 20 scripted scenarios, latency measurement method, scoring sheet |
| `mock-server/` | Deployable Vercel mock for all three tools (deterministic slots, JSON-line logging, shared-secret auth) |

## Setup — ElevenLabs Agents (candidate A)

1. Create an agent in the Agents dashboard.
2. **LLM:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), temperature 0.4,
   max tokens 150. Add your Anthropic key under custom LLM keys so usage
   bills to your own account.
3. **System prompt:** paste `system-prompt.md`, define the dynamic variables
   from `practice-config.example.json`.
4. **Voice:** shortlist two UK voices (one RP-adjacent, one regional —
   ideally Midlands). Model: **Flash v2.5** (latency-optimised). Run the
   bake-off on voice 1; spot-check 3 calls with voice 2.
5. **Tools:** add the three tools from `tools.json` as webhook tools. For the
   bake-off they can point at a mock endpoint that returns fixed slots
   (see protocol §"Mock booking endpoint").
6. **Turn-taking:** default endpointing first; if the agent feels slow to
   reply, lower the silence threshold one notch and re-test — record which
   setting was used on the scoring sheet.
7. **Telephony:** buy a test number (native or Twilio SIP trunk, UK +44).

## Setup — Vapi (candidate B, tuned)

1. Create an assistant.
2. **Model:** Anthropic → Claude Haiku 4.5, temperature 0.4,
   `maxTokens: 150`.
3. **System prompt + variables:** same files.
4. **Voice:** ElevenLabs → the *same* voice ID as candidate A, model
   `eleven_flash_v2_5`.
5. **Latency tuning (this is the whole point):**
   - `startSpeakingPlan.transcriptionEndpointingPlan` → reduce
     `waitSeconds` aggressively (start at 0.4s; default behaviour can add
     1.5s+).
   - `transcriber`: Deepgram, latest general model, `endpointing: 300`.
   - Disable any "format turns" / punctuation-wait options.
   - Keep filler/acknowledgement phrases ON (perceived latency matters too).
6. **Tools:** same `tools.json` via server URL.
7. **Telephony:** Twilio UK number you already have, pointed at the assistant.

## Decision rule

Run the full protocol on each platform in the same week, same phone, same
quiet room. Pick the platform that wins on:

1. **p50 voice-to-voice latency** (target ≤800ms) — measured per protocol
2. **p95 latency** (target ≤1.2s) — worst turns lose deals, not best turns
3. **Blind voice/naturalness score** (target ≥4/5)
4. **Triage accuracy** (must be ≥18/20 on both; below that, fix the prompt
   before deciding — it's a brain problem, not a platform problem)

Ties break toward ElevenLabs Agents (fewer vendors, one bill, simpler ops).
Record everything in the scoring sheet so the loser's numbers are on file
when a client asks "why this stack?".
