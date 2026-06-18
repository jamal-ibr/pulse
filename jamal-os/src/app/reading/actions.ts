"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { todayIso } from "@/lib/dates";

export async function logPages(formData: FormData) {
  const bookId = Number(formData.get("bookId"));
  const pages = Number(formData.get("pages"));
  if (!Number.isInteger(bookId) || !Number.isFinite(pages) || pages <= 0) return;

  const book = await db.query.readingList.findFirst({
    where: eq(schema.readingList.id, bookId),
  });
  if (!book) return;

  await db.insert(schema.readingLogs).values({ bookId, date: todayIso(), pages });

  const newPagesRead = book.pagesRead + pages;
  const finished = book.pagesTotal != null && newPagesRead >= book.pagesTotal;
  await db
    .update(schema.readingList)
    .set({
      pagesRead: book.pagesTotal != null ? Math.min(newPagesRead, book.pagesTotal) : newPagesRead,
      status: finished ? "done" : "reading",
    })
    .where(eq(schema.readingList.id, bookId));
  revalidatePath("/reading");
}

export async function saveLesson(formData: FormData) {
  const bookId = Number(formData.get("bookId"));
  const keyLessons = String(formData.get("keyLessons") ?? "").trim();
  const actionTaken = String(formData.get("actionTaken") ?? "").trim();
  if (!Number.isInteger(bookId)) return;
  await db
    .update(schema.readingList)
    .set({ keyLessons: keyLessons || null, actionTaken: actionTaken || null })
    .where(eq(schema.readingList.id, bookId));
  revalidatePath("/reading");
}

export async function setStatus(formData: FormData) {
  const bookId = Number(formData.get("bookId"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(bookId) || !["queued", "reading", "done"].includes(status)) return;
  await db
    .update(schema.readingList)
    .set({ status })
    .where(eq(schema.readingList.id, bookId));
  revalidatePath("/reading");
}
