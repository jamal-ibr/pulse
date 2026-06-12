// Monzo OAuth callback: verifies state, exchanges the code, stores
// encrypted tokens. Note Monzo additionally requires approving the
// connection in the Monzo app (strong customer authentication) before
// transaction data is returned; the Spending page explains this.

import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { readMonzoEnv, exchangeMonzoCode } from "@/lib/monzo";
import { saveConnectorTokens } from "@/lib/services/connectors";

const STATE_COOKIE = "monzo_oauth_state";

function redirectToSpending(request: NextRequest, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/spending?${query}`, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = readMonzoEnv();
  if (!env) {
    return redirectToSpending(request, "error=not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectToSpending(request, "error=state_mismatch");
  }

  try {
    const tokens = await exchangeMonzoCode(env, code);
    await saveConnectorTokens("monzo", tokens);
    await db.insert(schema.auditLogs).values({
      action: "connector_connected",
      target: "monzo",
      detail: "Monzo connected, read-only by policy",
      isExternalWrite: false,
      confirmed: true,
    });
  } catch (error) {
    console.error("Monzo OAuth callback failed:", error);
    return redirectToSpending(request, "error=token_exchange_failed");
  }

  const response = redirectToSpending(request, "connected=monzo");
  response.cookies.delete(STATE_COOKIE);
  return response;
}
