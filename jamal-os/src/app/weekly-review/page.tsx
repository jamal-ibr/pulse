import { Card, CardTitle, Badge, EmptyState, buttonClass } from "@/components/ui";
import { gatherWeeklyFacts, getPastReviews } from "@/lib/services/weekly-review";
import { runWeeklyReview } from "./actions";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewPage() {
  const facts = await gatherWeeklyFacts();
  const reviews = await getPastReviews();
  const latest = reviews[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Weekly Review</h1>
          <p className="text-xs text-ink-faint">
            Flags computed in code from logged data. Missing data scores low.
          </p>
        </div>
        <form action={runWeeklyReview}>
          <button className={buttonClass}>Run review</button>
        </form>
      </div>

      <Card>
        <CardTitle>Current avoidance flags ({facts.flags.length})</CardTitle>
        <div className="mt-3 space-y-2">
          {facts.flags.length === 0 && (
            <div className="text-sm text-accent">No avoidance flags this week. Verified by data.</div>
          )}
          {facts.flags.map((f) => (
            <div key={f.code + f.evidence} className="rounded-lg bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{f.message}</span>
                <Badge tone={f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : "neutral"}>
                  {f.severity}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-ink-faint">{f.evidence}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Pillar scores this week (out of 10)</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {Object.entries(facts.pillarScores).map(([pillar, score]) => (
            <div key={pillar} className="rounded-lg bg-bg p-3 text-center">
              <div className={`text-xl font-bold ${score >= 7 ? "text-accent" : score >= 4 ? "text-warn" : "text-danger"}`}>
                {score}/10
              </div>
              <div className="text-xs capitalize text-ink-dim">{pillar}</div>
            </div>
          ))}
        </div>
      </Card>

      {latest && (
        <Card>
          <CardTitle>
            Latest review ({latest.weekStart} to {latest.weekEnd})
          </CardTitle>
          <div className="mt-2 whitespace-pre-line text-sm leading-relaxed">{latest.aiSummary}</div>
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">Commitment</span>
            <div className="mt-1">{latest.commitment}</div>
          </div>
        </Card>
      )}

      {reviews.length > 1 && (
        <Card>
          <CardTitle>Past reviews and trend</CardTitle>
          <div className="mt-3 space-y-3">
            {reviews.slice(1).map((r) => {
              const scores = JSON.parse(r.pillarScoresJson) as Record<string, number>;
              const flags = JSON.parse(r.avoidanceFlagsJson) as unknown[];
              return (
                <div key={r.id} className="rounded-lg bg-bg p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{r.weekStart} to {r.weekEnd}</span>
                    <span className="text-xs text-ink-faint">{flags.length} flags</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(scores).map(([k, v]) => (
                      <Badge key={k} tone={v >= 7 ? "good" : v >= 4 ? "warn" : "danger"}>
                        {k} {v}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-1.5 text-xs text-ink-dim">Commitment: {r.commitment}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {reviews.length === 0 && (
        <EmptyState
          title="No reviews stored yet"
          hint="Run the review, ideally on Sunday evening."
        />
      )}
    </div>
  );
}
