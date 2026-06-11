import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass } from "@/components/ui";
import { projectStalled } from "@/lib/avoidance";
import { updateNextAction, logActivity } from "./actions";
import { addTask, completeTask, deferTaskAction } from "../../tasks/actions";
import { buttonGhostClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) notFound();

  const tasks = await db.query.tasks.findMany({
    where: eq(schema.tasks.projectId, projectId),
    orderBy: desc(schema.tasks.scariness),
  });
  const activity = await db.query.projectActivity.findMany({
    where: eq(schema.projectActivity.projectId, projectId),
    orderBy: desc(schema.projectActivity.createdAt),
  });
  const stalled = projectStalled(
    { id: project.id, name: project.name, lastActivityAt: project.lastActivityAt },
    new Date(),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="mt-1 text-xs text-ink-dim">{project.description}</p>
        </div>
        <div className="flex gap-1.5">
          {stalled && <Badge tone="danger">Stalled 7+ days</Badge>}
          <Badge tone={project.status === "active" ? "good" : "neutral"}>{project.status}</Badge>
        </div>
      </div>

      <Card>
        <CardTitle>Next action</CardTitle>
        <form action={updateNextAction} className="mt-3 flex gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="nextAction" defaultValue={project.nextAction} className={inputClass} />
          <button className={buttonClass}>Save</button>
        </form>
        <div className="mt-2 text-[11px] text-ink-faint">
          Last activity: {project.lastActivityAt ?? "never"}
        </div>
      </Card>

      <Card>
        <CardTitle>Tasks ({tasks.filter((t) => t.status !== "done").length} open)</CardTitle>
        <div className="mt-3 space-y-2">
          {tasks.length === 0 && <EmptyState title="No tasks yet" />}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2">
              <div className="min-w-0">
                <span className={`text-sm ${t.status === "done" ? "text-ink-faint line-through" : ""}`}>{t.title}</span>
                {t.deferCount > 0 && t.status !== "done" && (
                  <span className="ml-2 text-[11px] text-warn">deferred {t.deferCount}x</span>
                )}
              </div>
              {t.status !== "done" && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={t.scariness >= 4 ? "danger" : "neutral"}>S{t.scariness}</Badge>
                  <form action={completeTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={buttonGhostClass}>Done</button>
                  </form>
                  <form action={deferTaskAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={buttonGhostClass}>Defer</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
        <form action={addTask} className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-3 md:grid-cols-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="pillarKey" value={project.pillarKey} />
          <input type="hidden" name="energy" value="shallow" />
          <input name="title" required placeholder="New task" className={`${inputClass} col-span-2`} />
          <select name="scariness" required className={inputClass} defaultValue="">
            <option value="" disabled>Scariness</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>S{n}</option>)}
          </select>
          <button className={buttonClass}>Add task</button>
        </form>
      </Card>

      <Card>
        <CardTitle>Activity log</CardTitle>
        <form action={logActivity} className="mt-3 flex gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="activity" required placeholder="Log progress (this resets the stall timer)" className={inputClass} />
          <button className={buttonClass}>Log</button>
        </form>
        <div className="mt-3 space-y-1.5">
          {activity.length === 0 && <div className="text-xs text-ink-faint">No activity logged.</div>}
          {activity.slice(0, 15).map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-dim">{a.activity}</span>
              <span className="text-[11px] text-ink-faint">{a.createdAt.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
