// SCAFFOLD: Gmail read-only provider. Not yet implemented.
//
// Rules baked into this design (see docs/privacy.md):
// - Scope is https://www.googleapis.com/auth/gmail.readonly ONLY.
// - No send scope is ever requested. Replies are drafted locally and
//   copied manually.
// - OAuth tokens must be encrypted at rest with LOCAL_ENCRYPTION_KEY
//   before storage in connector_accounts.encrypted_token.
//
// Setup steps for the real implementation are documented in SETUP.md.

import type { EmailProvider, EmailMessage } from "./types";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const gmailReadonlyProvider: EmailProvider = {
  name: "gmail",
  mode: "read_only",
  async fetchUnread(): Promise<EmailMessage[]> {
    throw new Error(
      "Gmail provider is scaffolded but not implemented. Configure Google OAuth per SETUP.md, then implement token exchange and messages.list/messages.get here. The app works fully with the mock provider meanwhile.",
    );
  },
};
