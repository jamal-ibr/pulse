import { db, schema } from "@/db/client";
import { asc, gte, desc } from "drizzle-orm";
import { Card, CardTitle, Badge, ProgressBar, EmptyState, inputClass, buttonGhostClass } from "@/components/ui";
import { daysAgoIso } from "@/lib/dates";
import { getWeekHabitSummary } from "@/lib/services/habits";
import { logPages, saveLesson, setStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReadingPage() {
  const books = await db.query.readingList.findMany({ orderBy: asc(schema.readingList.status) });
  const recentLogs = await db.query.readingLogs.findMany({
    where: gte(schema.readingLogs.date, daysAgoIso(28)),
    orderBy: desc(schema.readingLogs.date),
  });
  const habits = await getWeekHabitSummary();

  const pagesThisWeek = recentLogs
    .filter((l) => l.date >= daysAgoIso(7))
    .reduce((sum, l) => sum + l.pages, 0);
  const pagesPerWeek = Math.round(recentLogs.reduce((sum, l) => sum + l.pages, 0) / 4);

  const attentionWarning = pagesThisWeek < 20 && habits.phoneHoursAvg > 4;
  const reading = books.filter((b) => b.status === "reading");
  const queued = books.filter((b) => b.status === "queued");
  const done = books.filter((b) => b.status === "done");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Reading</h1>
        <p className="text-xs text-ink-faint">Attention is rebuilt page by page.</p>
      </div>

      {attentionWarning && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-sm text-warn">
          Attention is being spent, not trained. {pagesThisWeek} pages this week against {habits.phoneHoursAvg.toFixed(1)}h average phone use.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-2xl font-bold tabular-nums">{pagesThisWeek}</div>
          <div className="text-xs text-ink-dim">Pages this week</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold tabular-nums">{pagesPerWeek}</div>
          <div className="text-xs text-ink-dim">Pages/week (4w avg)</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold tabular-nums">{done.length}</div>
          <div className="text-xs text-ink-dim">Books finished</div>
        </Card>
      </div>

      <Card>
        <CardTitle>Currently reading</CardTitle>
        <div className="mt-3 space-y-3">
          {reading.length === 0 && <EmptyState title="Nothing in progress" hint="Pick one from the queue." />}
          {reading.map((book) => (
            <div key={book.id} className="rounded-lg border border-edge bg-bg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{book.title}</div>
                  <div className="text-xs text-ink-faint">{book.author} · {book.pillarKey}</div>
                </div>
                <span className="text-xs tabular-nums text-ink-dim">
                  {book.pagesRead}/{book.pagesTotal ?? "?"}
                </span>
              </div>
              {book.pagesTotal && (
                <div className="mt-2">
                  <ProgressBar value={book.pagesRead} max={book.pagesTotal} />
                </div>
              )}
              <form action={logPages} className="mt-2 flex gap-2">
                <input type="hidden" name="bookId" value={book.id} />
                <input name="pages" type="number" min={1} placeholder="Pages read" className={`${inputClass} max-w-32 py-1 text-xs`} />
                <button className={buttonGhostClass}>Log</button>
              </form>
              <form action={saveLesson} className="mt-2 grid grid-cols-2 gap-2">
                <input type="hidden" name="bookId" value={book.id} />
                <input name="keyLessons" defaultValue={book.keyLessons ?? ""} placeholder="Key lesson" className={`${inputClass} py-1 text-xs`} />
                <div className="flex gap-2">
                  <input name="actionTaken" defaultValue={book.actionTaken ?? ""} placeholder="Action taken" className={`${inputClass} py-1 text-xs`} />
                  <button className={buttonGhostClass}>Save</button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Queue ({queued.length})</CardTitle>
        <div className="mt-3 space-y-1.5">
          {queued.map((book) => (
            <div key={book.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="truncate">{book.title}</span>
                <span className="ml-2 text-xs text-ink-faint">{book.author}</span>
              </div>
              <form action={setStatus}>
                <input type="hidden" name="bookId" value={book.id} />
                <input type="hidden" name="status" value="reading" />
                <button className={buttonGhostClass}>Start</button>
              </form>
            </div>
          ))}
        </div>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardTitle>Finished</CardTitle>
          <div className="mt-3 space-y-2">
            {done.map((book) => (
              <div key={book.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span>{book.title}</span>
                  <Badge tone="good">done</Badge>
                </div>
                {book.keyLessons && <p className="mt-0.5 text-xs text-ink-dim">Lesson: {book.keyLessons}</p>}
                {book.actionTaken && <p className="text-xs text-accent">Action: {book.actionTaken}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
