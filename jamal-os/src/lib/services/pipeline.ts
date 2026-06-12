import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { todayIso, daysAgoIso, daysBetween, weekStartIso } from "@/lib/dates";

export const STAGES = [
  "identified",
  "contacted",
  "replied",
  "demo",
  "proposal",
  "won",
  "lost",
] as const;

export interface PipelineMetrics {
  outreachThisWeek: number;
  contactedCount: number;
  replyRate: number; // 0-1
  demosBooked: number;
  followUpsOverdue: number;
  daysSinceLastOutreach: number | null;
  untouchedOver5Days: number;
}

export async function getPipeline() {
  return db.query.pipeline.findMany({ orderBy: desc(schema.pipeline.updatedAt) });
}

export async function getPipelineMetrics(): Promise<PipelineMetrics> {
  const today = todayIso();
  const weekStart = weekStartIso();
  const rows = await getPipeline();

  const outreachEvents = await db.query.pipelineEvents.findMany({
    where: eq(schema.pipelineEvents.event, "outreach_sent"),
    orderBy: desc(schema.pipelineEvents.createdAt),
  });

  const outreachThisWeek = outreachEvents.filter(
    (e) => e.createdAt.slice(0, 10) >= weekStart,
  ).length;

  const lastOutreach = outreachEvents[0]?.createdAt?.slice(0, 10) ?? null;
  const daysSinceLastOutreach = lastOutreach
    ? daysBetween(lastOutreach, today)
    : null;

  // Reply rate: practices that progressed beyond contacted, over all that
  // were ever contacted (anything not still in identified).
  const everContacted = rows.filter((r) => r.stage !== "identified");
  const replied = rows.filter((r) =>
    ["replied", "demo", "proposal", "won"].includes(r.stage),
  );
  const replyRate = everContacted.length > 0 ? replied.length / everContacted.length : 0;

  const followUpsOverdue = rows.filter(
    (r) =>
      r.nextFollowUp != null &&
      r.nextFollowUp < today &&
      !["won", "lost"].includes(r.stage),
  ).length;

  const cutoff5 = daysAgoIso(5);
  const untouchedOver5Days = rows.filter(
    (r) =>
      !["identified", "won", "lost"].includes(r.stage) &&
      (r.lastTouch == null || r.lastTouch <= cutoff5),
  ).length;

  return {
    outreachThisWeek,
    contactedCount: rows.filter((r) => r.stage === "contacted").length,
    replyRate,
    demosBooked: rows.filter((r) => r.stage === "demo").length,
    followUpsOverdue,
    daysSinceLastOutreach,
    untouchedOver5Days,
  };
}
