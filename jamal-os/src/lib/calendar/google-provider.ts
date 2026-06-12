// Google Calendar provider, read-only.
//
// Rules baked into this design (see docs/privacy.md):
// - The calendar.readonly scope only. Pushing events to Google is not
//   implemented; if it ever is, it requires the write scope, explicit
//   click confirmation, and an audit_logs entry with confirmed=true.
// - OAuth tokens are encrypted at rest with LOCAL_ENCRYPTION_KEY.
//
// Setup steps are documented in SETUP.md.

import type { CalendarProvider, CalendarEventInput } from "./types";
import {
  mapGoogleCalendarEvent,
  type GoogleCalendarApiEvent,
  type MappedCalendarEvent,
} from "./google-mapper";
import { getValidAccessToken } from "@/lib/services/connectors";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

const CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function fetchGoogleCalendarEvents(
  fromIso: string,
  toIso: string,
): Promise<MappedCalendarEvent[]> {
  const isoPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/;
  if (!isoPattern.test(fromIso) || !isoPattern.test(toIso)) {
    throw new Error("Calendar window must be ISO 8601 datetimes");
  }
  const accessToken = await getValidAccessToken("google_calendar");
  if (!accessToken) {
    throw new Error(
      "Google Calendar is not connected. Use the Connect button on the Calendar page after configuring Google OAuth per SETUP.md.",
    );
  }

  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const response = await fetch(`${CALENDAR_API}?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Calendar API error ${response.status}: ${detail.slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as { items?: GoogleCalendarApiEvent[] };
  return (data.items ?? [])
    .map(mapGoogleCalendarEvent)
    .filter((e): e is MappedCalendarEvent => e !== null);
}

export const googleCalendarProvider: CalendarProvider = {
  name: "google_calendar",
  mode: "read_only",
  async listEvents(fromIso, toIso): Promise<CalendarEventInput[]> {
    const events = await fetchGoogleCalendarEvents(fromIso, toIso);
    return events.map((e) => ({
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location ?? undefined,
      description: e.description ?? undefined,
    }));
  },
};
