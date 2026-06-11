"use server";

import { z } from "zod";
import { ne, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import {
  parseIntent,
  answerIntent,
  type AssistantFacts,
} from "@/lib/assistant";
import { getPipelineMetrics } from "@/lib/services/pipeline";
import { getYesterdayGaps } from "@/lib/services/habits";
import { pulseHardRuleTriggered, PULSE_CONTACTED_MINIMUM } from "@/lib/avoidance";
import { complete } from "@/lib/ai/provider";
import { todayIso } from "@/lib/dates";

const inputSchema = z.string().trim().min(1).max(500);

export interface AssistantReply {
  reply: string;
  provider: "local" | "anthropic" | "mock";
}

async function gatherFacts(): Promise<AssistantFacts> {
  const today = todayIso();
  const pipeline = await getPipelineMetrics();
  const openTasks = await db.query.tasks.findMany({
    where: ne(schema.tasks.status, "done"),
    orderBy: asc(schema.tasks.dueDate),
  });
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate != null && t.dueDate < today,
  );
  const scariest = [...openTasks].sort(
    (a, b) => b.scariness - a.scariness || b.deferCount - a.deferCount,
  )[0];
  const habitGaps = await getYesterdayGaps();
  const todayEvents = await db.query.calendarEvents.findMany();
  const todayEventCount = todayEvents.filter((e) =>
    e.start.startsWith(today),
  ).length;

  return {
    contactedCount: pipeline.contactedCount,
    contactedMinimum: PULSE_CONTACTED_MINIMUM,
    outreachThisWeek: pipeline.outreachThisWeek,
    followUpsOverdue: pipeline.followUpsOverdue,
    hardRuleTriggered: pulseHardRuleTriggered(pipeline.contactedCount),
    overdueTaskCount: overdueTasks.length,
    scariestTask: scariest
      ? {
          title: scariest.title,
          scariness: scariest.scariness,
          deferCount: scariest.deferCount,
        }
      : null,
    habitGaps: habitGaps.map((g) => ({ habit: g.habit, detail: g.detail })),
    todayEventCount,
  };
}

export async function askAssistant(rawInput: string): Promise<AssistantReply> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { reply: "Say or type a question first.", provider: "local" };
  }

  const intent = parseIntent(parsed.data);

  if (intent.type === "add_task") {
    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: intent.title.slice(0, 300),
        pillarKey: "systems",
        energy: "shallow",
        scariness: 1,
      })
      .returning();
    await db
      .insert(schema.taskEvents)
      .values({ taskId: task.id, event: "created" });
    revalidatePath("/tasks");
    revalidatePath("/");
    return {
      reply: `Task added: ${task.title}. It is filed under Systems with scariness 1; adjust it on the Tasks page if that is wrong.`,
      provider: "local",
    };
  }

  const facts = await gatherFacts();
  const localAnswer = answerIntent(intent, facts);
  if (localAnswer !== null) {
    return { reply: localAnswer, provider: "local" };
  }

  // General chat: hand the question plus structured facts to the AI
  // provider. complete() applies redaction and logs the interaction.
  const factsText = [
    `question: ${intent.type === "chat" ? intent.text : parsed.data}`,
    `date: ${todayIso()}`,
    `pulse_hard_rule_triggered: ${facts.hardRuleTriggered}`,
    `contacted_count: ${facts.contactedCount} of ${facts.contactedMinimum}`,
    `outreach_this_week: ${facts.outreachThisWeek}`,
    `follow_ups_overdue: ${facts.followUpsOverdue}`,
    `overdue_task_count: ${facts.overdueTaskCount}`,
    `scariest_task: ${facts.scariestTask ? `${facts.scariestTask.title} (scariness ${facts.scariestTask.scariness}, deferred ${facts.scariestTask.deferCount}x)` : "none"}`,
    `yesterday_habit_gaps: ${facts.habitGaps.map((g) => `${g.habit}: ${g.detail}`).join("; ") || "none"}`,
    `today_event_count: ${facts.todayEventCount}`,
  ].join("\n");

  const { output, provider } = await complete("voice-assistant", factsText);
  return { reply: output, provider };
}
