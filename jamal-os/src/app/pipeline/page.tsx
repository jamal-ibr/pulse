import { Card, CardTitle, Stat, Badge, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { getPipeline, getPipelineMetrics, STAGES } from "@/lib/services/pipeline";
import { pulseHardRuleTriggered, PULSE_HARD_RULE_MESSAGE } from "@/lib/avoidance";
import { todayIso } from "@/lib/dates";
import { addPractice, moveStage, logOutreach, setFollowUp } from "./actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const rows = await getPipeline();
  const metrics = await getPipelineMetrics();
  const today = todayIso();
  const hardRule = pulseHardRuleTriggered(metrics.contactedCount);

  const byStage = STAGES.map((stage) => ({
    stage,
    items: rows.filter((r) => r.stage === stage),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Pulse AI Pipeline</h1>
        <p className="text-xs text-ink-faint">
          AI enquiry handling for dental and vet practices. £2,500 setup plus £500 to £1,200 per month.
        </p>
      </div>

      {hardRule && (
        <div className="rounded-xl border border-red-900 bg-red-950/60 p-3 text-sm font-medium text-danger">
          {PULSE_HARD_RULE_MESSAGE}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Card className="col-span-3 border-accent/40 lg:col-span-2">
          <Stat
            label="Outreach sent this week (primary metric)"
            value={metrics.outreachThisWeek}
            tone={metrics.outreachThisWeek === 0 ? "danger" : "good"}
          />
        </Card>
        <Card><Stat label="Contacted" value={metrics.contactedCount} tone={metrics.contactedCount < 5 ? "danger" : "good"} /></Card>
        <Card><Stat label="Reply rate" value={`${Math.round(metrics.replyRate * 100)}%`} /></Card>
        <Card><Stat label="Demos booked" value={metrics.demosBooked} /></Card>
        <Card>
          <Stat
            label="Days since outreach"
            value={metrics.daysSinceLastOutreach ?? "Never"}
            tone={(metrics.daysSinceLastOutreach ?? 99) >= 3 ? "danger" : "good"}
          />
        </Card>
      </div>

      <Card>
        <CardTitle>Quick add practice</CardTitle>
        <form action={addPractice} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <input name="practiceName" required placeholder="Practice name" className={`${inputClass} col-span-2`} />
          <select name="vertical" className={inputClass} defaultValue="dental">
            <option value="dental">dental</option>
            <option value="vet">vet</option>
          </select>
          <input name="source" placeholder="Source" className={inputClass} />
          <button className={buttonClass}>Add</button>
        </form>
      </Card>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {byStage.map(({ stage, items }) => (
          <div key={stage} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">{stage}</span>
              <span className="text-xs text-ink-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-edge p-3 text-center text-[11px] text-ink-faint">
                  Empty
                </div>
              )}
              {items.map((r) => {
                const overdue = r.nextFollowUp != null && r.nextFollowUp < today && !["won", "lost"].includes(r.stage);
                return (
                  <div key={r.id} className="rounded-lg border border-edge bg-panel p-3">
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-medium leading-tight">{r.practiceName}</div>
                      <Badge tone={r.vertical === "dental" ? "info" : "good"}>{r.vertical}</Badge>
                    </div>
                    {overdue && <div className="mt-1.5"><Badge tone="danger">Follow-up overdue</Badge></div>}
                    <div className="mt-1.5 text-[11px] text-ink-faint">
                      Last touch: {r.lastTouch ?? "never"}
                      {r.nextFollowUp && <> · Next: {r.nextFollowUp}</>}
                    </div>
                    {r.notes && <p className="mt-1.5 text-xs text-ink-dim">{r.notes}</p>}
                    <div className="mt-2 space-y-1.5">
                      <form action={moveStage} className="flex gap-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <select name="stage" defaultValue={r.stage} className={`${inputClass} py-1 text-xs`}>
                          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className={buttonGhostClass}>Move</button>
                      </form>
                      <div className="flex gap-1.5">
                        <form action={logOutreach}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className={buttonGhostClass}>Log outreach</button>
                        </form>
                        <form action={setFollowUp} className="flex gap-1">
                          <input type="hidden" name="id" value={r.id} />
                          <input name="nextFollowUp" type="date" className={`${inputClass} py-1 text-[11px]`} />
                          <button className={buttonGhostClass}>Set</button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
