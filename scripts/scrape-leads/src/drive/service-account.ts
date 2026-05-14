import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

/**
 * Service-account auth for headless / CI environments. Activated when
 * GDRIVE_SERVICE_ACCOUNT_JSON is present in env.
 *
 * Setup (one-time):
 *   1. https://console.cloud.google.com → IAM & Admin → Service Accounts
 *      → Create service account, grant no roles, finish.
 *   2. On that service account: Keys → Add key → JSON → download.
 *   3. https://drive.google.com → create a folder, e.g. "Pulse leads".
 *   4. Share that folder with the service account's email
 *      (xxx@xxx.iam.gserviceaccount.com) with Editor access.
 *   5. Copy the folder ID from the URL into GDRIVE_FOLDER_ID, and paste
 *      the full JSON key string into GDRIVE_SERVICE_ACCOUNT_JSON.
 *
 * The `drive.file` scope means the service account can only see files it
 * creates inside the shared folder; it cannot read the rest of your Drive.
 */
export async function getServiceAccountAuth(): Promise<unknown> {
  if (!CONFIG.gdriveServiceAccountJson) {
    throw new Error("GDRIVE_SERVICE_ACCOUNT_JSON not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { google } = (await import("googleapis")) as any;
  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(CONFIG.gdriveServiceAccountJson);
  } catch {
    throw new Error("GDRIVE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GDRIVE_SERVICE_ACCOUNT_JSON missing client_email or private_key");
  }
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  await auth.authorize();
  log.ok(`drive: service account auth as ${creds.client_email}`);
  return auth;
}
