// Connector account storage. OAuth tokens are encrypted at rest with
// LOCAL_ENCRYPTION_KEY and refreshed transparently when expired.

import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  readGoogleOAuthEnv,
  refreshAccessToken,
  type GoogleTokens,
} from "@/lib/google-oauth";

export type ConnectorProvider = "gmail" | "google_calendar";

export async function getConnectorAccount(provider: ConnectorProvider) {
  return db.query.connectorAccounts.findFirst({
    where: eq(schema.connectorAccounts.provider, provider),
  });
}

export async function saveConnectorTokens(
  provider: ConnectorProvider,
  tokens: GoogleTokens,
): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(tokens));
  const existing = await getConnectorAccount(provider);
  const now = new Date().toISOString();
  if (existing) {
    await db
      .update(schema.connectorAccounts)
      .set({ encryptedToken: encrypted, mode: "read_only", connectedAt: now })
      .where(eq(schema.connectorAccounts.id, existing.id));
  } else {
    await db.insert(schema.connectorAccounts).values({
      provider,
      mode: "read_only",
      encryptedToken: encrypted,
      connectedAt: now,
    });
  }
}

export async function disconnectConnector(
  provider: ConnectorProvider,
): Promise<void> {
  const existing = await getConnectorAccount(provider);
  if (!existing) return;
  await db
    .update(schema.connectorAccounts)
    .set({ encryptedToken: null, mode: "mock", connectedAt: null })
    .where(eq(schema.connectorAccounts.id, existing.id));
}

// Returns a usable access token for the provider, refreshing and
// re-encrypting if the stored one has expired. Null when the provider
// has never been connected.
export async function getValidAccessToken(
  provider: ConnectorProvider,
): Promise<string | null> {
  const account = await getConnectorAccount(provider);
  if (!account?.encryptedToken) return null;

  const tokens = JSON.parse(decryptSecret(account.encryptedToken)) as GoogleTokens;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  if (!tokens.refreshToken) {
    throw new Error(
      `${provider} access token expired and no refresh token is stored. Reconnect the account.`,
    );
  }
  const env = readGoogleOAuthEnv();
  if (!env) {
    throw new Error(
      "Google OAuth env vars are missing. Restore GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
    );
  }
  const refreshed = await refreshAccessToken(env, tokens.refreshToken);
  await saveConnectorTokens(provider, refreshed);
  return refreshed.accessToken;
}
