"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validateScariness } from "@/lib/task-logic";

const newTaskSchema = z.object({
  title: z.string().min(1).max(300),
  pillarKey: z.string().min(1),
  projectId: z.coerce.number().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  energy: z.enum(["deep", "shallow"]),
  scariness: z.coerce.number().int().min(1).max(5),
});

function touch() {
  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath("/projects");
}

export async function addTask(formData: FormData) {
  const parsed = newTaskSchema.safeParse({
    title: formData.get("title"),
    pillarKey: formData.get("pillarKey"),
    projectId: formData.get("projectId") || null,
    dueDate: formData.get("dueDate") || null,
    energy: formData.get("energy"),
    scariness: formData.get("scariness"),
  });
  if (!parsed.success) return { error: "Invalid task. Scariness 1 to 5 is required." };
  if (!validateScariness(parsed.data.scariness)) return { error: "Scariness must be 1 to 5." };

  const [task] = await db
    .insert(schema.tasks)
    .values({
      title: parsed.data.title,
      pillarKey: parsed.data.pillarKey,
      projectId: parsed.data.projectId ?? null,
      dueDate: parsed.data.dueDate ?? null,
      energy: parsed.data.energy,
      scariness: parsed.data.scariness,
    })
    .returning();
  await db.insert(schema.taskEvents).values({ taskId: task.id, event: "created" });

  if (parsed.data.projectId) {
    await db
      .update(schema.projects)
      .set({ lastActivityAt: new Date().toISOString().slice(0, 10) })
      .where(eq(schema.projects.id, parsed.data.projectId));
  }
  touch();
}

export async function deferTaskAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, id) });
  if (!task) return;
  // Defer pushes due date to tomorrow and increments the defer count.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await db
    .update(schema.tasks)
    .set({
      deferCount: task.deferCount + 1,
      dueDate: tomorrow.toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.tasks.id, id));
  await db.insert(schema.taskEvents).values({ taskId: id, event: "deferred" });
  touch();
}

export async function completeTask(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(schema.tasks.id, id));
  await db.insert(schema.taskEvents).values({ taskId: id, event: "completed" });

  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, id) });
  if (task?.projectId) {
    await db
      .update(schema.projects)
      .set({ lastActivityAt: new Date().toISOString().slice(0, 10) })
      .where(eq(schema.projects.id, task.projectId));
    await db.insert(schema.projectActivity).values({
      projectId: task.projectId,
      activity: `Completed: ${task.title}`,
    });
  }
  touch();
}

export async function setTaskStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(id) || !["todo", "in_progress", "blocked"].includes(status)) return;
  await db
    .update(schema.tasks)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(schema.tasks.id, id));
  await db.insert(schema.taskEvents).values({ taskId: id, event: "status_change", detail: status });
  touch();
}
