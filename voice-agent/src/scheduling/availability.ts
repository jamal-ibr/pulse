import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  DAYS_AHEAD,
  describeSlot,
  generateCandidateSlots,
  type Slot,
} from "./openingHours.js";

/**
 * Real calendar availability.
 *
 * The backend never talks to Google directly - it asks the workflow layer
 * (n8n) for busy blocks over a date range and subtracts them from the
 * practice's opening hours. That keeps all calendar/CRM credentials in
 * n8n, and means swapping Google Calendar for a client's own CRM is a
 * change to one n8n workflow, not to this codebase.
 *
 * Expected response from AVAILABILITY_WEBHOOK_URL:
 *   { "busy": [ { "start": "2026-07-23T09:00:00Z", "end": "..." }, ... ] }
 */

const busyResponseSchema = z.object({
  busy: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
      }),
    )
    .default([]),
});

const REQUEST_TIMEOUT_MS = 6000;

/** Max slots to read into the prompt - enough choice, not a wall of text. */
const MAX_SLOTS_IN_PROMPT = 12;

export interface AvailabilitySnapshot {
  slots: Slot[];
  /** Prompt-ready text describing what the agent may offer. */
  promptContext: string;
  /** False when we could not reach the calendar (agent must not promise). */
  isLive: boolean;
}

function overlaps(slot: Slot, busyStart: Date, busyEnd: Date): boolean {
  return slot.start < busyEnd && slot.end > busyStart;
}

async function fetchBusyBlocks(from: Date, to: Date): Promise<{ start: Date; end: Date }[] | null> {
  const url = config.availabilityWebhookUrl;
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "availability lookup failed");
      return null;
    }
    const parsed = busyResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "availability response did not match schema");
      return null;
    }
    return parsed.data.busy
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
      .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "availability lookup errored");
    return null;
  }
}

/**
 * Build the availability snapshot for a call. Never throws - if the
 * calendar can't be reached the snapshot is marked not-live and the agent
 * falls back to taking preferences without promising a time.
 */
export async function loadAvailability(callId: string): Promise<AvailabilitySnapshot> {
  const now = new Date();
  const horizon = new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60_000);
  const candidates = generateCandidateSlots(now);
  const busy = await fetchBusyBlocks(now, horizon);

  if (busy === null) {
    logger.info({ callId }, "availability unavailable - agent will take preferences only");
    return {
      slots: [],
      isLive: false,
      promptContext: [
        "LIVE AVAILABILITY: unavailable for this call.",
        "You cannot see the diary right now, so you must NOT confirm a specific appointment time.",
        "Take the caller's preferred day and time, reassure them the team will confirm shortly, and collect their contact details.",
      ].join("\n"),
    };
  }

  const free = candidates.filter((slot) => !busy.some((b) => overlaps(slot, b.start, b.end)));
  const offered = free.slice(0, MAX_SLOTS_IN_PROMPT);

  logger.info(
    { callId, candidates: candidates.length, busy: busy.length, free: free.length },
    "availability loaded",
  );

  if (offered.length === 0) {
    return {
      slots: [],
      isLive: true,
      promptContext: [
        "LIVE AVAILABILITY: the diary is fully booked for the next few days.",
        "Apologise briefly, take the caller's preferred times and contact details, and tell them the team will ring back with the first available appointment.",
      ].join("\n"),
    };
  }

  const lines = offered.map((slot) => `- ${describeSlot(slot)} [${slot.start.toISOString()}]`);

  return {
    slots: offered,
    isLive: true,
    promptContext: [
      "LIVE AVAILABILITY: these appointment slots are genuinely free in the practice diary right now.",
      "Offer these times, and only these times. Never invent or imply any other slot.",
      "When the caller accepts one, confirm the booking clearly and definitely - it is booked, not pending.",
      "Say times naturally out loud. Never read the bracketed timestamp aloud - it is for internal use only.",
      ...lines,
    ].join("\n"),
  };
}
