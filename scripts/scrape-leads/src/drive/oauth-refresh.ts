import { CONFIG } from "../config.js";
import { log } from "../utils/logger.js";

/**
 * Refresh-token-based OAuth auth, ideal for CI uploads to personal Drive.
 *
 * Google service accounts cannot own files in a personal user's Drive
 * ("storageQuotaExceeded" error, even with the folder shared). The fix is
 * to upload AS the user using a long-lived refresh token obtained once via
 * Google's OAuth Playground. Files then count against the user's quota and
 * appear normally in their Drive.
 *
 * One-time setup (~3 mins, phone-friendly — see ACTIONS-SETUP.md):
 *   1. Google Cloud Console → Credentials → Create OAuth client
 *      → Application type: WEB APPLICATION (not Desktop)
 *      → Authorized redirect URI: https://developers.google.com/oauthplayground
 *   2. Visit https://developers.google.com/oauthplayground/
 *      → settings cog (top right) → tick "Use your own OAuth credentials"
 *      → paste client_id + client_secret → close
 *      → in left panel enter scope: https://www.googleapis.com/auth/drive.file
 *      → Authorize APIs → sign in with the Google account whose Drive you
 *        want files uploaded to → approve
 *      → Exchange authorization code for tokens
 *      → copy the `refresh_token` value
 *   3. Add these three GitHub repo secrets:
 *        GDRIVE_OAUTH_CLIENT_ID
 *        GDRIVE_OAUTH_CLIENT_SECRET
 *        GDRIVE_OAUTH_REFRESH_TOKEN
 *
 * Refresh tokens are long-lived: they only break if you revoke them,
 * change your Google password, don't use them for 6 months, or your
 * OAuth client is deleted.
 */
export async function getRefreshTokenAuth(): Promise<unknown> {
  if (
    !CONFIG.gdriveOauthRefreshToken ||
    !CONFIG.gdriveOauthClientId ||
    !CONFIG.gdriveOauthClientSecret
  ) {
    throw new Error(
      "Refresh-token auth needs all three of GDRIVE_OAUTH_CLIENT_ID, GDRIVE_OAUTH_CLIENT_SECRET, GDRIVE_OAUTH_REFRESH_TOKEN.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { google } = (await import("googleapis")) as any;
  const oauth2 = new google.auth.OAuth2(
    CONFIG.gdriveOauthClientId,
    CONFIG.gdriveOauthClientSecret,
  );
  oauth2.setCredentials({ refresh_token: CONFIG.gdriveOauthRefreshToken });
  // Force an access-token mint so we fail fast on bad credentials.
  const tok = await oauth2.getAccessToken();
  if (!tok || !tok.token) {
    throw new Error("OAuth refresh failed: no access token returned");
  }
  log.ok("drive: OAuth refresh-token auth ready (uploads as user, no quota issue)");
  return oauth2;
}
