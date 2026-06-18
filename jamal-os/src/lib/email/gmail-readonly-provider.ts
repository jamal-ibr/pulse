// Gmail read-only provider.
//
// Rules baked into this design (see docs/privacy.md):
// - Scope is https://www.googleapis.com/auth/gmail.readonly ONLY.
// - No send scope is ever requested. Replies are drafted locally and
//   copied manually.
// - OAuth tokens are encrypted at rest with LOCAL_ENCRYPTION_KEY in
//   connector_accounts.encrypted_token (see src/lib/services/connectors.ts).
//
// Setup steps are documented in SETUP.md.

import type { EmailProvider, EmailMessage } from "./types";
import { mapGmailMessage, type GmailApiMessage } from "./gmail-mapper";
import { getValidAccessToken } from "@/lib/services/connectors";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_MESSAGES = 25;

async function gmailGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail API error ${response.status}: ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export const gmailReadonlyProvider: EmailProvider = {
  name: "gmail",
  mode: "read_only",
  async fetchUnread(): Promise<EmailMessage[]> {
    const accessToken = await getValidAccessToken("gmail");
    if (!accessToken) {
      throw new Error(
        "Gmail is not connected. Use the Connect Gmail button on the Email page after configuring Google OAuth per SETUP.md.",
      );
    }

    const list = await gmailGet<{ messages?: Array<{ id: string }> }>(
      `/messages?q=${encodeURIComponent("is:unread newer_than:14d")}&maxResults=${MAX_MESSAGES}`,
      accessToken,
    );
    const ids = (list.messages ?? []).map((m) => m.id);

    const messages: EmailMessage[] = [];
    for (const id of ids) {
      const raw = await gmailGet<GmailApiMessage>(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        accessToken,
      );
      messages.push(mapGmailMessage(raw));
    }
    return messages;
  },
};
