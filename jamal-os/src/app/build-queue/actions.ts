"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAfter2230 } from "@/lib/dates";
import {
  generateClaudeCodePrompt,
  savePromptAndScript,
  safeSlug,
} from "@/lib/services/build-queue";

const ideaSchema = z.object({
  idea: z.string().min(1).max(300),
  problemItSolves: z.string().min(1).max(1000),
  targetUser: z.string().max(200).optional(),
  scope: z.string().max(1000).optional(),
  definitionOfDone: z.string().max(1000).optional(),
});

export async function addIdea(formData: FormData) {
  const parsed = ideaSchema.safeParse({
    idea: formData.get("idea"),
    problemItSolves: formData.get("problemItSolves"),
    targetUser: formData.get("targetUser") || undefined,
    scope: formData.get("scope") || undefined,
    definitionOfDone: formData.get("definitionOfDone") || undefined,
  });
  if (!parsed.success) return;

  await db.insert(schema.buildQueue).values({
    ...parsed.data,
    isAfter2230WarningShown: isAfter2230(new Date()),
  });
  revalidatePath("/build-queue");
}

export async function generatePrompt(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const item = await db.query.buildQueue.findFirst({
    where: eq(schema.buildQueue.id, id),
  });
  if (!item) return;

  const prompt = generateClaudeCodePrompt({
    idea: item.idea,
    problemItSolves: item.problemItSolves,
    targetUser: item.targetUser,
    scope: item.scope,
    definitionOfDone: item.definitionOfDone,
  });
  const slug = safeSlug(item.idea);
  savePromptAndScript(slug, prompt);

  await db
    .update(schema.buildQueue)
    .set({
      generatedPrompt: prompt,
      status: "scoped",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.buildQueue.id, id));

  await db.insert(schema.auditLogs).values({
    action: "build_prompt_generated",
    target: slug,
    detail: `Prompt and spawn script written to generated-prompts/ and scripts/. Script is never auto-run.`,
  });
  revalidatePath("/build-queue");
}

export async function dropIdea(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db
    .update(schema.buildQueue)
    .set({ status: "dropped", updatedAt: new Date().toISOString() })
    .where(eq(schema.buildQueue.id, id));
  revalidatePath("/build-queue");
}
