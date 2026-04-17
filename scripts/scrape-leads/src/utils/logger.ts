import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../config.js";

const LOG_DIR = resolve(ROOT, "logs");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = resolve(LOG_DIR, `scrape-${new Date().toISOString().slice(0, 10)}.log`);

type Level = "info" | "warn" | "error" | "debug";

function write(level: Level, msg: string, extra?: unknown): void {
  const stamp = new Date().toISOString();
  const line = `${stamp} [${level.toUpperCase()}] ${msg}${extra !== undefined ? " " + safeJson(extra) : ""}`;
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {}
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = {
  info: (m: string, x?: unknown) => write("info", m, x),
  warn: (m: string, x?: unknown) => write("warn", m, x),
  error: (m: string, x?: unknown) => write("error", m, x),
  debug: (m: string, x?: unknown) => {
    if (process.env.DEBUG) write("debug", m, x);
  },
};
