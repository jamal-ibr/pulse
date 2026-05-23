import { log } from "../utils/logger.js";
import type { DraftResult } from "./types.js";

const GMAIL_REFRESH = process.env.GMAIL_OAUTH_REFRESH_TOKEN ?? "";
const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID ?? process.env.GDRIVE_OAUTH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET ?? process.env.GDRIVE_OAUTH_CLIENT_SECRET ?? "";
const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL ?? "";

export interface GmailDraftsResult {
  createdIds: string[];
  failures: number;
}

export function isGmailDraftsAvailable(): boolean {
  return Boolean(GMAIL_REFRESH && CLIENT_ID && CLIENT_SECRET);
}

/**
 * Create one Gmail draft per result. Requires gmail.compose scope on the
 * refresh token. We deliberately do NOT use any send method anywhere in
 * this file — grep this file for \"send\" and you should find nothing.
 */
export async function writeGmailDrafts(drafts: DraftResult[]): Promise<GmailDraftsResult> {
  if (!isGmailDraftsAvailable()) {
    throw new Error(
      "Gmail Drafts auth not configured (need GMAIL_OAUTH_REFRESH_TOKEN, GMAIL_OAUTH_CLIENT_ID/GDRIVE_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET/GDRIVE_OAUTH_CLIENT_SECRET).",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { google } = (await import("googleapis")) as any;
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH });
  await oauth2.getAccessToken();

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const createdIds: string[] = [];
  let failures = 0;
  for (const d of drafts) {
    if (d.channel !== "email" || !d.lead.owner_email) {
      failures++;
      continue;
    }
    const raw = encodeRfc822({
      to: d.lead.owner_email,
      from: FROM_EMAIL || undefined,
      subject: d.subject,
      body: d.body,
    });
    try {
      const res = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });
      createdIds.push(String(res?.data?.id ?? ""));
    } catch (e) {
      failures++;
      log.warn(`gmail: draft create failed for ${d.lead.practice_name}: ${(e as Error).message}`);
    }
  }

  log.ok(`drafts: wrote ${createdIds.length} Gmail drafts (${failures} failures)`);
  return { createdIds, failures };
}

function encodeRfc822(opts: { to: string; from?: string; subject: string; body: string }): string {
  const headers = [
    `To: ${opts.to}`,
    opts.from ? `From: ${opts.from}` : null,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");
  const mail = headers + opts.body;
  return Buffer.from(mail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
