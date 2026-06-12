// Starts the Google OAuth flow. ?connector=google_calendar requests
// the calendar.readonly scope; the default is gmail.readonly. Both
// connectors are read-only; no write scope is ever requested.

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildGoogleAuthUrl,
  readGoogleOAuthEnv,
  GMAIL_READONLY_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from "@/lib/google-oauth";

const STATE_COOKIE = "google_oauth_state";
const CONNECTOR_COOKIE = "google_oauth_connector";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = readGoogleOAuthEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local per SETUP.md.",
      },
      { status: 503 },
    );
  }

  const connector =
    new URL(request.url).searchParams.get("connector") === "google_calendar"
      ? "google_calendar"
      : "gmail";
  const scope =
    connector === "google_calendar"
      ? GOOGLE_CALENDAR_READONLY_SCOPE
      : GMAIL_READONLY_SCOPE;

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: env.clientId,
      redirectUri: env.redirectUri,
      scope,
      state,
    }),
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  } as const;
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(CONNECTOR_COOKIE, connector, cookieOptions);
  return response;
}
