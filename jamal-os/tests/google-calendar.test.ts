import { describe, expect, test } from "vitest";
import { mapGoogleCalendarEvent } from "../src/lib/calendar/google-mapper";

describe("mapGoogleCalendarEvent", () => {
  test("maps a timed event to local wall-clock stamps", () => {
    const mapped = mapGoogleCalendarEvent({
      id: "ev_1",
      summary: "Pulse AI demo with Bright Smile",
      location: "Video call",
      start: { dateTime: "2026-06-15T09:30:00+01:00" },
      end: { dateTime: "2026-06-15T10:00:00+01:00" },
    });
    expect(mapped).toEqual({
      externalId: "ev_1",
      title: "Pulse AI demo with Bright Smile",
      start: "2026-06-15T09:30",
      end: "2026-06-15T10:00",
      location: "Video call",
      description: null,
    });
  });

  test("maps an all-day event onto its start day", () => {
    const mapped = mapGoogleCalendarEvent({
      id: "ev_2",
      summary: "BPP exam",
      start: { date: "2026-06-20" },
      end: { date: "2026-06-21" },
    });
    expect(mapped?.start).toBe("2026-06-20T00:00");
    expect(mapped?.end).toBe("2026-06-20T23:59");
  });

  test("titles untitled events honestly", () => {
    const mapped = mapGoogleCalendarEvent({
      id: "ev_3",
      start: { dateTime: "2026-06-15T09:00:00Z" },
      end: { dateTime: "2026-06-15T09:30:00Z" },
    });
    expect(mapped?.title).toBe("(untitled event)");
  });

  test("skips cancelled events and events without id or start", () => {
    expect(
      mapGoogleCalendarEvent({
        id: "ev_4",
        status: "cancelled",
        start: { dateTime: "2026-06-15T09:00:00Z" },
        end: { dateTime: "2026-06-15T09:30:00Z" },
      }),
    ).toBeNull();
    expect(mapGoogleCalendarEvent({ summary: "no id" })).toBeNull();
    expect(mapGoogleCalendarEvent({ id: "ev_5", summary: "no start" })).toBeNull();
  });
});
