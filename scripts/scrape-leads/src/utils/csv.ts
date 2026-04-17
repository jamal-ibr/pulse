import { writeFileSync } from "node:fs";

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<keyof T>): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
  };
  const head = columns.map((c) => esc(c as string)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

export function writeCsv<T extends Record<string, unknown>>(path: string, rows: T[], columns: Array<keyof T>): void {
  writeFileSync(path, toCsv(rows, columns), "utf8");
}
