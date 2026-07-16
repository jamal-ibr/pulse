import { run } from "./run.js";

function usage(): never {
  console.log(`Usage: npm run digest -- [options]

Options:
  --dry-run       Print the digest to stdout instead of emailing it
  --backfill N    Produce one digest per day for the last N days (no email)
  --no-search     Skip the web_search stage (feeds only)
  --fetch-only    Stop after fetch + dedupe, print per-lane counts (no secrets needed)
  --help          Show this help
`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes("--help")) usage();

const backfillFlag = args.indexOf("--backfill");
let backfillDays = 0;
if (backfillFlag !== -1) {
  backfillDays = Number(args[backfillFlag + 1]);
  if (!Number.isInteger(backfillDays) || backfillDays < 1 || backfillDays > 30) {
    console.error("--backfill needs a whole number of days between 1 and 30");
    process.exit(1);
  }
}

await run({
  dryRun: args.includes("--dry-run"),
  backfillDays,
  noSearch: args.includes("--no-search") || args.includes("--fetch-only"),
  fetchOnly: args.includes("--fetch-only"),
});
