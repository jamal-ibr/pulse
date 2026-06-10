// Post-call summarization with Claude. Latency doesn't matter here (the call
// has ended), so per docs/VOICE-AGENT-PLAN.md §3 this runs a stronger model
// than the in-call turns and produces the structured handoff the practice
// receives by SMS/email.

export const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'claude-sonnet-4-6';

// Structured-output schema: every object needs additionalProperties:false,
// and numeric range constraints aren't supported — hence enum lead quality.
const LEAD_SCHEMA = {
  type: 'object',
  properties: {
    urgency: { type: 'string', enum: ['emergency', 'high_value', 'urgent', 'routine', 'other'] },
    caller_name: { type: 'string', description: 'Empty string if not given on the call' },
    phone: { type: 'string', description: 'Best contact number; empty string if not captured' },
    treatment_interest: { type: 'string' },
    budget_signal: { type: 'string' },
    preferred_timing: { type: 'string' },
    booking_status: {
      type: 'string',
      enum: ['booked', 'callback_requested', 'emergency_escalated', 'no_action'],
    },
    lead_quality: { type: 'string', enum: ['hot', 'warm', 'cool', 'not_a_lead'] },
    summary: { type: 'string', description: 'Two or three sentences for the practice team' },
    sms_text: {
      type: 'string',
      description: 'Ready-to-send SMS to the practice team, max 320 characters',
    },
    recommended_action: { type: 'string', description: 'One sentence: what the team should do next' },
  },
  required: [
    'urgency', 'caller_name', 'phone', 'treatment_interest', 'budget_signal',
    'preferred_timing', 'booking_status', 'lead_quality', 'summary', 'sms_text',
    'recommended_action',
  ],
  additionalProperties: false,
};

function systemPrompt(practiceName) {
  return [
    `You process call transcripts for ${practiceName}, a dental practice using an AI receptionist.`,
    'Extract lead details strictly from the transcript — never invent names, numbers, or intent that is not there.',
    'If a detail was not mentioned, use an empty string for it.',
    'urgency follows the practice rubric: emergency (bleeding/swelling/trauma), high_value (cosmetic enquiry: Invisalign, veneers, whitening, implants), urgent (pain, broken tooth/crown), routine (check-ups, admin), other (wrong number, spam, unclear).',
    'sms_text must be under 320 characters and lead with the most actionable fact.',
  ].join(' ');
}

export async function summarizeCall(client, call, practiceName) {
  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1024,
    system: systemPrompt(practiceName),
    output_config: { format: { type: 'json_schema', schema: LEAD_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Call duration: ${call.durationSeconds ?? 'unknown'}s. Transcript:\n\n${call.transcriptText}`,
      },
    ],
  });

  console.log(
    JSON.stringify({
      event: 'summarize_usage',
      call_id: call.callId,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    })
  );

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error(`no text block in summary response (stop_reason: ${response.stop_reason})`);
  return JSON.parse(text);
}
