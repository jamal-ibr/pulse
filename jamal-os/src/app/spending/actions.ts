"use server";

import { redact } from "@/lib/redact";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBankCsv } from "@/lib/csv";
import { todayIso } from "@/lib/dates";

const CATEGORIES = ["groceries", "takeaway", "transport", "subscriptions", "business", "other"] as const;

const addSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive(),
  category: z.enum(CATEGORIES),
  merchant: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export async function addSpend(formData: FormData) {
  const parsed = addSchema.safeParse({
    date: formData.get("date") || todayIso(),
    amount: formData.get("amount"),
    category: formData.get("category"),
    merchant: formData.get("merchant") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return;
  await db.insert(schema.spending).values({
    ...parsed.data,
    isBusiness: parsed.data.category === "business",
    source: "manual",
  });
  revalidatePath("/spending");
  revalidatePath("/");
}

export async function importCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 5 * 1024 * 1024) return; // 5MB cap

  const text = await file.text();
  const { transactions, error } = parseBankCsv(text);
  if (error || transactions.length === 0) {
    await db.insert(schema.csvImports).values({
      filename: file.name,
      rowsImported: 0,
    });
    revalidatePath("/spending");
    return;
  }

  for (const t of transactions) {
    await db.insert(schema.spending).values({
      date: t.date,
      amount: t.amount,
      category: t.category,
      merchant: t.merchant,
      note: t.note,
      isBusiness: t.category === "business",
      source: "csv",
    });
  }
  await db.insert(schema.csvImports).values({
    filename: file.name,
    rowsImported: transactions.length,
  });
  await db.insert(schema.auditLogs).values({
    action: "csv_import",
    target: file.name,
    detail: `${transactions.length} rows imported`,
  });
  revalidatePath("/spending");
  revalidatePath("/");
}

export async function syncMonzo(): Promise<void> {
  const { getValidAccessToken } = await import("@/lib/services/connectors");
  const { listMonzoAccounts, listMonzoTransactions, mapMonzoTransaction } =
    await import("@/lib/monzo");
  const { eq, desc: descOrder } = await import("drizzle-orm");

  try {
    const accessToken = await getValidAccessToken("monzo");
    if (!accessToken) return;

    const accounts = await listMonzoAccounts(accessToken);
    if (accounts.length === 0) return;

    // Resume from the newest already-synced Monzo spend, else 90 days
    const newest = await db.query.spending.findFirst({
      where: eq(schema.spending.source, "monzo"),
      orderBy: descOrder(schema.spending.date),
    });
    const since = newest
      ? `${newest.date}T00:00:00Z`
      : new Date(Date.now() - 90 * 86400000).toISOString();

    let inserted = 0;
    for (const account of accounts) {
      const transactions = await listMonzoTransactions(
        accessToken,
        account.id,
        since,
      );
      for (const tx of transactions) {
        const mapped = mapMonzoTransaction(tx);
        if (!mapped) continue;
        const existing = await db.query.spending.findFirst({
          where: eq(schema.spending.externalId, mapped.externalId),
        });
        if (existing) continue;
        await db.insert(schema.spending).values({
          date: mapped.date,
          amount: mapped.amount,
          category: mapped.category,
          merchant: mapped.merchant,
          note: mapped.note,
          isBusiness: mapped.category === "business",
          source: "monzo",
          externalId: mapped.externalId,
        });
        inserted += 1;
      }
    }

    await db.insert(schema.auditLogs).values({
      action: "monzo_synced",
      target: "monzo",
      detail: `${inserted} new transactions stored`,
    });
  } catch (error) {
    console.error("Monzo sync failed:", error);
    await db.insert(schema.auditLogs).values({
      action: "monzo_sync_failed",
      target: "monzo",
      detail: redact(error instanceof Error ? error.message.slice(0, 300) : "unknown"),
    });
  }
  revalidatePath("/spending");
  revalidatePath("/");
}
