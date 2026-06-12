import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { getPipelineMetrics } from "@/lib/services/pipeline";
import { pulseHardRuleTriggered } from "@/lib/avoidance";
import { isAfter2230 } from "@/lib/dates";
import { safeSlug } from "@/lib/services/build-queue";
import { addIdea, generatePrompt, dropIdea } from "./actions";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

export default async function BuildQueuePage() {
  const ideas = await db.query.buildQueue.findMany({
    orderBy: desc(schema.buildQueue.createdAt),
  });
  const metrics = await getPipelineMetrics();
  const underTarget = pulseHardRuleTriggered(metrics.contactedCount);
  const lateNight = isAfter2230(new Date());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Build Queue</h1>
        <p className="text-xs text-ink-faint">
          Capture tool ideas without letting them become avoidance.
        </p>
      </div>

      {lateNight && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-sm text-warn">
          Is this avoidance? It will still be a good idea tomorrow.
        </div>
      )}
      {underTarget && (
        <div className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-danger">
          Build queue is secondary. Pulse outreach is the bottleneck. ({metrics.contactedCount}/5 contacted)
        </div>
      )}

      <Card>
        <CardTitle>Add idea</CardTitle>
        <form action={addIdea} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input name="idea" required placeholder="Idea" className={inputClass} />
          <input name="problemItSolves" required placeholder="Problem it solves" className={inputClass} />
          <input name="targetUser" placeholder="Target user" className={inputClass} />
          <input name="scope" placeholder="Scope" className={inputClass} />
          <input name="definitionOfDone" placeholder="Definition of done" className={inputClass} />
          <button className={buttonClass}>Capture</button>
        </form>
      </Card>

      <div className="space-y-3">
        {ideas.length === 0 && <EmptyState title="No ideas captured" hint="Good. Outreach first." />}
        {ideas.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.idea}</span>
                  <Badge tone={item.status === "dropped" ? "neutral" : item.status === "scoped" ? "good" : "info"}>
                    {item.status}
                  </Badge>
                  {item.isAfter2230WarningShown && <Badge tone="warn">added after 22:30</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-dim">Solves: {item.problemItSolves}</p>
                {item.definitionOfDone && (
                  <p className="text-xs text-ink-faint">Done when: {item.definitionOfDone}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {item.status !== "dropped" && (
                  <>
                    <form action={generatePrompt}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className={buttonGhostClass}>Generate prompt</button>
                    </form>
                    <form action={dropIdea}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className={buttonGhostClass}>Drop</button>
                    </form>
                  </>
                )}
              </div>
            </div>
            {item.generatedPrompt && (
              <div className="mt-3 rounded-lg border border-edge bg-bg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                    Generated Claude Code prompt
                  </span>
                  <CopyButton text={item.generatedPrompt} />
                </div>
                <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-dim">
                  {item.generatedPrompt}
                </pre>
                <p className="mt-2 border-t border-edge pt-2 text-[11px] text-ink-faint">
                  Saved to generated-prompts/{safeSlug(item.idea)}.md with spawn script scripts/spawn-{safeSlug(item.idea)}.sh.
                  The script opens a new Claude Code session in a sibling directory. It never runs automatically.
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
