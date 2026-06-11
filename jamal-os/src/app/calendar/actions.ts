"use server";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().max(200).optional(),
});

export async function addLocalEvent(formData: FormData) {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    date: formData.get("date"),
    start: formData.get("start"),
    end: formData.get("end"),
    location: formData.get("location") || undefined,
  });
  if (!parsed.success) return;

  await db.insert(schema.calendarEvents).values({
    title: parsed.data.title,
    start: `${parsed.data.date}T${parsed.data.start}`,
    end: `${parsed.data.date}T${parsed.data.end}`,
    location: parsed.data.location,
    sourceProvider: "local",
    writeStatus: "local_only",
  });
  await db.insert(schema.auditLogs).values({
    action: "local_event_created",
    target: parsed.data.title,
    detail: `${parsed.data.date} ${parsed.data.start}`,
    isExternalWrite: false,
    confirmed: true,
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath("/planner");
}
