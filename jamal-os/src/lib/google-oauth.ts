// Google OAuth 2.0 helpers shared by the Gmail (read-only) and, later,
// Google Calendar connectors. URL building is pure and tested; the
// token calls hit oauth2.googleapis.com.

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

// Read-only by deliberate choice: pushing events to Google would need
// the write scope plus the confirmation flow, and is not implemented.
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function readGoogleOAuthEnv(): GoogleOAuthEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/oauth/google/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: options.scope,
    state: options.state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  // Unix milliseconds after which the access token must be refreshed
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google token endpoint error ${response.status}: ${detail.slice(0, 200)}`,
    );
  }
  return (await response.json()) as TokenResponse;
}

export function tokensFromResponse(
  data: TokenResponse,
  previousRefreshToken: string | null,
  nowMs: number,
): GoogleTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefreshToken,
    // Refresh one minute early to avoid using a token at the boundary
    expiresAt: nowMs + Math.max(data.expires_in - 60, 30) * 1000,
  };
}

export async function exchangeCodeForTokens(
  env: GoogleOAuthEnv,
  code: string,
): Promise<GoogleTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  );
  return tokensFromResponse(data, null, Date.now());
}

export async function refreshAccessToken(
  env: GoogleOAuthEnv,
  refreshToken: string,
): Promise<GoogleTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  return tokensFromResponse(data, refreshToken, Date.now());
}
