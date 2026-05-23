import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";
import type { DraftResult } from "./types.js";

async function pickAuth(): Promise<unknown> {
  // Reuse the same auth chain as the existing Drive uploader. We dynamic-
  // import so the googleapis dep stays lazy and OAuth paths only load if used.
  const oauthRefresh = await import("../drive/oauth-refresh.js");
  const serviceAcct = await import("../drive/service-account.js");
  const desktop = await import("../drive/oauth.js");
  if (CONFIG.gdriveOauthRefreshToken) return oauthRefresh.getRefreshTokenAuth();
  if (CONFIG.gdriveServiceAccountJson) return serviceAcct.getServiceAccountAuth();
  return desktop.getOAuthClient();
}

export interface SheetUploadResult {
  sheetId: string;
  sheetUrl: string;
}

/**
 * Create a single Google Sheet in the configured Drive folder with one row
 * per draft. The personalisation brief and source URLs go into columns so
 * each row is auditable, but they are NOT in the email body itself.
 */
export async function writeDraftsSheet(opts: { drafts: DraftResult[]; stamp: string }): Promise<SheetUploadResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { google } = (await import("googleapis")) as any;
  const auth = await pickAuth();
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  const title = `Pulse outreach drafts — ${opts.stamp}`;
  const folderId = CONFIG.gdriveFolderId || undefined;

  // 1. Create empty Sheet.
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: "drafts" } }],
    },
    fields: "spreadsheetId,spreadsheetUrl",
  });
  const sheetId: string = created.data.spreadsheetId;
  const sheetUrl: string = created.data.spreadsheetUrl;

  // 2. Move to the target Drive folder so it lives with the leads CSV.
  if (folderId) {
    await drive.files.update({
      fileId: sheetId,
      addParents: folderId,
      fields: "id,parents",
      supportsAllDrives: true,
    });
  }

  // 3. Populate header + rows.
  const header = [
    "rank", "practice_name", "owner_name", "owner_email", "channel",
    "angle", "angle_justification", "confidence", "word_count",
    "subject", "body",
    "personalisation_brief", "fact_source_urls",
    "phone_fallback_strategy", "direct_phone", "practice_phone",
    "regenerations", "regenerate_reasons",
  ];
  const rows = opts.drafts.map((d) => [
    String(d.lead.rank ?? ""),
    d.lead.practice_name,
    d.lead.owner_name,
    d.lead.owner_email,
    d.channel,
    d.angle,
    d.angle_justification,
    d.confidence,
    String(d.word_count),
    d.subject,
    d.body,
    d.brief.facts.map((f) => `• ${f.text}`).join("\n"),
    d.brief.facts.map((f) => f.source_url ?? "").join("\n"),
    d.lead.phone_fallback_strategy ?? "",
    d.lead.decision_maker_direct_phone || d.lead.direct_phone || "",
    d.lead.practice_phone || "",
    String(d.regenerations),
    d.regenerate_reasons.join(" | "),
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: "drafts!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });

  // 4. Freeze header + bold it.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    },
  });

  log.ok(`drafts: wrote Sheet ${sheetId} — ${sheetUrl}`);
  return { sheetId, sheetUrl };
}
