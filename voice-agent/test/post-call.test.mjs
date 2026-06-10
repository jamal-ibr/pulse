import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCallPayload } from '../lib/normalize.js';
import { summarizeCall } from '../lib/summarize.js';
import handler from '../api/post-call.js';

const VAPI_PAYLOAD = {
  message: {
    type: 'end-of-call-report',
    call: { id: 'call_123' },
    customer: { number: '+447700900123' },
    durationSeconds: 142,
    transcript: 'AI: Hello, thanks for calling.\nUser: Hi, I want Invisalign.',
    summary: 'Invisalign enquiry',
    endedReason: 'customer-ended-call',
  },
};

const ELEVENLABS_PAYLOAD = {
  type: 'post_call_transcription',
  data: {
    conversation_id: 'conv_456',
    transcript: [
      { role: 'agent', message: 'Hello, thanks for calling.' },
      { role: 'user', message: 'Hi, I want Invisalign.' },
    ],
    metadata: { call_duration_secs: 142, phone_call: { external_number: '+447700900123' } },
    analysis: { transcript_summary: 'Invisalign enquiry' },
  },
};

const FAKE_LEAD = {
  urgency: 'high_value', caller_name: 'Sarah', phone: '+447700900123',
  treatment_interest: 'Invisalign', budget_signal: '', preferred_timing: 'evenings',
  booking_status: 'booked', lead_quality: 'hot', summary: 'Invisalign lead booked.',
  sms_text: 'New Invisalign lead: Sarah, booked Tue 6:30pm.', recommended_action: 'Confirm by text.',
};

function fakeClient(responseText) {
  return {
    messages: {
      create: async (params) => {
        fakeClient.lastParams = params;
        return {
          content: [{ type: 'text', text: responseText }],
          usage: { input_tokens: 500, output_tokens: 120 },
          stop_reason: 'end_turn',
        };
      },
    },
  };
}

function mockRes() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

describe('normalizeCallPayload', () => {
  test('normalizes a Vapi end-of-call-report', () => {
    const call = normalizeCallPayload(VAPI_PAYLOAD);
    assert.equal(call.platform, 'vapi');
    assert.equal(call.callId, 'call_123');
    assert.equal(call.callerNumber, '+447700900123');
    assert.equal(call.durationSeconds, 142);
    assert.match(call.transcriptText, /Invisalign/);
  });

  test('normalizes an ElevenLabs post_call_transcription', () => {
    const call = normalizeCallPayload(ELEVENLABS_PAYLOAD);
    assert.equal(call.platform, 'elevenlabs');
    assert.equal(call.callId, 'conv_456');
    assert.equal(call.callerNumber, '+447700900123');
    assert.equal(call.transcriptText, 'agent: Hello, thanks for calling.\nuser: Hi, I want Invisalign.');
  });

  test('returns null for unrelated webhook types', () => {
    assert.equal(normalizeCallPayload({ type: 'conversation_initiation' }), null);
    assert.equal(normalizeCallPayload({ message: { type: 'status-update' } }), null);
    assert.equal(normalizeCallPayload(undefined), null);
  });
});

describe('summarizeCall', () => {
  test('parses structured lead JSON and sends the transcript', async () => {
    const client = fakeClient(JSON.stringify(FAKE_LEAD));
    const call = normalizeCallPayload(VAPI_PAYLOAD);
    const lead = await summarizeCall(client, call, 'SmileFirst Dental');
    assert.equal(lead.urgency, 'high_value');
    assert.equal(lead.booking_status, 'booked');
    assert.match(fakeClient.lastParams.messages[0].content, /Invisalign/);
    assert.match(fakeClient.lastParams.system, /SmileFirst Dental/);
    assert.equal(fakeClient.lastParams.output_config.format.type, 'json_schema');
  });
});

describe('post-call handler', () => {
  const H = { 'x-pulse-secret': 'test-secret' };

  test('rejects missing secret and wrong method', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'test-secret';
    let res = mockRes();
    await handler({ method: 'POST', headers: {}, body: VAPI_PAYLOAD }, res);
    assert.equal(res.code, 401);
    res = mockRes();
    await handler({ method: 'GET', headers: H, body: {} }, res);
    assert.equal(res.code, 405);
  });

  test('acknowledges and skips non-end-of-call events', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'test-secret';
    const res = mockRes();
    await handler({ method: 'POST', headers: H, body: { type: 'something-else' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.status, 'ignored');
  });

  test('forwards a degraded handoff when summarization fails', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'test-secret';
    process.env.HANDOFF_WEBHOOK_URL = 'https://hook.example.test/leads';
    delete process.env.ANTHROPIC_API_KEY; // makes client construction throw

    const captured = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      captured.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    try {
      const res = mockRes();
      await handler({ method: 'POST', headers: H, body: ELEVENLABS_PAYLOAD }, res);
      assert.equal(res.code, 200);
      assert.equal(res.body.degraded, true);
      assert.equal(captured.length, 1);
      assert.equal(captured[0].body.degraded, true);
      assert.equal(captured[0].body.lead, null);
      assert.match(captured[0].body.transcript, /Invisalign/);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.HANDOFF_WEBHOOK_URL;
    }
  });

  test('returns 502 when handoff delivery fails', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'test-secret';
    process.env.HANDOFF_WEBHOOK_URL = 'https://hook.example.test/leads';
    delete process.env.ANTHROPIC_API_KEY;

    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    try {
      const res = mockRes();
      await handler({ method: 'POST', headers: H, body: VAPI_PAYLOAD }, res);
      assert.equal(res.code, 502);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.HANDOFF_WEBHOOK_URL;
    }
  });
});
