import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "jamal-os.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
console.log("Migrations applied to", dbPath);
sqlite.close();
