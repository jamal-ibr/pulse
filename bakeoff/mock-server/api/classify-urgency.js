import { extractParams, respond, rejectIfUnauthorized } from './_utils.js';

// Mock for the classify_urgency tool: logs the classification so it shows up
// in Vercel function logs for the scoring sheet, then acknowledges.
export default function handler(req, res) {
  if (rejectIfUnauthorized(req, res)) return;

  const { params, vapiToolCallId } = extractParams(req.body);
  const { urgency, confidence, reason } = params;

  console.log(
    JSON.stringify({ tool: 'classify_urgency', urgency, confidence, reason, at: new Date().toISOString() })
  );

  return respond(res, vapiToolCallId, { status: 'recorded', urgency });
}
