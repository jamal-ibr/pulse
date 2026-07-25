import { anthropicClient } from "../claude/claudeService.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  extractedLeadJsonSchema,
  extractedLeadSchema,
  type ExtractedLead,
} from "./leadSchema.js";
import type { TranscriptTurn } from "../state/callStore.js";

const EXTRACTION_SYSTEM = `You extract structured lead data from a phone call transcript between an AI dental clinic receptionist ("agent") and a caller ("user").
Return only what the caller actually said - never invent contact details, dates, or symptoms. Use null for anything not mentioned and "unknown" for enum fields you cannot determine.
"summary_for_staff" is two or three plain sentences a busy clinic receptionist can act on.`;

const MAX_EXTRACTION_TOKENS = 1000;

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
export async function extractLead(
  callId: string,
  transcript: TranscriptTurn[],
  availabilityContext?: string | null,
): Promise<ExtractedLead | null> {
  const text = renderTranscript(transcript);
  if (!text) return null;

  // Giving the extractor the same slot list the agent saw lets it return
  // the exact ISO timestamp of whatever was confirmed, so the calendar
  // event is created at the real time rather than a placeholder.
  const slotReference = availabilityContext
    ? `\n\nThese are the slots the receptionist could offer on this call. If a specific appointment was confirmed, set confirmed_slot_iso to that slot's exact bracketed ISO timestamp; otherwise null.\n${availabilityContext}`
    : "";

  try {
    const response = await anthropicClient.messages.create({
      model: config.claudeModel,
      max_tokens: MAX_EXTRACTION_TOKENS,
      system: EXTRACTION_SYSTEM,
      output_config: {
        format: {
          type: "json_schema",
          schema: extractedLeadJsonSchema,
        },
      },
      messages: [
        {
          role: "user",
          content: `Extract the lead data from this call transcript:\n\n${text}${slotReference}`,
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

    const parsed = extractedLeadSchema.safeParse(JSON.parse(textBlock.text));
    if (!parsed.success) {
      logger.warn({ callId, issues: parsed.error.issues }, "extraction failed schema validation");
      return null;
    }

    logger.info(
      {
        callId,
        treatment: parsed.data.treatment_interest,
        urgency: parsed.data.urgency,
        nextAction: parsed.data.next_action,
        hasPhone: Boolean(parsed.data.caller_phone),
      },
      "lead extracted",
    );
    return parsed.data;
  } catch (err) {
    logger.error({ callId, err }, "extraction call failed (call unaffected)");
    return null;
  }
}
