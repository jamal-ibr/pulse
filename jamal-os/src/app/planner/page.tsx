import { Card, CardTitle, Badge, buttonClass } from "@/components/ui";
import { planDay } from "@/lib/services/planner";
import { db, schema } from "@/db/client";
import { and, gte, lte, asc } from "drizzle-orm";
import { todayIso, formatTime } from "@/lib/dates";
import { createBlocksAction } from "./actions";

export const dynamic = "force-dynamic";

const KIND_TONES: Record<string, "good" | "info" | "warn" | "neutral" | "danger"> = {
  outreach: "danger",
  deep_work: "info",
  training: "good",
  salah: "neutral",
  shutdown: "warn",
};

export default async function PlannerPage() {
  const today = todayIso();
  const plan = await planDay();
  const existing = await db.query.calendarEvents.findMany({
    where: and(
      gte(schema.calendarEvents.start, `${today}T00:00`),
      lte(schema.calendarEvents.start, `${today}T23:59`),
    ),
    orderBy: asc(schema.calendarEvents.start),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Plan my day</h1>
          <p className="text-xs text-ink-faint">
            Salah anchors first. Outreach before polish. One protected deep work block.
          </p>
        </div>
        <form action={createBlocksAction}>
          <button className={buttonClass}>Create blocks locally</button>
        </form>
      </div>

      {plan.warnings.length > 0 && (
        <div className="space-y-2">
          {plan.warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-sm text-warn">
              {warning}
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Drafted plan</CardTitle>
        <div className="mt-3 space-y-1.5">
          {plan.blocks.map((block, index) => (
            <div key={index} className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-ink-dim">
                {block.start} - {block.end}
              </span>
              <span className="min-w-0 flex-1 truncate">{block.title}</span>
              <Badge tone={KIND_TONES[block.kind] ?? "neutral"}>{block.kind.replace("_", " ")}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-edge pt-2 text-[11px] text-ink-faint">
          Creating blocks writes to the local calendar only. External calendar writes always require explicit confirmation and a connected account.
        </p>
      </Card>

      <Card>
        <CardTitle>Existing events today</CardTitle>
        <div className="mt-3 space-y-1.5">
          {existing.length === 0 && <div className="text-sm text-ink-dim">No events yet.</div>}
          {existing.map((event) => (
            <div key={event.id} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 tabular-nums text-ink-dim">{formatTime(event.start)}</span>
              <span className="truncate">{event.title}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Birmingham prayer times (static timetable)</CardTitle>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          {Object.entries(plan.prayerTimes).map(([name, time]) => (
            <div key={name} className="rounded-lg bg-bg p-2">
              <div className="text-sm font-semibold tabular-nums">{time}</div>
              <div className="text-[11px] capitalize text-ink-faint">{name}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Approximate mid-month values. Upgrade path to calculated times documented in DECISIONS.md.
        </p>
      </Card>
    </div>
  );
}
