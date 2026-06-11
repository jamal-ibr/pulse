"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayIso } from "@/lib/dates";

const numeric = (input: FormDataEntryValue | null): number | null => {
  if (input == null || input === "") return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
};

const text = (input: FormDataEntryValue | null): string | null => {
  const value = typeof input === "string" ? input.trim() : "";
  return value === "" ? null : value;
};

const timeSchema = z.string().regex(/^\d{1,2}:\d{2}$/).nullable();

export async function saveDayLog(formData: FormData) {
  const date = text(formData.get("date")) ?? todayIso();

  const lightsOut = timeSchema.safeParse(text(formData.get("lightsOutTime")));
  const wake = timeSchema.safeParse(text(formData.get("wakeTime")));

  const habitValues = {
    date,
    salahCount: numeric(formData.get("salahCount")),
    proteinG: numeric(formData.get("proteinG")),
    kcal: numeric(formData.get("kcal")),
    trainingSession: text(formData.get("trainingSession")),
    monThuFast: formData.get("monThuFast") === "on",
    phoneScreenHours: numeric(formData.get("phoneScreenHours")),
    deepWorkBlocks: numeric(formData.get("deepWorkBlocks")),
    pagesRead: numeric(formData.get("pagesRead")),
    waterLitres: numeric(formData.get("waterLitres")),
    notes: text(formData.get("notes")),
    updatedAt: new Date().toISOString(),
  };

  const existing = await db.query.habitLogs.findFirst({
    where: eq(schema.habitLogs.date, date),
  });
  if (existing) {
    await db.update(schema.habitLogs).set(habitValues).where(eq(schema.habitLogs.date, date));
  } else {
    await db.insert(schema.habitLogs).values(habitValues);
  }

  const sleepValues = {
    date,
    sleepHours: numeric(formData.get("sleepHours")),
    lightsOutTime: lightsOut.success ? lightsOut.data : null,
    wakeTime: wake.success ? wake.data : null,
    sleepTime: lightsOut.success ? lightsOut.data : null,
  };
  const existingSleep = await db.query.sleepLogs.findFirst({
    where: eq(schema.sleepLogs.date, date),
  });
  if (existingSleep) {
    await db.update(schema.sleepLogs).set(sleepValues).where(eq(schema.sleepLogs.date, date));
  } else {
    await db.insert(schema.sleepLogs).values(sleepValues);
  }

  const weight = numeric(formData.get("weightKg"));
  if (weight != null) {
    const existingWeight = await db.query.weightLogs.findFirst({
      where: eq(schema.weightLogs.date, date),
    });
    if (existingWeight) {
      await db.update(schema.weightLogs).set({ weightKg: weight }).where(eq(schema.weightLogs.date, date));
    } else {
      await db.insert(schema.weightLogs).values({ date, weightKg: weight });
    }
  }

  const training = text(formData.get("trainingSession"));
  if (training && training !== "rest") {
    const already = await db.query.trainingSessions.findFirst({
      where: eq(schema.trainingSessions.date, date),
    });
    if (!already) {
      await db.insert(schema.trainingSessions).values({ date, type: training });
    } else {
      await db.update(schema.trainingSessions).set({ type: training }).where(eq(schema.trainingSessions.date, date));
    }
  }

  await db.insert(schema.auditLogs).values({
    action: "habit_log_saved",
    target: date,
    detail: "Full day log saved",
  });

  revalidatePath("/habits");
  revalidatePath("/");
  revalidatePath("/fitness");
}
