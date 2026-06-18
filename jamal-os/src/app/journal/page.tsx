import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { Card, Badge, EmptyState, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { todayIso, formatShort } from "@/lib/dates";
import { addJournalEntry, deleteJournalEntry } from "./actions";
import { MOODS } from "./moods";

export const dynamic = "force-dynamic";

const MOOD_TONES: Record<string, "good" | "warn" | "danger" | "neutral" | "info"> = {
  steady: "good",
  focused: "good",
  grateful: "info",
  frustrated: "warn",
  drained: "warn",
  anxious: "danger",
};

export default async function JournalPage() {
  const today = todayIso();
  const entries = await db.query.journal.findMany({
    orderBy: desc(schema.journal.date),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Journal</h1>
        <p className="text-xs text-ink-faint">
          Private, local only. Never sent to AI. Write what actually happened.
        </p>
      </div>

      <Card>
        <form action={addJournalEntry} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              name="date"
              type="date"
              defaultValue={today}
              required
              className={`${inputClass} w-auto`}
            />
            <select name="mood" defaultValue="" className={`${inputClass} w-auto`}>
              <option value="">No mood</option>
              {MOODS.map((mood) => (
                <option key={mood} value={mood}>
                  {mood}
                </option>
              ))}
            </select>
          </div>
          <textarea
            name="content"
            required
            rows={4}
            placeholder="What happened, what you avoided, what you did anyway."
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            Save entry
          </button>
        </form>
      </Card>

      {entries.length === 0 && (
        <EmptyState
          title="No entries yet"
          hint="One honest paragraph a day beats a perfect system."
        />
      )}

      {entries.map((entry) => (
        <Card key={entry.id}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-ink-dim">
                {entry.date === today ? "Today" : formatShort(entry.date)}
              </span>
              {entry.mood && (
                <Badge tone={MOOD_TONES[entry.mood] ?? "neutral"}>{entry.mood}</Badge>
              )}
            </div>
            <form action={deleteJournalEntry}>
              <input type="hidden" name="id" value={entry.id} />
              <button type="submit" className={buttonGhostClass}>
                Delete
              </button>
            </form>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
            {entry.content}
          </p>
        </Card>
      ))}
    </div>
  );
}
