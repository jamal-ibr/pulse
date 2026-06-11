// SCAFFOLD: Google Calendar provider. Not yet implemented.
//
// Rules baked into this design (see docs/privacy.md):
// - Read-write is allowed, but createEvent must only run after an
//   explicit confirmation click in the UI. No automatic external writes.
// - OAuth tokens must be encrypted at rest with LOCAL_ENCRYPTION_KEY.
// - Every external write goes to audit_logs with confirmed=true.
//
// Setup steps are documented in SETUP.md.

import type { CalendarProvider, CalendarEventInput } from "./types";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleCalendarProvider: CalendarProvider = {
  name: "google_calendar",
  mode: "read_only",
  async listEvents(): Promise<CalendarEventInput[]> {
    throw new Error(
      "Google Calendar provider is scaffolded but not implemented. Configure OAuth per SETUP.md. Local and mock calendars work fully meanwhile.",
    );
  },
};
