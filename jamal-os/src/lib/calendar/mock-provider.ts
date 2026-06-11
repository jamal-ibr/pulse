// Mock calendar provider: reads seeded mock events from SQLite.

import { db, schema } from "@/db/client";
import { and, gte, lte } from "drizzle-orm";
import type { CalendarProvider, CalendarEventInput } from "./types";

export const mockCalendarProvider: CalendarProvider = {
  name: "mock",
  mode: "mock",
  async listEvents(fromIso: string, toIso: string): Promise<CalendarEventInput[]> {
    const rows = await db.query.calendarEvents.findMany({
      where: and(
        gte(schema.calendarEvents.start, fromIso),
        lte(schema.calendarEvents.start, toIso),
      ),
    });
    return rows.map((row) => ({
      title: row.title,
      start: row.start,
      end: row.end,
      location: row.location ?? undefined,
      description: row.description ?? undefined,
    }));
  },
};
