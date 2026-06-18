import Link from "next/link";
import { db, schema } from "@/db/client";
import { asc, desc } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { isAvoided, isOverdue } from "@/lib/task-logic";
import { todayIso } from "@/lib/dates";
import { addTask, deferTaskAction, completeTask, setTaskStatus } from "./actions";

export const dynamic = "force-dynamic";

const PILLAR_OPTIONS = ["faith", "body", "mind", "career", "wealth", "character", "systems"];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ pillar?: string; project?: string; energy?: string; status?: string; scary?: string }>;
}) {
  const params = await searchParams;
  const today = todayIso();
  const allTasks = await db.query.tasks.findMany({
    orderBy: [asc(schema.tasks.status), desc(schema.tasks.scariness)],
  });
  const projects = await db.query.projects.findMany();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const tasks = allTasks.filter((t) => {
    if (params.pillar && t.pillarKey !== params.pillar) return false;
    if (params.project && String(t.projectId) !== params.project) return false;
    if (params.energy && t.energy !== params.energy) return false;
    if (params.status && t.status !== params.status) return false;
    if (params.scary === "high" && t.scariness < 4) return false;
    return true;
  });

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Tasks</h1>
        <p className="text-xs text-ink-faint">Scariness is required. The scary task is the signal.</p>
      </div>

      <Card>
        <CardTitle>Add task</CardTitle>
        <form action={addTask} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
          <input name="title" required placeholder="Task title" className={`${inputClass} col-span-2`} />
          <select name="pillarKey" className={inputClass} defaultValue="systems">
            {PILLAR_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select name="projectId" className={inputClass} defaultValue="">
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input name="dueDate" type="date" className={inputClass} />
          <select name="energy" className={inputClass} defaultValue="shallow">
            <option value="shallow">shallow</option>
            <option value="deep">deep</option>
          </select>
          <select name="scariness" required className={inputClass} defaultValue="">
            <option value="" disabled>Scariness (required)</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Scary {n}/5</option>)}
          </select>
          <button type="submit" className={buttonClass}>Add</button>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/tasks" className={buttonGhostClass}>All</Link>
        <Link href="/tasks?scary=high" className={buttonGhostClass}>Scary 4+</Link>
        <Link href="/tasks?energy=deep" className={buttonGhostClass}>Deep</Link>
        <Link href="/tasks?status=blocked" className={buttonGhostClass}>Blocked</Link>
        {PILLAR_OPTIONS.map((p) => (
          <Link key={p} href={`/tasks?pillar=${p}`} className={buttonGhostClass}>{p}</Link>
        ))}
      </div>

      <Card>
        <CardTitle>Open ({open.length})</CardTitle>
        <div className="mt-3 space-y-2">
          {open.length === 0 && <EmptyState title="No open tasks match this filter" />}
          {open.map((t) => {
            const avoided = isAvoided(t);
            const overdue = isOverdue(t, today);
            return (
              <div key={t.id} className={`rounded-lg border p-3 ${avoided ? "border-red-900 bg-red-950/30" : "border-edge bg-bg"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      <span>{t.pillarKey}</span>
                      {t.projectId && <span>· {projectName.get(t.projectId)}</span>}
                      {t.dueDate && <span className={overdue ? "text-danger" : ""}>· due {t.dueDate}</span>}
                      <span>· {t.energy}</span>
                      {t.deferCount > 0 && <span className="text-warn">· deferred {t.deferCount}x</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {avoided && <Badge tone="danger">Avoidance</Badge>}
                    {overdue && !avoided && <Badge tone="warn">Overdue</Badge>}
                    <Badge tone={t.scariness >= 4 ? "danger" : t.scariness >= 3 ? "warn" : "neutral"}>S{t.scariness}</Badge>
                    <Badge tone={t.status === "in_progress" ? "info" : "neutral"}>{t.status.replace("_", " ")}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <form action={completeTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={buttonGhostClass}>Done</button>
                  </form>
                  <form action={deferTaskAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={buttonGhostClass}>Defer to tomorrow</button>
                  </form>
                  {t.status !== "in_progress" && (
                    <form action={setTaskStatus}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="in_progress" />
                      <button className={buttonGhostClass}>Start</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardTitle>Recently done</CardTitle>
          <div className="mt-3 space-y-1.5">
            {done.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm text-ink-dim">
                <span className="line-through">{t.title}</span>
                <span className="text-xs text-ink-faint">{t.completedAt?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
