// Mock email provider: reads the seeded mock inbox from SQLite.

import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import type { EmailProvider, EmailMessage } from "./types";

export const mockEmailProvider: EmailProvider = {
  name: "mock",
  mode: "mock",
  async fetchUnread(): Promise<EmailMessage[]> {
    const rows = await db.query.emailMessages.findMany({
      where: eq(schema.emailMessages.isRead, false),
    });
    return rows.map((row) => ({
      externalId: String(row.id),
      sender: row.sender,
      subject: row.subject,
      snippet: row.snippet,
      body: row.body,
      receivedAt: row.receivedAt,
      isRead: row.isRead,
    }));
  },
};
