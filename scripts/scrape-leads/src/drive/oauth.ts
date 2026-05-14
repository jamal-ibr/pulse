import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as readline from "node:readline";
import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

// We use the `drive.file` scope so this app can ONLY touch files it creates
// (or files explicitly shared with it). It cannot read your wider Drive.
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

/**
 * Build (and persist) an authorised Google OAuth2 client for Drive uploads.
 *
 * First run: prints an auth URL, you visit it in your browser, approve, paste
 * the returned code back into the terminal. Token is then cached on disk.
 *
 * Setup checklist (one-off):
 *   1. https://console.cloud.google.com
 *   2. Create or pick a project
 *   3. APIs & Services → Library → enable "Google Drive API"
 *   4. APIs & Services → Credentials → Create credentials → OAuth client ID
 *      → Application type: "Desktop app"
 *   5. Download JSON, save it to scripts/scrape-leads/.gdrive/credentials.json
 *      (or set GDRIVE_CREDENTIALS_PATH in .env)
 */
export async function getOAuthClient(): Promise<unknown> {
  const { google } = await import("googleapis");

  if (!existsSync(CONFIG.gdriveCredentialsPath)) {
    throw new Error(
      [
        `Missing Google OAuth credentials at ${CONFIG.gdriveCredentialsPath}.`,
        "Set up a Desktop OAuth client at https://console.cloud.google.com/apis/credentials",
        "and download the JSON to that path. See scripts/scrape-leads/README.md.",
      ].join("\n"),
    );
  }
  const creds = JSON.parse(readFileSync(CONFIG.gdriveCredentialsPath, "utf8")) as {
    installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
    web?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  };
  const c = creds.installed ?? creds.web;
  if (!c) {
    throw new Error("credentials JSON is not a Desktop OAuth client (no 'installed' key).");
  }
  const oauth2Client = new google.auth.OAuth2(
    c.client_id,
    c.client_secret,
    c.redirect_uris?.[0] ?? "urn:ietf:wg:oauth:2.0:oob",
  );

  if (existsSync(CONFIG.gdriveTokenPath)) {
    const token = JSON.parse(readFileSync(CONFIG.gdriveTokenPath, "utf8"));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("\n=== Google Drive auth required (one-time) ===");
  console.log("1. Open this URL in your browser and approve access:\n");
  console.log("  " + authUrl + "\n");
  console.log("2. Paste the code you receive below.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise((resolveCode) => {
    rl.question("Code: ", (answer) => {
      rl.close();
      resolveCode(answer.trim());
    });
  });
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  mkdirSync(dirname(CONFIG.gdriveTokenPath), { recursive: true });
  writeFileSync(CONFIG.gdriveTokenPath, JSON.stringify(tokens, null, 2));
  log.ok(`drive: cached OAuth token at ${CONFIG.gdriveTokenPath}`);
  return oauth2Client;
}
