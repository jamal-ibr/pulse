"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const MEMORY_TYPES = [
  "identity", "goals", "preferences", "constraints", "current_projects",
  "people", "routines", "lessons_learned", "wins", "weakness_patterns",
  "avoidance_patterns", "long_term_vision", "private_notes",
] as const;

const memorySchema = z.object({
  type: z.enum(MEMORY_TYPES),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  tags: z.string().max(200).optional(),
  sensitivity: z.enum(["normal", "sensitive"]),
});

export async function addMemory(formData: FormData) {
  const parsed = memorySchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
    tags: formData.get("tags") || undefined,
    sensitivity: formData.get("sensitivity") ?? "normal",
  });
  if (!parsed.success) return;
  await db.insert(schema.memoryItems).values(parsed.data);
  revalidatePath("/memory");
}

export async function updateMemory(formData: FormData) {
  const id = Number(formData.get("id"));
  const content = String(formData.get("content") ?? "").trim();
  if (!Number.isInteger(id) || content === "") return;
  await db
    .update(schema.memoryItems)
    .set({ content, updatedAt: new Date().toISOString(), lastReviewedAt: new Date().toISOString() })
    .where(eq(schema.memoryItems.id, id));
  revalidatePath("/memory");
}

export async function forgetMemory(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(schema.memoryItems).where(eq(schema.memoryItems.id, id));
  await db.insert(schema.auditLogs).values({
    action: "memory_forgotten",
    target: String(id),
  });
  revalidatePath("/memory");
}

export async function toggleSensitive(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const item = await db.query.memoryItems.findFirst({
    where: eq(schema.memoryItems.id, id),
  });
  if (!item) return;
  await db
    .update(schema.memoryItems)
    .set({ sensitivity: item.sensitivity === "sensitive" ? "normal" : "sensitive" })
    .where(eq(schema.memoryItems.id, id));
  revalidatePath("/memory");
}
