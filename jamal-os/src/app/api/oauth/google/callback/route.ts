// Google OAuth callback: verifies state, exchanges the code, stores
// encrypted tokens, and records the connection in the audit log.

import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { readGoogleOAuthEnv, exchangeCodeForTokens } from "@/lib/google-oauth";
import { saveConnectorTokens } from "@/lib/services/connectors";

const STATE_COOKIE = "google_oauth_state";
const CONNECTOR_COOKIE = "google_oauth_connector";

function redirectBack(
  request: NextRequest,
  page: string,
  query: string,
): NextResponse {
  return NextResponse.redirect(new URL(`${page}?${query}`, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const connector =
    request.cookies.get(CONNECTOR_COOKIE)?.value === "google_calendar"
      ? ("google_calendar" as const)
      : ("gmail" as const);
  const page = connector === "google_calendar" ? "/calendar" : "/email";

  const env = readGoogleOAuthEnv();
  if (!env) {
    return redirectBack(request, page, "error=not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectBack(request, page, "error=state_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens(env, code);
    await saveConnectorTokens(connector, tokens);
    await db.insert(schema.auditLogs).values({
      action: "connector_connected",
      target: connector,
      detail:
        connector === "google_calendar"
          ? "Google Calendar connected with calendar.readonly scope"
          : "Gmail connected with gmail.readonly scope",
      isExternalWrite: false,
      confirmed: true,
    });
    // Reflect the read-only connection in the data mode chip
    await db
      .update(schema.settings)
      .set({ value: "connected_read" })
      .where(eq(schema.settings.key, "data_mode"));
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirectBack(request, page, "error=token_exchange_failed");
  }

  const response = redirectBack(request, page, `connected=${connector}`);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(CONNECTOR_COOKIE);
  return response;
}
