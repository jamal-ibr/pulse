// Google OAuth callback: verifies state, exchanges the code, stores
// encrypted tokens, and records the connection in the audit log.

import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { readGoogleOAuthEnv, exchangeCodeForTokens } from "@/lib/google-oauth";
import { saveConnectorTokens } from "@/lib/services/connectors";

const STATE_COOKIE = "google_oauth_state";

function redirectToEmail(request: NextRequest, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/email?${query}`, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = readGoogleOAuthEnv();
  if (!env) {
    return redirectToEmail(request, "error=not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectToEmail(request, "error=state_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens(env, code);
    await saveConnectorTokens("gmail", tokens);
    await db.insert(schema.auditLogs).values({
      action: "connector_connected",
      target: "gmail",
      detail: "Gmail connected with gmail.readonly scope",
      isExternalWrite: false,
      confirmed: true,
    });
    // Reflect the read-only connection in the data mode chip
    await db
      .update(schema.settings)
      .set({ value: "connected_read" })
      .where(eq(schema.settings.key, "data_mode"));
  } catch (error) {
    console.error("Gmail OAuth callback failed:", error);
    return redirectToEmail(request, "error=token_exchange_failed");
  }

  const response = redirectToEmail(request, "connected=gmail");
  response.cookies.delete(STATE_COOKIE);
  return response;
}
