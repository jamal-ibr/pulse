import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { getOAuthClient } from "./oauth.js";
import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

export interface DriveUploadResult {
  csvUrl: string;
  sheetUrl: string;
  csvId: string;
  sheetId: string;
}

/**
 * Upload the outreach CSV to Google Drive twice:
 *   1. As a plain .csv file (canonical source of truth)
 *   2. As a Google Sheet (CSV auto-imported on upload via mimeType swap)
 *
 * The Sheet is what you'll actually use on your phone — sticky headers,
 * filtering, sorting, can be edited as you work through the list.
 */
export async function uploadOutreachToDrive(opts: {
  csvPath: string;
  jsonPath: string;
  stamp: string;
}): Promise<DriveUploadResult | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { google } = (await import("googleapis")) as any;
  const auth = await getOAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const folderId = CONFIG.gdriveFolderId || undefined;
  const csvName = basename(opts.csvPath);
  const sheetName = csvName.replace(/\.csv$/, "");

  const csvUpload = await drive.files.create({
    requestBody: {
      name: csvName,
      mimeType: "text/csv",
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: { mimeType: "text/csv", body: createReadStream(opts.csvPath) },
    fields: "id, webViewLink",
  });
  const csvId: string = csvUpload.data.id;

  const sheetUpload = await drive.files.create({
    requestBody: {
      name: sheetName,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: { mimeType: "text/csv", body: createReadStream(opts.csvPath) },
    fields: "id, webViewLink",
  });
  const sheetId: string = sheetUpload.data.id;

  log.ok(`drive: uploaded CSV (${csvId}) + Sheet (${sheetId})`);

  return {
    csvUrl: csvUpload.data.webViewLink ?? `https://drive.google.com/file/d/${csvId}`,
    sheetUrl: sheetUpload.data.webViewLink ?? `https://docs.google.com/spreadsheets/d/${sheetId}`,
    csvId,
    sheetId,
  };
}
