# Pulse AI — Receptionist Voice Agent Build Plan

Plan for the production AI receptionist behind pulseai.co.uk: 24/7 inbound call
handling for cosmetic dental practices, with urgency triage (emergency /
high-value / urgent / routine), natural-conversation lead capture, and
structured handoff to the practice team in under 60 seconds.

Constraints this plan is built around:

- **Claude is the brain** (Anthropic API key already in hand).
- **Streamlined** — one person builds, sells, and operates this. No
  infrastructure babysitting.
- Previous stack (Vapi + ElevenLabs voice + Make.com) worked, but in-call
  latency needs to be smoother and voice quality needs to be sellable.
- UK market: UK accents, UK numbers, UK GDPR.

---

## 1. Where the latency actually was

A voice agent turn is a pipeline: caller stops speaking → endpointing decides
"they're done" → STT final transcript → LLM first token → TTS first audio.
Published benchmarks put the typical culprits in this order:

| Stage | Typical cost | Notes |
|---|---|---|
| Endpointing / turn detection | 300–1,500ms | **Vapi's default VAD is ~1,450ms — this was almost certainly your problem, not ElevenLabs.** Pipecat defaults ~300ms, Retell ~700ms |
| STT finalisation | 100–300ms | Deepgram / ElevenLabs ASR are both fine |
| LLM time-to-first-token | 200–500ms | Model choice + prompt size dominate |
| TTS time-to-first-audio | 75–200ms | ElevenLabs Flash ~75ms; Cartesia Sonic ~40–90ms |
| In-call tool calls via Make.com | 1–3s per call | Make.com scenario spin-up is slow — fine post-call, bad mid-call |

Lesson: the fix is mostly **configuration and architecture**, not swapping
every vendor. Target: **≤800ms p50 voice-to-voice**, ≤1.2s p95.

## 2. Platform decision

### Recommended: ElevenLabs Agents (primary), tuned Vapi (bake-off control)

| Option | E2E latency (benchmarked) | Claude support | Why / why not |
|---|---|---|---|
| **ElevenLabs Agents** | ~400–700ms full loop | Yes — pick Claude per agent, token cost passed through | Best-in-class UK voices (the thing clients hear), STT+orchestration+TTS in one vendor = fewer network hops and one bill. ~$0.08/min + LLM. **Primary candidate.** |
| **Vapi (tuned)** | ~465–650ms achievable (default 800–1,200ms) | Yes — native Anthropic option | You know it. Fix turn detection, Flash TTS, short max tokens. Keep as control in the bake-off; turbo mode +$0.02/min. |
| Retell AI | ~600–780ms | Yes — native + custom-LLM WebSocket | Solid ops dashboards, but no latency win over the other two and HIPAA/compliance tiers are US-oriented. Skip for now. |
| Pipecat / LiveKit (self-host) | Best possible (~300ms endpointing, Cartesia Sonic ~40–90ms TTFA) | Yes — bring your own everything | Lowest latency and ~80% cheaper at scale, but it's an engineering project. **Phase 3, when volume justifies it (>10k min/mo).** |
| Twilio ConversationRelay + Claude | Good, code-controlled | Yes — first-party Twilio tutorials | Decent middle path, but more code than ElevenLabs Agents for no clear quality win. |

**Why ElevenLabs Agents first:** the deliverable you sell is *how the call
sounds*. ElevenLabs is the voice quality benchmark, the UK voice library is
the strongest available, you already have a voice you like there, and running
STT → Claude → TTS inside one platform removes the cross-vendor hops that Vapi
orchestration adds. It is also the most streamlined to operate: one dashboard,
one invoice, built-in telephony or Twilio SIP trunking for UK numbers.

**Decision gate (Phase 0):** build the identical agent on both, run 20 scripted
UK test calls each, measure p50/p95 voice-to-voice latency and pick by ear +
numbers. If Vapi tuned beats ElevenLabs on feel, stay — the rest of this plan
is platform-agnostic.

## 3. The brain: Claude configuration

- **In-call model: Claude Haiku 4.5** (`claude-haiku-4-5-20251001`). Voice
  turns need fast TTFT more than deep reasoning; Haiku is ~90% of Sonnet
  capability at 3× lower cost and materially faster first tokens.
- **Post-call model: Claude Sonnet 4.6** for the call summary, lead-quality
  scoring, and the handoff message. Latency doesn't matter once the caller
  hangs up; quality does.
- **Prompt caching** on the system prompt (practice profile, triage rubric,
  services/pricing ranges, FAQs). Cuts TTFT and ~90% of input cost on every
  turn.
- **Short turns:** max ~150 output tokens, "one question at a time" style
  rules. Shorter generations start speaking sooner.
- **Triage rubric as structured tool call**, not prose: classify
  `emergency | high_value | urgent | routine` with confidence — same four
  classes as the 97–98% demo. Emergency → immediately read out the practice's
  out-of-hours emergency route and trigger the on-call SMS.
