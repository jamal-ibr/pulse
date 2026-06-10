// Normalizes end-of-call webhook payloads from either platform into one shape.
//
// Vapi sends an "end-of-call-report" wrapped in `message`; ElevenLabs sends
// "post_call_transcription" wrapped in `data`. Field paths below follow each
// platform's documented payloads — re-verify against a captured real payload
// during Phase 1 integration before going live.

export function normalizeCallPayload(body) {
  if (body?.message?.type === 'end-of-call-report') return fromVapi(body.message);
  if (body?.type === 'post_call_transcription') return fromElevenLabs(body.data ?? {});
  return null;
}

function fromVapi(message) {
  return {
    platform: 'vapi',
    callId: message.call?.id ?? null,
    callerNumber: message.customer?.number ?? message.call?.customer?.number ?? null,
    durationSeconds: message.durationSeconds ?? null,
    transcriptText: typeof message.transcript === 'string' ? message.transcript : joinTurns(message.artifact?.messages),
    platformSummary: message.summary ?? null,
    endedReason: message.endedReason ?? null,
  };
}

function fromElevenLabs(data) {
  return {
    platform: 'elevenlabs',
    callId: data.conversation_id ?? null,
    callerNumber: data.metadata?.phone_call?.external_number ?? null,
    durationSeconds: data.metadata?.call_duration_secs ?? null,
    transcriptText: joinTurns(data.transcript),
    platformSummary: data.analysis?.transcript_summary ?? null,
    endedReason: data.metadata?.termination_reason ?? null,
  };
}

// Turn arrays look like [{role, message}] (ElevenLabs) or [{role, content}] (Vapi).
function joinTurns(turns) {
  if (!Array.isArray(turns)) return null;
  const lines = turns
    .map((t) => {
      const text = t?.message ?? t?.content;
      return t?.role && typeof text === 'string' && text.trim() ? `${t.role}: ${text.trim()}` : null;
    })
    .filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}
