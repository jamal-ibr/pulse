import { Card, CardTitle, Badge, ProgressBar, inputClass, buttonClass } from "@/components/ui";
import { getRecentHabitLogs, getRecentSleep, getLogForDate, getSleepForDate, complianceForLog } from "@/lib/services/habits";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { todayIso } from "@/lib/dates";
import { TARGETS, proteinMet, kcalInBand, phoneTargetMet, lightsOutLate } from "@/lib/targets";
import { saveDayLog } from "./actions";

export const dynamic = "force-dynamic";

const TRAINING_OPTIONS = ["stairmaster", "skipping", "strength", "football", "muay_thai", "mobility", "rest"];

export default async function HabitsPage() {
  const today = todayIso();
  const log = await getLogForDate(today);
  const sleep = await getSleepForDate(today);
  const weight = await db.query.weightLogs.findFirst({ where: eq(schema.weightLogs.date, today) });
  const weekLogs = await getRecentHabitLogs(7);
  const weekSleep = await getRecentSleep(7);

  const sleepByDate = new Map(weekSleep.map((s) => [s.date, s]));
  const todayCompliance = log ? complianceForLog(log, sleep) : null;

  // Streaks: consecutive days back from yesterday meeting each target.
  const streak = (check: (l: (typeof weekLogs)[number]) => boolean) => {
    let count = 0;
    const sorted = [...weekLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const l of sorted) {
      if (l.date === today) continue;
      if (check(l)) count++;
      else break;
    }
    return count;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Habits</h1>
        <p className="text-xs text-ink-faint">Log the full day in under 30 seconds.</p>
      </div>

      <Card>
        <CardTitle>Log today</CardTitle>
        <form action={saveDayLog} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <input type="hidden" name="date" value={today} />
          <label className="space-y-1 text-xs text-ink-dim">
            Salah (of 5)
            <input name="salahCount" type="number" min={0} max={5} defaultValue={log?.salahCount ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Protein (g)
            <input name="proteinG" type="number" min={0} defaultValue={log?.proteinG ?? ""} className={inputClass} placeholder="170+" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Calories
            <input name="kcal" type="number" min={0} defaultValue={log?.kcal ?? ""} className={inputClass} placeholder="1700-2000" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Training
            <select name="trainingSession" defaultValue={log?.trainingSession ?? ""} className={inputClass}>
              <option value="">None logged</option>
              {TRAINING_OPTIONS.map((option) => (
                <option key={option} value={option}>{option.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Phone (hours)
            <input name="phoneScreenHours" type="number" step="0.1" min={0} defaultValue={log?.phoneScreenHours ?? ""} className={inputClass} placeholder="under 4" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Deep work blocks
            <input name="deepWorkBlocks" type="number" min={0} defaultValue={log?.deepWorkBlocks ?? ""} className={inputClass} placeholder="2" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Pages read
            <input name="pagesRead" type="number" min={0} defaultValue={log?.pagesRead ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Water (L)
            <input name="waterLitres" type="number" step="0.1" min={0} defaultValue={log?.waterLitres ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Sleep (hours)
            <input name="sleepHours" type="number" step="0.1" min={0} defaultValue={sleep?.sleepHours ?? ""} className={inputClass} placeholder="7+" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Lights out (HH:MM)
            <input name="lightsOutTime" defaultValue={sleep?.lightsOutTime ?? ""} className={inputClass} placeholder="23:00" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Wake (HH:MM)
            <input name="wakeTime" defaultValue={sleep?.wakeTime ?? ""} className={inputClass} placeholder="06:30" />
          </label>
          <label className="space-y-1 text-xs text-ink-dim">
            Weight (kg)
            <input name="weightKg" type="number" step="0.1" min={0} defaultValue={weight?.weightKg ?? ""} className={inputClass} />
          </label>
          <label className="col-span-2 space-y-1 text-xs text-ink-dim md:col-span-3">
            Notes
            <input name="notes" defaultValue={log?.notes ?? ""} className={inputClass} placeholder="Optional" />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs text-ink-dim">
            <input type="checkbox" name="monThuFast" defaultChecked={log?.monThuFast ?? false} className="h-4 w-4 accent-cyan-400" />
            Mon/Thu fast
          </label>
          <div className="col-span-2 md:col-span-4">
            <button type="submit" className={`${buttonClass} w-full md:w-auto`}>Save all</button>
          </div>
        </form>
      </Card>

      {todayCompliance && (
        <Card>
          <CardTitle>Today completion</CardTitle>
          <div className="mt-3 space-y-2">
            <ProgressBar value={todayCompliance.metCount} max={todayCompliance.totalCount} tone={todayCompliance.metCount >= 5 ? "good" : "warn"} />
            <div className="text-xs text-ink-dim">{todayCompliance.metCount} of {todayCompliance.totalCount} targets met</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries({ Salah: todayCompliance.salah, Protein: todayCompliance.protein, Calories: todayCompliance.kcal, Phone: todayCompliance.phone, "Deep work": todayCompliance.deepWork, Sleep: todayCompliance.sleep, "Lights out": todayCompliance.lightsOut }).map(([label, met]) => (
                <Badge key={label} tone={met ? "good" : "neutral"}>{label}</Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-2xl font-bold text-accent">{streak((l) => proteinMet(l.proteinG))}</div>
          <div className="text-xs text-ink-dim">Protein streak (days)</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-accent">{streak((l) => kcalInBand(l.kcal))}</div>
          <div className="text-xs text-ink-dim">Calorie band streak</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-accent">{streak((l) => phoneTargetMet(l.phoneScreenHours))}</div>
          <div className="text-xs text-ink-dim">Phone target streak</div>
        </Card>
      </div>

      <Card>
        <CardTitle>Last 7 days</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Date</th>
                <th className="py-1.5 pr-2 font-medium">Salah</th>
                <th className="py-1.5 pr-2 font-medium">Protein</th>
                <th className="py-1.5 pr-2 font-medium">Kcal</th>
                <th className="py-1.5 pr-2 font-medium">Training</th>
                <th className="py-1.5 pr-2 font-medium">Phone</th>
                <th className="py-1.5 pr-2 font-medium">Deep</th>
                <th className="py-1.5 pr-2 font-medium">Lights out</th>
              </tr>
            </thead>
            <tbody>
              {weekLogs.map((l) => {
                const s = sleepByDate.get(l.date);
                return (
                  <tr key={l.date} className="border-t border-edge">
                    <td className="py-1.5 pr-2 text-ink-dim">{l.date.slice(5)}</td>
                    <td className={`py-1.5 pr-2 ${(l.salahCount ?? 0) >= 5 ? "text-accent" : "text-warn"}`}>{l.salahCount ?? "-"}/5</td>
                    <td className={`py-1.5 pr-2 ${proteinMet(l.proteinG) ? "text-accent" : "text-warn"}`}>{l.proteinG ?? "-"}g</td>
                    <td className={`py-1.5 pr-2 ${kcalInBand(l.kcal) ? "text-accent" : "text-warn"}`}>{l.kcal ?? "-"}</td>
                    <td className="py-1.5 pr-2 text-ink-dim">{l.trainingSession?.replace("_", " ") ?? "-"}</td>
                    <td className={`py-1.5 pr-2 ${phoneTargetMet(l.phoneScreenHours) ? "text-accent" : "text-danger"}`}>{l.phoneScreenHours ?? "-"}h</td>
                    <td className={`py-1.5 pr-2 ${(l.deepWorkBlocks ?? 0) >= TARGETS.DEEP_WORK_BLOCKS ? "text-accent" : "text-warn"}`}>{l.deepWorkBlocks ?? "-"}</td>
                    <td className={`py-1.5 pr-2 ${s && lightsOutLate(s.lightsOutTime) ? "text-danger" : "text-ink-dim"}`}>{s?.lightsOutTime ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
