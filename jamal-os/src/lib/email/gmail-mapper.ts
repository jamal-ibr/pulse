// Pure mapping from Gmail API message payloads to EmailMessage.
// Separated from the provider so it is unit-testable without network.

import type { EmailMessage } from "./types";

export interface GmailApiMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  labelIds?: string[];
}

function header(message: GmailApiMessage, name: string): string {
  const found = message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

// Gmail snippets HTML-escape their content
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function mapGmailMessage(message: GmailApiMessage): EmailMessage {
  const receivedMs = Number(message.internalDate ?? Date.now());
  const snippet = decodeEntities(message.snippet ?? "");
  return {
    externalId: message.id,
    sender: header(message, "From") || "(unknown sender)",
    subject: header(message, "Subject") || "(no subject)",
    snippet,
    // The list sync intentionally stores the snippet, not the full
    // body: triage needs the gist, and full MIME bodies stay in Gmail
    body: snippet,
    receivedAt: new Date(receivedMs).toISOString(),
    isRead: !(message.labelIds ?? []).includes("UNREAD"),
  };
}
