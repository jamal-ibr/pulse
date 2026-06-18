import Link from "next/link";
import { getDailyBriefData } from "@/lib/services/daily-brief";
import { Card, CardTitle, Stat, Badge, EmptyState, buttonClass } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { TAKEAWAY_BASELINE } from "@/lib/spending-logic";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDailyBriefData();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Daily Brief</h1>
          <p className="text-xs text-ink-faint">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/planner" className={buttonClass}>
          Plan my day
        </Link>
      </div>

      {data.hardRuleTriggered && (
        <div className="rounded-xl border border-red-900 bg-red-950/60 p-4">
          <div className="text-sm font-semibold text-danger">{data.hardRuleMessage}</div>
          <div className="mt-1 text-xs text-red-300/70">
            Contacted: {data.pipeline.contactedCount}/5 minimum. Outreach sent this week:{" "}
            {data.pipeline.outreachThisWeek}.{" "}
            <Link href="/pipeline" className="underline">
              Open the pipeline
            </Link>{" "}
            and send before anything else.
          </div>
        </div>
      )}

      <Card>
        <CardTitle>Brief</CardTitle>
        <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
          {data.briefText}
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-wider text-ink-faint">
          Provider: {data.briefProvider}
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Outreach this week"
            value={data.pipeline.outreachThisWeek}
            tone={data.pipeline.outreachThisWeek === 0 ? "danger" : "good"}
            hint="The primary metric"
          />
          <Stat
            label="Contacted practices"
            value={`${data.pipeline.contactedCount}/5`}
            tone={data.pipeline.contactedCount < 5 ? "danger" : "good"}
            hint={
              data.pipeline.followUpsOverdue > 0
                ? `${data.pipeline.followUpsOverdue} follow-ups overdue`
                : undefined
            }
          />
          <Stat
            label="Takeaway, rolling 30d"
            value={data.takeawayRolling30}
            tone={data.takeawayRolling30 >= 8 ? "danger" : data.takeawayRolling30 >= 5 ? "warn" : "good"}
            hint={`Baseline was ${TAKEAWAY_BASELINE.per30Days}`}
          />
          <Stat
            label="Latest weight"
            value={data.weightTrend[0] ? `${data.weightTrend[0].weightKg}kg` : "Unlogged"}
            hint="Phase 1 target: 82kg"
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle href="/tasks">Scary tasks</CardTitle>
          <div className="mt-3 space-y-2">
            {data.scaryTasks.length === 0 && (
              <EmptyState title="No open tasks" hint="Add what you are avoiding." />
            )}
            {data.scaryTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="text-[11px] text-ink-faint">
                    {t.deferCount > 0 ? `Deferred ${t.deferCount}x` : "Not yet deferred"}
                  </div>
                </div>
                <Badge tone={t.scariness >= 4 ? "danger" : t.scariness >= 3 ? "warn" : "neutral"}>
                  Scary {t.scariness}/5
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle href="/calendar">Today</CardTitle>
          <div className="mt-3 space-y-2">
            {data.todayEvents.length === 0 && (
              <EmptyState title="No events today" hint="Use Plan my day to block time." />
            )}
            {data.todayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-ink-dim">{formatTime(e.start)}</span>
                <span className="truncate">{e.title}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>

    </div>
  );
}
