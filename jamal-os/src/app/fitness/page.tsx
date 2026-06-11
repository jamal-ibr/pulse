import { Card, CardTitle, Stat, Badge, EmptyState } from "@/components/ui";
import { db, schema } from "@/db/client";
import { desc, gte } from "drizzle-orm";
import { daysAgoIso } from "@/lib/dates";
import { getRecentHabitLogs, getWeightTrend } from "@/lib/services/habits";
import { proteinMet, kcalInBand } from "@/lib/targets";

export const dynamic = "force-dynamic";

export default async function FitnessPage() {
  const weights = await getWeightTrend(30);
  const sessions = await db.query.trainingSessions.findMany({
    where: gte(schema.trainingSessions.date, daysAgoIso(14)),
    orderBy: desc(schema.trainingSessions.date),
  });
  const injuries = await db.query.injuryNotes.findMany({
    orderBy: desc(schema.injuryNotes.date),
  });
  const weekLogs = await getRecentHabitLogs(7);

  const latest = weights[0]?.weightKg ?? null;
  const oldest = weights[weights.length - 1]?.weightKg ?? null;
  const delta = latest != null && oldest != null ? Math.round((latest - oldest) * 10) / 10 : null;
  const proteinDays = weekLogs.filter((l) => proteinMet(l.proteinG)).length;
  const kcalDays = weekLogs.filter((l) => kcalInBand(l.kcal)).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Fitness</h1>
        <p className="text-xs text-ink-faint">
          Phase 1: cut to 82kg. Stockholm Half Marathon, late August 2026, gated behind clearance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <Stat label="Current weight" value={latest != null ? `${latest}kg` : "Unlogged"} hint="Phase 1 target: 82kg" />
        </Card>
        <Card>
          <Stat
            label="30-day change"
            value={delta != null ? `${delta > 0 ? "+" : ""}${delta}kg` : "-"}
            tone={delta != null && delta < 0 ? "good" : "warn"}
          />
        </Card>
        <Card>
          <Stat label="Protein days (7d)" value={`${proteinDays}/7`} tone={proteinDays >= 5 ? "good" : "danger"} hint="The weakest variable" />
        </Card>
        <Card>
          <Stat label="Kcal band days (7d)" value={`${kcalDays}/7`} tone={kcalDays >= 5 ? "good" : "warn"} />
        </Card>
      </div>

      <Card>
        <CardTitle>Injury status</CardTitle>
        <div className="mt-3 space-y-2">
          {injuries.length === 0 && <EmptyState title="No injury notes" />}
          {injuries.map((note) => (
            <div key={note.id} className="rounded-lg bg-bg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{note.area}</span>
                <Badge tone={note.status === "cleared" ? "good" : "warn"}>
                  {note.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-dim">{note.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Weight trend (30 days)</CardTitle>
        <div className="mt-3 flex items-end gap-1" style={{ height: 80 }}>
          {[...weights].reverse().map((w) => {
            const min = Math.min(...weights.map((x) => x.weightKg));
            const max = Math.max(...weights.map((x) => x.weightKg));
            const range = max - min || 1;
            const pct = 20 + ((w.weightKg - min) / range) * 80;
            return (
              <div key={w.date} className="flex-1 rounded-t bg-accent/60" style={{ height: `${pct}%` }} title={`${w.date}: ${w.weightKg}kg`} />
            );
          })}
          {weights.length === 0 && <EmptyState title="No weight logged yet" hint="Log weight on the Habits page." />}
        </div>
      </Card>

      <Card>
        <CardTitle>Training (14 days)</CardTitle>
        <div className="mt-3 space-y-1.5">
          {sessions.length === 0 && <EmptyState title="No sessions logged" hint="Boring consistency wins. Log it on Habits." />}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-dim">{s.date.slice(5)}</span>
              <span>{s.type.replace("_", " ")}</span>
              <span className="text-xs text-ink-faint">{s.durationMin ? `${s.durationMin}min` : ""}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-edge pt-2 text-[11px] text-ink-faint">
          Allowed until cleared: stairmaster, weighted skipping, upper-body strength, mobility. No running.
        </p>
      </Card>
    </div>
  );
}