- **Guardrails in the system prompt:** no clinical advice, no diagnosis, only
  indicative price ranges, always disclose it's an AI assistant at call start
  (also a legal requirement — see §6).

## 4. Architecture (streamlined)

```
Caller → practice number (unchanged)
       → call-forward (after-hours or always-on)
       → UK number (Twilio SIP trunk → ElevenLabs Agents, or 11L native)
       → ElevenLabs Agents: ASR → Claude Haiku (cached prompt) → Flash TTS (UK voice)
              │
              ├─ in-call tools (must be fast → tiny Vercel serverless endpoints):
              │    • check_availability / book_consultation (Calendly or practice PMS)
              │    • capture_lead (name, number, treatment, budget, timing)
              │    • classify_urgency (triage rubric)
              │
       call ends → post-call webhook
              → Make.com (KEEP — latency is irrelevant after hang-up):
                   • Sonnet 4.6 call summary + lead score
                   • SMS (Twilio) + email to practice within 60s
                   • append to per-practice lead sheet / CRM
                   • emergency class → on-call escalation path
```

Key change from the old build: **Make.com moves out of the call path.**
In-call tools hit a small serverless endpoint (single repo, one `vercel
deploy`); Make.com keeps doing what it's good at — post-call plumbing you can
show clients and edit without redeploying.

**Voice:** ElevenLabs Flash v2.5, professional UK voice (warm,
received-pronunciation-adjacent or Midlands to match Birmingham clients —
A/B test two voices in the bake-off). If Phase 3 self-hosting happens,
re-evaluate Cartesia Sonic (fastest TTFA measured, ~40–90ms) and its British
voices then.

**Multi-tenant from day one:** one agent *template*; per-practice JSON config
(name, services, price ranges, opening hours, calendar link, escalation
numbers, voice choice). Onboarding a new practice = fill in config + buy a
number, not rebuild an agent. This is what makes £4k setup / £600/mo scale.

## 5. Unit economics sanity check

Per-minute, ElevenLabs Agents route: ~$0.08 platform + ~$0.01–0.03 Claude
(Haiku + caching) + ~$0.01–0.02 telephony ≈ **$0.10–0.13/min (~£0.08–0.11)**.

A practice doing 300 after-hours minutes/month costs ~£25–35 to serve against
£600/mo revenue — >90% gross margin. Even an always-on practice at 2,000
min/mo (~£170–220) holds healthy margin. Self-hosting (Phase 3) only matters
once total minutes across clients pass ~10k/mo.

## 6. Compliance (UK, sellable-to-dentists checklist)

- **Disclose AI at call start** — required for EU/UK-serving agents under the
  EU AI Act transparency obligations landing 2 Aug 2026; also just good trust.
- **UK GDPR:** Pulse is processor, practice is controller — DPA template as
  part of onboarding (the site's new Terms already point this way). Call
  recordings/transcripts: retention per practice instruction, deletion on
  request.
- **Recording notice** in the greeting; PECR-compliant.
- **No clinical advice** hard rule (already on the site footer — make the
  agent's behaviour match the marketing claim).
- Log every call: transcript, triage class, confidence, tool calls — this is
  both the audit trail and your QA dataset.

## 7. Build phases

**Phase 0 — Bake-off (week 1).** Same receptionist prompt + UK voice on
ElevenLabs Agents and tuned Vapi (turn-detection tightened, Flash TTS,
maxTokens ~150). 20 scripted test calls each from a UK mobile; measure
p50/p95 latency, score voice naturalness blind. Pick the platform.

**Phase 1 — Production agent v1 (weeks 2–3).** Triage tool + lead capture +
booking on the winner; serverless in-call tools; Make.com post-call handoff
(SMS + email + sheet); recording, transcripts, AI disclosure greeting.
Exit criteria: 50 test calls, ≥95% triage accuracy on the four classes,
handoff consistently <60s, zero clinical-advice violations.

**Phase 2 — Client-ready (week 4).** Per-practice config template +
onboarding runbook (number provisioning, call-forward setup, test-call QA
script — mirrors the "set up in under 30 minutes" claim). Weekly summary
email per practice (calls, leads, booked, estimated value — feeds the
case-study engine the website needs). Demo line: a permanent number sales
prospects can ring, plus record the real demo video for the site.

**Phase 3 — Scale levers (when justified).** >10k min/mo: prototype
Pipecat or LiveKit Agents self-host (Claude + Cartesia/Deepgram) for margin
and latency headroom. Reseller dashboards (VoiceAIWrapper-style) only if
clients ask to self-serve. PMS integrations (Dentally, SOE Exact) as the
upsell after Calendly proves the loop.

## 8. What to measure continuously

- p50/p95 voice-to-voice latency per client (alert >1.2s p95)
- Triage accuracy vs human-labelled sample (weekly 20-call audit)
- Lead handoff time (call end → SMS delivered)
- Booking conversion per practice — the number that renews contracts
- Cost per minute per client — the number that protects margin
