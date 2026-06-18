"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MOODS } from "./moods";

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().min(1).max(10000),
  mood: z.enum(MOODS).optional(),
});

export async function addJournalEntry(formData: FormData) {
  const parsed = entrySchema.safeParse({
    date: formData.get("date"),
    content: formData.get("content"),
    mood: formData.get("mood") || undefined,
  });
  if (!parsed.success) return;
  await db.insert(schema.journal).values({
    date: parsed.data.date,
    content: parsed.data.content,
    mood: parsed.data.mood ?? null,
  });
  revalidatePath("/journal");
}

export async function deleteJournalEntry(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(schema.journal).where(eq(schema.journal.id, id));
  await db.insert(schema.auditLogs).values({
    action: "journal_entry_deleted",
    target: String(id),
    detail: "Entry removed by user",
  });
  revalidatePath("/journal");
}
