// Calendar connector abstraction. Local events live in SQLite. The
// Google provider is a scaffold; external writes always require explicit
// click confirmation in the UI.

export interface CalendarEventInput {
  title: string;
  start: string; // ISO datetime
  end: string;
  location?: string;
  description?: string;
}

export interface CalendarProvider {
  name: string;
  mode: "mock" | "read_only" | "write_enabled";
  listEvents(fromIso: string, toIso: string): Promise<CalendarEventInput[]>;
  // createEvent must only ever be called after explicit user confirmation.
  createEvent?(event: CalendarEventInput): Promise<string>;
}
