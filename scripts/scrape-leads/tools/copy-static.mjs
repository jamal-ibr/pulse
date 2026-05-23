// Copy non-TS static assets (JSON config files) from src into dist after tsc.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..", "src");
const DIST = resolve(__dirname, "..", "dist");

const entries = [
  ["draft-outreach/config", "draft-outreach/config"],
];

for (const [from, to] of entries) {
  const fromAbs = resolve(SRC, from);
  const toAbs = resolve(DIST, to);
  if (!existsSync(fromAbs)) continue;
  mkdirSync(dirname(toAbs), { recursive: true });
  cpSync(fromAbs, toAbs, { recursive: true });
  console.log(`copy-static: ${from} -> ${to}`);
}
