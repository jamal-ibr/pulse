// Shared helpers for the bake-off mock tool endpoints.
// Files starting with "_" are not exposed as routes by Vercel.

// Vapi wraps tool calls as { message: { toolCalls: [{ id, function: { arguments } }] } }.
// ElevenLabs webhook tools POST the configured parameters as a flat JSON body.
// Accept both so the same deployment serves both platforms in the bake-off.
export function extractParams(body) {
  const toolCall = body?.message?.toolCalls?.[0];
  if (toolCall) {
    const args = toolCall.function?.arguments;
    return {
      params: typeof args === 'string' ? safeJsonParse(args) : args ?? {},
      vapiToolCallId: toolCall.id,
    };
  }
  return { params: body ?? {}, vapiToolCallId: null };
}

// Vapi expects { results: [{ toolCallId, result }] }; ElevenLabs expects plain JSON.
export function respond(res, vapiToolCallId, result) {
  if (vapiToolCallId) {
    return res
      .status(200)
      .json({ results: [{ toolCallId: vapiToolCallId, result: JSON.stringify(result) }] });
  }
  return res.status(200).json(result);
}

export function rejectIfUnauthorized(req, res) {
  const secret = process.env.TOOL_SHARED_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'TOOL_SHARED_SECRET is not configured' });
    return true;
  }
  if (req.headers['x-pulse-secret'] !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return true;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return true;
  }
  return false;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
