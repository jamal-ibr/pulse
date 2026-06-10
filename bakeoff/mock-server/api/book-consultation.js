import { extractParams, respond, rejectIfUnauthorized } from './_utils.js';

// Mock for the book_consultation tool. Per the test protocol, "check" always
// returns the same two slots so every scripted call is reproducible, and
// "book" always confirms. Responds well under the 200ms budget.
const FIXED_SLOTS = [
  { slot_id: 'slot_tue', description: 'Tuesday at 6:30pm' },
  { slot_id: 'slot_thu', description: 'Thursday at 7pm' },
];

export default function handler(req, res) {
  if (rejectIfUnauthorized(req, res)) return;

  const { params, vapiToolCallId } = extractParams(req.body);
  const { action, window, slot_id, caller_name, caller_phone } = params;

  console.log(
    JSON.stringify({
      tool: 'book_consultation',
      action,
      window,
      slot_id,
      caller_name,
      caller_phone,
      at: new Date().toISOString(),
    })
  );

  if (action === 'book') {
    const slot = FIXED_SLOTS.find((s) => s.slot_id === slot_id);
    if (!slot) {
      return respond(res, vapiToolCallId, {
        status: 'error',
        message: 'That slot is no longer available. Offer the other slot instead.',
      });
    }
    return respond(res, vapiToolCallId, {
      status: 'confirmed',
      slot: slot.description,
      message: `Booked for ${slot.description}. The practice will confirm by text.`,
    });
  }

  return respond(res, vapiToolCallId, { status: 'ok', available_slots: FIXED_SLOTS });
}
