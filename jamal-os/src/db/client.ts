import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "jamal-os.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

const sqlite = globalForDb.__sqlite ?? new Database(dbPath);
if (!globalForDb.__sqlite) {
  sqlite.pragma("journal_mode = WAL");
  globalForDb.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
