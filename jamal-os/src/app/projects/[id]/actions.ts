"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateNextAction(formData: FormData) {
  const projectId = Number(formData.get("projectId"));
  const nextAction = String(formData.get("nextAction") ?? "").trim();
  if (!Number.isInteger(projectId) || nextAction === "") return;
  await db
    .update(schema.projects)
    .set({ nextAction, lastActivityAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function logActivity(formData: FormData) {
  const projectId = Number(formData.get("projectId"));
  const activity = String(formData.get("activity") ?? "").trim();
  if (!Number.isInteger(projectId) || activity === "") return;
  await db.insert(schema.projectActivity).values({ projectId, activity });
  await db
    .update(schema.projects)
    .set({ lastActivityAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}
