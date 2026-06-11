import Link from "next/link";
import { db, schema } from "@/db/client";
import { asc, ne, eq } from "drizzle-orm";
import { Card, Badge, EmptyState } from "@/components/ui";
import { projectStalled } from "@/lib/avoidance";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await db.query.projects.findMany({
    orderBy: asc(schema.projects.id),
  });
  const openTasks = await db.query.tasks.findMany({
    where: ne(schema.tasks.status, "done"),
  });
  const now = new Date();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Projects</h1>
        <p className="text-xs text-ink-faint">Every project has one explicit next action.</p>
      </div>

      {projects.length === 0 && <EmptyState title="No projects" />}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const stalled = projectStalled({ id: p.id, name: p.name, lastActivityAt: p.lastActivityAt }, now);
          const taskCount = openTasks.filter((t) => t.projectId === p.id).length;
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold">{p.name}</h2>
                  <div className="flex gap-1.5">
                    {stalled && <Badge tone="danger">Stalled</Badge>}
                    <Badge tone={p.status === "active" ? "good" : "neutral"}>{p.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-dim">
                  Next action: <span className="text-ink">{p.nextAction}</span>
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint">
                  <span>{taskCount} open tasks</span>
                  <span>Last activity: {p.lastActivityAt ?? "never"}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
