import Anthropic from '@anthropic-ai/sdk';
import { normalizeCallPayload } from '../lib/normalize.js';
import { summarizeCall } from '../lib/summarize.js';

// End-of-call webhook for both platforms (Vapi end-of-call-report and
// ElevenLabs post_call_transcription). Summarizes with Claude, then forwards
// the structured lead to the handoff webhook (Make.com) which does SMS/email/
// sheet. If summarization fails the raw transcript is still forwarded — a
// model error must never lose a lead.

export default async function handler(req, res) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) return res.status(500).json({ error: 'WEBHOOK_SHARED_SECRET is not configured' });
  if (req.headers['x-pulse-secret'] !== secret) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const call = normalizeCallPayload(req.body);
  // Platforms send other webhook types (status updates, transcripts mid-call)
  // to the same URL depending on config — acknowledge and skip those.
  if (!call) return res.status(200).json({ status: 'ignored', reason: 'not an end-of-call event' });
  if (!call.transcriptText) {
    console.log(JSON.stringify({ event: 'empty_transcript', platform: call.platform, call_id: call.callId }));
    return res.status(200).json({ status: 'ignored', reason: 'empty transcript' });
  }

  const practiceName = process.env.PRACTICE_NAME || 'the practice';
  let lead = null;
  let summaryError = null;
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    lead = await summarizeCall(client, call, practiceName);
  } catch (error) {
    summaryError = error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : String(error);
    console.error(JSON.stringify({ event: 'summarize_failed', call_id: call.callId, error: summaryError }));
  }

  const handoff = {
    practice: practiceName,
    platform: call.platform,
    call_id: call.callId,
    caller_number: call.callerNumber,
    duration_seconds: call.durationSeconds,
    lead, // null when summarization failed — Make.com routes on `degraded`
    degraded: lead === null,
    transcript: call.transcriptText,
    received_at: new Date().toISOString(),
  };

  const handoffUrl = process.env.HANDOFF_WEBHOOK_URL;
  if (handoffUrl) {
    try {
      const response = await fetch(handoffUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(handoff),
      });
      if (!response.ok) throw new Error(`handoff webhook returned ${response.status}`);
    } catch (error) {
      console.error(JSON.stringify({ event: 'handoff_failed', call_id: call.callId, error: String(error) }));
      return res.status(502).json({ status: 'error', reason: 'handoff delivery failed' });
    }
  }

  console.log(
    JSON.stringify({
      event: 'post_call_processed',
      call_id: call.callId,
      platform: call.platform,
      urgency: lead?.urgency ?? 'unknown',
      booking_status: lead?.booking_status ?? 'unknown',
      degraded: lead === null,
    })
  );
  return res.status(200).json({ status: 'processed', degraded: lead === null });
}
