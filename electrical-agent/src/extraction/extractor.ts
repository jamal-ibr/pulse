import { anthropicClient } from "../claude/claudeService.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  extractedJobJsonSchema,
  extractedJobSchema,
  type ExtractedJob,
} from "./jobSchema.js";
import type { TranscriptTurn } from "../state/callStore.js";

const EXTRACTION_SYSTEM = `You extract structured job data from a phone call between an electrical contractor's receptionist ("agent") and a caller ("user").

Return only what the caller actually said. Never invent an address, postcode, phone number or symptom. Use null for anything not mentioned and "unknown" for enum fields you cannot determine.

Notes:
- job_address should be the address the engineer must attend, not the caller's billing address if they differ.
- postcode must be a UK postcode if one was given, formatted normally (e.g. "SW2 1AA").
- safety_flags: include every hazard the caller actually described. Use ["none"] if none were mentioned. Do not infer hazards from the job type alone.
- how_they_heard: capture it if mentioned (Google, advert, recommendation, returning customer) - the business tracks its advertising.
- summary_for_office: two or three plain sentences a busy office manager can act on, including the address and what is wrong.`;

const MAX_EXTRACTION_TOKENS = 1200;

function renderTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .filter((t) => t.content.trim().length > 0)
    .map((t) => `${t.role === "agent" ? "Receptionist" : "Caller"}: ${t.content.trim()}`)
    .join("\n");
}

/**
 * Run structured extraction over the transcript. Fully isolated from the
 * conversational path: any failure returns null and only logs - a broken
 * extraction must never break the live call.
 */
export async function extractJob(
  callId: string,
  transcript: TranscriptTurn[],
  availabilityContext?: string | null,
): Promise<ExtractedJob | null> {
  const text = renderTranscript(transcript);
  if (!text) return null;

  // Giving the extractor the same window list the agent saw lets it return
  // the exact ISO timestamp of whatever was confirmed, so the calendar job
  // is created at the real time rather than a placeholder.
  const windowReference = availabilityContext
    ? `\n\nThese are the arrival windows the receptionist could offer on this call. If a specific window was confirmed, set confirmed_window_iso to that window's exact bracketed ISO timestamp; otherwise null.\n${availabilityContext}`
    : "";

  try {
    const response = await anthropicClient.messages.create({
      model: config.claudeModel,
      max_tokens: MAX_EXTRACTION_TOKENS,
      system: EXTRACTION_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: extractedJobJsonSchema },
      },
      messages: [
        {
          role: "user",
          content: `Extract the job data from this call transcript:\n\n${text}${windowReference}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      logger.warn({ callId }, "extraction refused by model");
      return null;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn({ callId }, "extraction returned no text block");
      return null;
    }

    const parsed = extractedJobSchema.safeParse(JSON.parse(textBlock.text));
    if (!parsed.success) {
      logger.warn({ callId, issues: parsed.error.issues }, "extraction failed schema validation");
      return null;
    }

    logger.info(
      {
        callId,
        jobType: parsed.data.job_type,
        urgency: parsed.data.urgency,
        nextAction: parsed.data.next_action,
        hasAddress: Boolean(parsed.data.job_address || parsed.data.postcode),
        safetyFlags: parsed.data.safety_flags,
      },
      "job extracted",
    );
    return parsed.data;
  } catch (err) {
    logger.error({ callId, err }, "extraction call failed (call unaffected)");
    return null;
  }
}
