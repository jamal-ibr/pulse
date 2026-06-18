// Email connector abstraction. Mock provider works out of the box;
// the Gmail provider is a read-only scaffold (gmail.readonly scope only,
// no send, no modify).

export interface EmailMessage {
  externalId: string;
  sender: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
}

export type TriageCategory =
  | "needs_reply"
  | "pulse_lead"
  | "ey_bpp_deadline"
  | "noise"
  | "opportunity"
  | "risk";

export interface EmailProvider {
  name: string;
  mode: "mock" | "read_only";
  fetchUnread(): Promise<EmailMessage[]>;
}
