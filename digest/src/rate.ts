import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DIGEST_ROOT } from "./config.js";

const RATINGS = ["useful", "thin", "off-target"] as const;

const [dateArg, ratingArg] = process.argv.slice(2);
const rating = ratingArg ?? dateArg;
const date = ratingArg ? dateArg : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

if (!rating || !RATINGS.includes(rating as (typeof RATINGS)[number])) {
  console.error(`Usage: npm run rate -- [YYYY-MM-DD] <useful|thin|off-target>`);
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
  console.error(`Bad date "${date}"; expected YYYY-MM-DD`);
  process.exit(1);
}

mkdirSync(join(DIGEST_ROOT, "data"), { recursive: true });
appendFileSync(
  join(DIGEST_ROOT, "data", "feedback.jsonl"),
  JSON.stringify({ type: "rating", date, rating, loggedAt: new Date().toISOString() }) + "\n",
);
console.log(`Logged: ${date} -> ${rating}`);
