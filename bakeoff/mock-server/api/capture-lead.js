import { extractParams, respond, rejectIfUnauthorized } from './_utils.js';

// Mock for the capture_lead tool: logs the captured fields (the scoring sheet's
// "lead_fields_captured" column is filled from these logs), then acknowledges.
export default function handler(req, res) {
  if (rejectIfUnauthorized(req, res)) return;

  const { params, vapiToolCallId } = extractParams(req.body);
  const { name, phone, treatment_interest, budget_signal, preferred_timing, notes } = params;

  console.log(
    JSON.stringify({
      tool: 'capture_lead',
      name,
      phone,
      treatment_interest,
      budget_signal,
      preferred_timing,
      notes,
      at: new Date().toISOString(),
    })
  );

  return respond(res, vapiToolCallId, {
    status: 'saved',
    message: 'Lead saved. The team will be notified.',
  });
}
