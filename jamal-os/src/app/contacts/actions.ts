"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayIso } from "@/lib/dates";

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().min(1).max(100),
  category: z.enum(["mentor", "work", "family", "friend", "business"]),
  followUpCadenceDays: z.coerce.number().int().min(1).max(365),
  priority: z.enum(["high", "normal", "low"]),
});

export async function addContact(formData: FormData) {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    relationship: formData.get("relationship"),
    category: formData.get("category"),
    followUpCadenceDays: formData.get("followUpCadenceDays"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return;
  await db.insert(schema.contacts).values(parsed.data);
  revalidatePath("/contacts");
}

export async function logInteraction(formData: FormData) {
  const contactId = Number(formData.get("contactId"));
  const note = String(formData.get("note") ?? "").trim();
  const channel = String(formData.get("channel") ?? "message");
  if (!Number.isInteger(contactId)) return;
  const today = todayIso();
  await db.insert(schema.contactInteractions).values({
    contactId,
    date: today,
    channel,
    note: note || null,
  });
  await db
    .update(schema.contacts)
    .set({ lastContact: today })
    .where(eq(schema.contacts.id, contactId));
  revalidatePath("/contacts");
  revalidatePath("/");
}
