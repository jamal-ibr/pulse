import { db, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, buttonGhostClass } from "@/components/ui";
import { triageEmail, detectDeadline } from "@/lib/email/triage";
import type { TriageCategory } from "@/lib/email/types";
import { draftReply, addDeadlineToCalendar, markRead, syncGmail } from "./actions";
import { CopyButton } from "@/components/copy-button";
import { readGoogleOAuthEnv } from "@/lib/google-oauth";
import { getConnectorAccount } from "@/lib/services/connectors";

export const dynamic = "force-dynamic";

const BUCKETS: Array<{ key: TriageCategory; label: string; tone: "danger" | "good" | "warn" | "info" | "neutral" }> = [
  { key: "pulse_lead", label: "Pulse AI Lead", tone: "good" },
  { key: "needs_reply", label: "Needs Reply", tone: "info" },
  { key: "ey_bpp_deadline", label: "EY-BPP Deadline", tone: "warn" },
  { key: "risk", label: "Risk", tone: "danger" },
  { key: "opportunity", label: "Opportunity", tone: "neutral" },
  { key: "noise", label: "Noise", tone: "neutral" },
];

export default async function EmailPage(props: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const oauthConfigured = readGoogleOAuthEnv() !== null;
  const gmailAccount = await getConnectorAccount("gmail");
  const gmailConnected = Boolean(gmailAccount?.encryptedToken);
  const emails = await db.query.emailMessages.findMany({
    orderBy: desc(schema.emailMessages.receivedAt),
  });
  const drafts = await db.query.emailDrafts.findMany({
    orderBy: desc(schema.emailDrafts.createdAt),
  });
  const draftsByEmail = new Map<number, (typeof drafts)[number]>();
  for (const draft of drafts) {
    if (!draftsByEmail.has(draft.emailId)) draftsByEmail.set(draft.emailId, draft);
  }

  const unread = emails.filter((e) => !e.isRead);
  const categorised = unread.map((e) => ({
    email: e,
    category: (e.category as TriageCategory) ?? triageEmail(e.sender, e.subject, e.body),
    deadline: e.detectedDeadline ?? detectDeadline(e.subject + "\n" + e.body, new Date(e.receivedAt)),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Email triage</h1>
          <p className="text-xs text-ink-faint">
            {gmailConnected
              ? "Gmail connected, read-only. Drafts are never sent automatically."
              : "Mock inbox. Gmail connector is read-only by design. Drafts are never sent automatically."}
          </p>
        </div>
        {gmailConnected ? (
          <form action={syncGmail}>
            <button type="submit" className={buttonGhostClass}>
              Sync Gmail
            </button>
          </form>
        ) : oauthConfigured ? (
          <a href="/api/oauth/google/start" className={buttonGhostClass}>
            Connect Gmail (read-only)
          </a>
        ) : (
          <span className="text-[11px] text-ink-faint">
            Add Google OAuth keys to .env.local to connect Gmail (SETUP.md)
          </span>
        )}
      </div>

      {searchParams.connected === "gmail" && (
        <Card>
          <p className="text-sm text-accent">
            Gmail connected with read-only access. Use Sync Gmail to pull
            unread messages into triage.
          </p>
        </Card>
      )}
      {searchParams.error && (
        <Card>
          <p className="text-sm text-danger">
            Gmail connection failed ({searchParams.error}). Check the Google
            OAuth values in .env.local and try again.
          </p>
        </Card>
      )}

      {BUCKETS.map((bucket) => {
        const items = categorised.filter((c) => c.category === bucket.key);
        if (items.length === 0) return null;
        return (
          <Card key={bucket.key}>
            <div className="flex items-center gap-2">
              <CardTitle>{bucket.label}</CardTitle>
              <Badge tone={bucket.tone}>{items.length}</Badge>
            </div>
            <div className="mt-3 space-y-3">
              {items.map(({ email, deadline }) => {
                const draft = draftsByEmail.get(email.id);
                return (
                  <div key={email.id} className="rounded-lg border border-edge bg-bg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{email.subject}</div>
                        <div className="text-xs text-ink-faint">{email.sender} · {email.receivedAt.slice(0, 10)}</div>
                      </div>
                      {deadline && <Badge tone="warn">Deadline {deadline}</Badge>}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink-dim">{email.snippet}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={draftReply}>
                        <input type="hidden" name="emailId" value={email.id} />
                        <button className={buttonGhostClass}>Draft reply</button>
                      </form>
                      {deadline && (
                        <form action={addDeadlineToCalendar}>
                          <input type="hidden" name="emailId" value={email.id} />
                          <button className={buttonGhostClass}>Add deadline to calendar</button>
                        </form>
                      )}
                      <form action={markRead}>
                        <input type="hidden" name="emailId" value={email.id} />
                        <button className={buttonGhostClass}>Mark read</button>
                      </form>
                    </div>
                    {draft && (
                      <div className="mt-3 rounded-lg border border-edge bg-panel p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                            Draft (saved locally, never sent)
                          </span>
                          <CopyButton text={draft.draftBody} />
                        </div>
                        <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-dim">
                          {draft.draftBody}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {unread.length === 0 && (
        <EmptyState title="Inbox zero" hint="All mock emails marked read. Re-seed to restore them." />
      )}
    </div>
  );
}
