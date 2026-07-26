import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  DAYS_AHEAD,
  describeWindow,
  generateCandidateWindows,
  hasCapacity,
  type ArrivalWindow,
} from "./openingHours.js";

/**
 * Real diary availability.
 *
 * The backend never talks to Google directly - it asks the workflow layer
 * (n8n) for busy blocks and subtracts them from the working windows. All
 * calendar/CRM credentials stay in n8n, so pointing this at a different
 * client's system is an n8n change, not a code change.
 *
 * Expected response from AVAILABILITY_WEBHOOK_URL:
 *   { "busy": [ { "start": "<ISO>", "end": "<ISO>" }, ... ] }
 */

const busyResponseSchema = z.object({
  busy: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
});

const REQUEST_TIMEOUT_MS = 6000;
const MAX_WINDOWS_IN_PROMPT = 8;

export interface AvailabilitySnapshot {
  windows: ArrivalWindow[];
  promptContext: string;
  isLive: boolean;
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
 * Build the availability snapshot for a call. Never throws - if the diary
 * can't be reached the snapshot is marked not-live and the agent is told
 * not to promise a slot.
 */
export async function loadAvailability(callId: string): Promise<AvailabilitySnapshot> {
  const now = new Date();
  const horizon = new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60_000);
  const candidates = generateCandidateWindows(now);
  const busy = await fetchBusyBlocks(now, horizon);

  if (busy === null) {
    logger.info({ callId }, "availability unavailable - agent will take preferences only");
    return {
      windows: [],
      isLive: false,
      promptContext: [
        "LIVE AVAILABILITY: unavailable for this call.",
        "You cannot see the job diary right now, so you must NOT confirm a specific arrival window.",
        "Take the caller's preferred days, tell them the office will ring back shortly to confirm a time, and make sure you have their address, postcode and number.",
      ].join("\n"),
    };
  }

  const free = candidates.filter((w) => hasCapacity(w, busy));
  const offered = free.slice(0, MAX_WINDOWS_IN_PROMPT);

  logger.info(
    { callId, candidates: candidates.length, busy: busy.length, free: free.length },
    "availability loaded",
  );

  if (offered.length === 0) {
    return {
      windows: [],
      isLive: true,
      promptContext: [
        "LIVE AVAILABILITY: every engineer is booked out for the next few days.",
        "Apologise briefly, take their preferred days and full details, and tell them the office will ring back with the first available slot.",
        "If it is urgent, offer to put them through instead.",
      ].join("\n"),
    };
  }

  const lines = offered.map((w) => `- ${describeWindow(w)} [${w.start.toISOString()}]`);

  return {
    windows: offered,
    isLive: true,
    promptContext: [
      "LIVE AVAILABILITY: these arrival windows genuinely have an engineer free.",
      "Offer these windows, and only these windows. Never invent one.",
      "When the caller accepts one, confirm the booking clearly and definitely - it is booked, not pending.",
      "Say the window naturally out loud. Never read the bracketed timestamp aloud - it is internal only.",
      ...lines,
    ].join("\n"),
  };
}
