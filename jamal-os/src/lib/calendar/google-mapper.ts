// Pure mapping from Google Calendar API events to the local event
// shape. Separated from the provider so it is unit-testable.

export interface GoogleCalendarApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface MappedCalendarEvent {
  externalId: string;
  title: string;
  start: string; // local "YYYY-MM-DDTHH:MM", matching calendar_events
  end: string;
  location: string | null;
  description: string | null;
}

function localStamp(dateTime: string): string {
  // "2026-06-12T09:00:00+01:00" -> "2026-06-12T09:00" (wall-clock time)
  return dateTime.slice(0, 16);
}

export function mapGoogleCalendarEvent(
  event: GoogleCalendarApiEvent,
): MappedCalendarEvent | null {
  if (!event.id || event.status === "cancelled") return null;

  let start: string;
  let end: string;
  if (event.start?.dateTime && event.end?.dateTime) {
    start = localStamp(event.start.dateTime);
    end = localStamp(event.end.dateTime);
  } else if (event.start?.date) {
    // All-day event. Google's end date is exclusive; show the event on
    // its start day rather than spilling into the next.
    start = `${event.start.date}T00:00`;
    end = `${event.start.date}T23:59`;
  } else {
    return null;
  }

  return {
    externalId: event.id,
    title: event.summary?.trim() || "(untitled event)",
    start,
    end,
    location: event.location ?? null,
    description: event.description ?? null,
  };
}
