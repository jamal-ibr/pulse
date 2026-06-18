import { Card, CardTitle, Badge, ProgressBar, buttonClass } from "@/components/ui";
import { computeLevelState } from "@/lib/services/level";
import { takeSnapshot } from "./actions";

export const dynamic = "force-dynamic";

export default async function LevelPage() {
  const state = await computeLevelState();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Level</h1>
          <p className="text-xs text-ink-faint">
            Level 100 is the prophetic standard. It is not a normal target and is never assigned.
          </p>
        </div>
        <form action={takeSnapshot}>
          <button className={buttonClass}>Snapshot</button>
        </form>
      </div>

      <Card className="text-center">
        <div className="text-5xl font-bold tabular-nums text-accent">{state.overallLevel}</div>
        <div className="mt-1 text-sm text-ink-dim">{state.band}</div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-ink-faint">
          <Badge tone={state.confidence === "high" ? "good" : state.confidence === "medium" ? "warn" : "danger"}>
            Confidence: {state.confidence}
          </Badge>
          <span>
            {state.loggedDays}/{state.windowDays} days logged in window
          </span>
          {state.dampened && <Badge tone="info">Jump dampened from {state.rawLevel}</Badge>}
        </div>
        <p className="mx-auto mt-3 max-w-md text-xs text-ink-faint">
          Trajectory, not ego fuel. Gains require multi-week logged evidence. Missing data reduces both score and confidence.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {state.details.map((pillar) => (
          <Card key={pillar.key}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{pillar.name}</h2>
              <span className="text-xl font-bold tabular-nums">{pillar.score}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={pillar.score} max={100} tone={pillar.score >= 50 ? "good" : pillar.score >= 30 ? "warn" : "danger"} />
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">{pillar.band}</div>
            <p className="mt-2 text-xs text-ink-dim">{pillar.evidence}</p>
            {pillar.missingDataNote && (
              <p className="mt-1 text-[11px] text-warn">{pillar.missingDataNote}</p>
            )}
            <div className="mt-3 space-y-1 border-t border-edge pt-2 text-[11px]">
              <div><span className="text-ink-faint">Raised by:</span> <span className="text-ink-dim">{pillar.raisedBy}</span></div>
              <div><span className="text-ink-faint">Lowered by:</span> <span className="text-ink-dim">{pillar.loweredBy}</span></div>
              <div className="text-accent">What would raise this next: {pillar.nextAction}</div>
            </div>
          </Card>
        ))}
      </div>

      {state.history.length > 0 && (
        <Card>
          <CardTitle>Snapshot history</CardTitle>
          <div className="mt-3 space-y-1.5">
            {state.history.map((snapshot) => (
              <div key={snapshot.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-dim">{snapshot.date}</span>
                <div className="flex items-center gap-2">
                  {snapshot.note && <span className="text-[11px] text-ink-faint">{snapshot.note}</span>}
                  <span className="font-semibold tabular-nums">{snapshot.overallLevel}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
