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

export async function syncGoogleCalendar(): Promise<void> {
  const { fetchGoogleCalendarEvents } = await import(
    "@/lib/calendar/google-provider"
  );
  const { eq, and } = await import("drizzle-orm");

  try {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date(Date.now() + 60 * 86400000).toISOString();
    const events = await fetchGoogleCalendarEvents(from, to);

    let inserted = 0;
    let updated = 0;
    for (const event of events) {
      const existing = await db.query.calendarEvents.findFirst({
        where: and(
          eq(schema.calendarEvents.sourceProvider, "google"),
          eq(schema.calendarEvents.externalId, event.externalId),
        ),
      });
      if (existing) {
        await db
          .update(schema.calendarEvents)
          .set({
            title: event.title,
            start: event.start,
            end: event.end,
            location: event.location,
            description: event.description,
          })
          .where(eq(schema.calendarEvents.id, existing.id));
        updated += 1;
      } else {
        await db.insert(schema.calendarEvents).values({
          title: event.title,
          start: event.start,
          end: event.end,
          location: event.location,
          description: event.description,
          sourceProvider: "google",
          externalId: event.externalId,
          writeStatus: "synced",
        });
        inserted += 1;
      }
    }

    await db.insert(schema.auditLogs).values({
      action: "google_calendar_synced",
      target: "google_calendar",
      detail: `${events.length} events fetched, ${inserted} new, ${updated} refreshed`,
    });
  } catch (error) {
    console.error("Google Calendar sync failed:", error);
    await db.insert(schema.auditLogs).values({
      action: "google_calendar_sync_failed",
      target: "google_calendar",
      detail: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
  }
  revalidatePath("/calendar");
  revalidatePath("/planner");
  revalidatePath("/");
}
