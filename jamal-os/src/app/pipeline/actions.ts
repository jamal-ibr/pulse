"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAGES } from "@/lib/services/pipeline";
import { todayIso } from "@/lib/dates";

const addSchema = z.object({
  practiceName: z.string().min(1).max(200),
  vertical: z.enum(["dental", "vet"]),
  source: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

function touch() {
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function addPractice(formData: FormData) {
  const parsed = addSchema.safeParse({
    practiceName: formData.get("practiceName"),
    vertical: formData.get("vertical"),
    source: formData.get("source") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return;
  const [row] = await db.insert(schema.pipeline).values(parsed.data).returning();
  await db.insert(schema.pipelineEvents).values({
    pipelineId: row.id,
    event: "created",
    toStage: "identified",
  });
  touch();
}

export async function moveStage(formData: FormData) {
  const id = Number(formData.get("id"));
  const stage = String(formData.get("stage"));
  if (!Number.isInteger(id) || !STAGES.includes(stage as (typeof STAGES)[number])) return;

  const row = await db.query.pipeline.findFirst({ where: eq(schema.pipeline.id, id) });
  if (!row || row.stage === stage) return;

  const today = todayIso();
  await db
    .update(schema.pipeline)
    .set({ stage, lastTouch: today, updatedAt: new Date().toISOString() })
    .where(eq(schema.pipeline.id, id));

  await db.insert(schema.pipelineEvents).values({
    pipelineId: id,
    event: "stage_change",
    fromStage: row.stage,
    toStage: stage,
  });

  // Moving identified -> contacted is an outreach action. Count it.
  if (row.stage === "identified" && stage === "contacted") {
    await db.insert(schema.pipelineEvents).values({
      pipelineId: id,
      event: "outreach_sent",
      toStage: "contacted",
      detail: "Logged via stage move",
    });
  }
  touch();
}

export async function logOutreach(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const today = todayIso();
  await db.insert(schema.pipelineEvents).values({
    pipelineId: id,
    event: "outreach_sent",
    detail: "Outreach logged",
  });
  await db
    .update(schema.pipeline)
    .set({ lastTouch: today, updatedAt: new Date().toISOString() })
    .where(eq(schema.pipeline.id, id));
  touch();
}

export async function setFollowUp(formData: FormData) {
  const id = Number(formData.get("id"));
  const date = String(formData.get("nextFollowUp") ?? "");
  if (!Number.isInteger(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await db
    .update(schema.pipeline)
    .set({ nextFollowUp: date, updatedAt: new Date().toISOString() })
    .where(eq(schema.pipeline.id, id));
  touch();
}
