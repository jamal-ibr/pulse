import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../config.js";
import { uploadOutreachToDrive } from "./upload.js";
import { log } from "../utils/logger.js";

const latestPath = resolve(ROOT, "data", "latest-outreach.json");
if (!existsSync(latestPath)) {
  console.error("No latest-outreach.json — run `npm run scrape:leads` first.");
  process.exit(1);
}
const { csvPath, jsonPath, stamp } = JSON.parse(readFileSync(latestPath, "utf8")) as {
  csvPath: string;
  jsonPath: string;
  stamp: string;
};

(async () => {
  const result = await uploadOutreachToDrive({ csvPath, jsonPath, stamp });
  if (result) {
    log.ok("Uploaded latest outreach run to Drive:");
    console.log(`  CSV   : ${result.csvUrl}`);
    console.log(`  Sheet : ${result.sheetUrl}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
