import { db, schema } from "@/db/client";
import { gte, asc } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass } from "@/components/ui";
import { todayIso, formatTime, formatShort } from "@/lib/dates";
import { addLocalEvent } from "./actions";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = todayIso();
  const events = await db.query.calendarEvents.findMany({
    where: gte(schema.calendarEvents.start, `${today}T00:00`),
    orderBy: asc(schema.calendarEvents.start),
  });

  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const day = event.start.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(event);
  }

  // Overcommitment: any day with more than 10 scheduled hours.
  const overcommitted = new Set(
    [...byDay.entries()]
      .filter(([, dayEvents]) => {
        const minutes = dayEvents.reduce((sum, e) => {
          const start = new Date(e.start).getTime();
          const end = new Date(e.end).getTime();
          return sum + Math.max(0, (end - start) / 60000);
        }, 0);
        return minutes > 600;
      })
      .map(([day]) => day),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Calendar</h1>
        <p className="text-xs text-ink-faint">
          Local and mock events. External calendar writes require a connected Google account and explicit confirmation. See Settings.
        </p>
      </div>

      <Card>
        <CardTitle>Add local event</CardTitle>
        <form action={addLocalEvent} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <input name="title" required placeholder="Title" className={`${inputClass} col-span-2`} />
          <input name="date" type="date" defaultValue={today} required className={inputClass} />
          <input name="start" type="time" required className={inputClass} />
          <input name="end" type="time" required className={inputClass} />
          <button className={buttonClass}>Add locally</button>
        </form>
      </Card>

      {byDay.size === 0 && <EmptyState title="No upcoming events" hint="Use Plan my day or add one above." />}

      {[...byDay.entries()].slice(0, 7).map(([day, dayEvents]) => (
        <Card key={day}>
          <div className="flex items-center gap-2">
            <CardTitle>{day === today ? "Today" : formatShort(day)}</CardTitle>
            {overcommitted.has(day) && <Badge tone="danger">Overcommitted (10h+)</Badge>}
          </div>
          <div className="mt-3 space-y-1.5">
            {dayEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-ink-dim">
                  {formatTime(event.start)} - {formatTime(event.end)}
                </span>
                <span className="min-w-0 flex-1 truncate">{event.title}</span>
                <Badge tone={event.sourceProvider === "local" ? "info" : "neutral"}>
                  {event.sourceProvider}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
