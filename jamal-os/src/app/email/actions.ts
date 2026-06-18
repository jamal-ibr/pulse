"use server";

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { complete } from "@/lib/ai/provider";
import { detectDeadline, triageEmail } from "@/lib/email/triage";
import { redactEmailBody, redact } from "@/lib/redact";
import { gmailReadonlyProvider } from "@/lib/email/gmail-readonly-provider";

export async function syncGmail(): Promise<void> {
  let fetched;
  try {
    fetched = await gmailReadonlyProvider.fetchUnread();
  } catch (error) {
    console.error("Gmail sync failed:", error);
    await db.insert(schema.auditLogs).values({
      action: "gmail_sync_failed",
      target: "gmail",
      detail: redact(error instanceof Error ? error.message.slice(0, 300) : "unknown"),
    });
    revalidatePath("/email");
    return;
  }

  let inserted = 0;
  for (const message of fetched) {
    const existing = await db.query.emailMessages.findFirst({
      where: eq(schema.emailMessages.externalId, message.externalId),
    });
    if (existing) continue;
    await db.insert(schema.emailMessages).values({
      sender: message.sender,
      subject: message.subject,
      snippet: message.snippet,
      body: message.body,
      receivedAt: message.receivedAt,
      isRead: message.isRead,
      category: triageEmail(message.sender, message.subject, message.body),
      detectedDeadline: detectDeadline(
        message.subject + "\n" + message.body,
        new Date(message.receivedAt),
      ),
      sourceProvider: "gmail",
      externalId: message.externalId,
    });
    inserted += 1;
  }

  await db.insert(schema.auditLogs).values({
    action: "gmail_synced",
    target: "gmail",
    detail: `${fetched.length} unread fetched, ${inserted} new stored`,
  });
  revalidatePath("/email");
  revalidatePath("/");
}

export async function draftReply(formData: FormData) {
  const emailId = Number(formData.get("emailId"));
  if (!Number.isInteger(emailId)) return;
  const email = await db.query.emailMessages.findFirst({
    where: eq(schema.emailMessages.id, emailId),
  });
  if (!email) return;

  const facts = [
    `sender: ${email.sender}`,
    `subject: ${email.subject}`,
    `body:`,
    redactEmailBody(email.body, false),
  ].join("\n");

  const { output } = await complete("email-voice", facts);
  await db.insert(schema.emailDrafts).values({ emailId, draftBody: output });
  // Drafts are saved locally only. Nothing is ever sent.
  revalidatePath("/email");
}

export async function addDeadlineToCalendar(formData: FormData) {
  const emailId = Number(formData.get("emailId"));
  if (!Number.isInteger(emailId)) return;
  const email = await db.query.emailMessages.findFirst({
    where: eq(schema.emailMessages.id, emailId),
  });
  if (!email) return;

  const deadline = email.detectedDeadline ?? detectDeadline(email.subject + "\n" + email.body, new Date(email.receivedAt));
  if (!deadline) return;

  await db.insert(schema.calendarEvents).values({
    title: `Deadline: ${email.subject.slice(0, 80)}`,
    start: `${deadline}T09:00`,
    end: `${deadline}T09:30`,
    description: `Detected from email: ${email.sender}`,
    sourceProvider: "local",
    writeStatus: "local_only",
  });
  await db.insert(schema.auditLogs).values({
    action: "deadline_added_to_calendar",
    target: deadline,
    detail: `From email #${emailId}`,
  });
  revalidatePath("/email");
  revalidatePath("/calendar");
}

export async function markRead(formData: FormData) {
  const emailId = Number(formData.get("emailId"));
  if (!Number.isInteger(emailId)) return;
  await db
    .update(schema.emailMessages)
    .set({ isRead: true })
    .where(eq(schema.emailMessages.id, emailId));
  revalidatePath("/email");
}
