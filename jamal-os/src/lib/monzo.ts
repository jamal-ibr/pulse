// Monzo connector: official personal-use API, read-only by policy.
// This module only ever issues GET requests for accounts and
// transactions; no payment, pot, or feed endpoints are called.
// Token storage and refresh share the connector_accounts plumbing.

import { tokensFromResponse, type GoogleTokens as OAuthTokens } from "./google-oauth";

const AUTH_ENDPOINT = "https://auth.monzo.com/";
const API = "https://api.monzo.com";

export interface MonzoEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function readMonzoEnv(): MonzoEnv | null {
  const clientId = process.env.MONZO_CLIENT_ID;
  const clientSecret = process.env.MONZO_CLIENT_SECRET;
  const redirectUri =
    process.env.MONZO_REDIRECT_URI ??
    "http://localhost:3000/api/oauth/monzo/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildMonzoAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    state: options.state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface MonzoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<MonzoTokenResponse> {
  const response = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Monzo token endpoint error ${response.status}: ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as MonzoTokenResponse;
}

export async function exchangeMonzoCode(
  env: MonzoEnv,
  code: string,
): Promise<OAuthTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      code,
    }),
  );
  return tokensFromResponse(data, null, Date.now());
}

export async function refreshMonzoToken(
  env: MonzoEnv,
  refreshToken: string,
): Promise<OAuthTokens> {
  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
    }),
  );
  return tokensFromResponse(data, refreshToken, Date.now());
}

// --- API reads (the only Monzo endpoints this app ever touches) -----

async function monzoGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Monzo API error ${response.status}: ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export interface MonzoAccount {
  id: string;
  type: string;
  closed: boolean;
  description?: string;
}

export async function listMonzoAccounts(accessToken: string): Promise<MonzoAccount[]> {
  const data = await monzoGet<{ accounts: MonzoAccount[] }>("/accounts", accessToken);
  return data.accounts.filter((a) => !a.closed);
}

export interface MonzoTransaction {
  id: string;
  created: string; // ISO datetime
  amount: number; // pennies, negative for money out
  description?: string;
  notes?: string;
  category?: string;
  decline_reason?: string;
  scheme?: string;
  merchant?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export async function listMonzoTransactions(
  accessToken: string,
  accountId: string,
  sinceIso: string,
): Promise<MonzoTransaction[]> {
  const params = new URLSearchParams({
    account_id: accountId,
    since: sinceIso,
    limit: "200",
  });
  params.append("expand[]", "merchant");
  const data = await monzoGet<{ transactions: MonzoTransaction[] }>(
    `/transactions?${params.toString()}`,
    accessToken,
  );
  return data.transactions;
}

// --- Pure mapping to the spending table convention ------------------

const MONZO_CATEGORY_MAP: Record<string, string> = {
  eating_out: "takeaway",
  groceries: "groceries",
  transport: "transport",
  bills: "subscriptions",
  subscriptions: "subscriptions",
  business: "business",
  entertainment: "other",
  shopping: "other",
  general: "other",
  personal_care: "other",
  holidays: "other",
  expenses: "business",
};

export interface MappedSpend {
  externalId: string;
  date: string;
  amount: number; // positive pounds, matching the CSV import convention
  category: string;
  merchant: string | null;
  note: string | null;
}

// Returns null for transactions that are not real spend: income and
// refunds, declined payments, and internal pot transfers.
export function mapMonzoTransaction(tx: MonzoTransaction): MappedSpend | null {
  if (tx.decline_reason) return null;
  if (tx.amount >= 0) return null;
  if (tx.scheme === "uk_retail_pot" || (tx.description ?? "").startsWith("pot_")) {
    return null;
  }
  const date = tx.created.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    externalId: tx.id,
    date,
    amount: Number((Math.abs(tx.amount) / 100).toFixed(2)),
    category: MONZO_CATEGORY_MAP[tx.category ?? ""] ?? "other",
    merchant: tx.merchant?.name ?? tx.counterparty?.name ?? null,
    note: tx.notes || tx.description || null,
  };
}
