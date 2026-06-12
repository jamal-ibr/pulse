// Starts the Google OAuth flow for the Gmail read-only connector.
// Only the gmail.readonly scope is ever requested.

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  readGoogleOAuthEnv,
  GMAIL_READONLY_SCOPE,
} from "@/lib/google-oauth";

const STATE_COOKIE = "google_oauth_state";

export async function GET(): Promise<NextResponse> {
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

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: env.clientId,
      redirectUri: env.redirectUri,
      scope: GMAIL_READONLY_SCOPE,
      state,
    }),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
