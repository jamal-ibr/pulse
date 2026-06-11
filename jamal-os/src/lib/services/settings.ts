import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(schema.settings.key, key),
    });
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}
