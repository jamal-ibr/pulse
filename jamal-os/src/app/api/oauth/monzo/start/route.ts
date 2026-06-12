// Starts the Monzo OAuth flow. Read-only by policy: the app only ever
// reads accounts and transactions.

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildMonzoAuthUrl, readMonzoEnv } from "@/lib/monzo";

const STATE_COOKIE = "monzo_oauth_state";

export async function GET(): Promise<NextResponse> {
  const env = readMonzoEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "Monzo is not configured. Set MONZO_CLIENT_ID and MONZO_CLIENT_SECRET in .env.local per SETUP.md.",
      },
      { status: 503 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    buildMonzoAuthUrl({
      clientId: env.clientId,
      redirectUri: env.redirectUri,
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
