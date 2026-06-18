// AI provider abstraction. Anthropic when ANTHROPIC_API_KEY is set,
// deterministic mock otherwise. Every call goes through redaction first
// and is logged to ai_interactions.

import fs from "fs";
import path from "path";
import { redact } from "../redact";
import { db, schema } from "@/db/client";
import { mockComplete } from "./mock";

export type PromptName =
  | "chief-of-staff"
  | "weekly-review"
  | "email-voice"
  | "mentor-tone"
  | "avoidance-analysis"
  | "project-next-action"
  | "fitness-adjustment"
  | "spending-correction"
  | "faith-character-reflection"
  | "claude-code-tool-build"
  | "voice-assistant";

export function loadPrompt(name: PromptName): string {
  const promptPath = path.join(process.cwd(), "prompts", `${name}.txt`);
  return fs.readFileSync(promptPath, "utf-8");
}

export function activeProvider(): "anthropic" | "mock" {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
}

async function anthropicComplete(
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

export async function complete(
  promptName: PromptName,
  facts: string,
): Promise<{ output: string; provider: "anthropic" | "mock" }> {
  const systemPrompt = loadPrompt(promptName);
  const redactedFacts = redact(facts);
  const provider = activeProvider();

  let output: string;
  if (provider === "anthropic") {
    try {
      output = await anthropicComplete(systemPrompt, redactedFacts);
    } catch (error) {
      // Fall back to mock rather than breaking the page. Log the failure.
      console.error("Anthropic call failed, falling back to mock:", error);
      output = mockComplete(promptName, redactedFacts);
    }
  } else {
    output = mockComplete(promptName, redactedFacts);
  }

  await db.insert(schema.aiInteractions).values({
    promptName,
    provider,
    inputSummary: redactedFacts.slice(0, 500),
    output,
    redactionApplied: true,
  });

  return { output, provider };
}
