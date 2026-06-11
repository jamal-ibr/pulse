import { db, schema } from "@/db/client";
import { asc, desc } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { todayIso, daysBetween } from "@/lib/dates";
import { addContact, logInteraction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const today = todayIso();
  const contacts = await db.query.contacts.findMany({ orderBy: asc(schema.contacts.name) });
  const interactions = await db.query.contactInteractions.findMany({
    orderBy: desc(schema.contactInteractions.date),
  });

  const withStatus = contacts.map((contact) => {
    const daysOverdue = contact.lastContact
      ? daysBetween(contact.lastContact, today) - contact.followUpCadenceDays
      : 999;
    const lastInteraction = interactions.find((i) => i.contactId === contact.id);
    return { contact, daysOverdue, lastInteraction };
  });
  const overdue = withStatus.filter((c) => c.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const current = withStatus.filter((c) => c.daysOverdue <= 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Contacts</h1>
        <p className="text-xs text-ink-faint">Relationships decay without cadence. Log every touch.</p>
      </div>

      <Card>
        <CardTitle>Add contact</CardTitle>
        <form action={addContact} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <input name="name" required placeholder="Name" className={inputClass} />
          <input name="relationship" required placeholder="Relationship" className={inputClass} />
          <select name="category" className={inputClass} defaultValue="friend">
            {["mentor", "work", "family", "friend", "business"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input name="followUpCadenceDays" type="number" defaultValue={30} min={1} className={inputClass} title="Cadence (days)" />
          <select name="priority" className={inputClass} defaultValue="normal">
            {["high", "normal", "low"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className={buttonClass}>Add</button>
        </form>
      </Card>

      {overdue.length > 0 && (
        <Card>
          <CardTitle>Overdue follow-ups ({overdue.length})</CardTitle>
          <div className="mt-3 space-y-2">
            {overdue.map(({ contact, daysOverdue }) => (
              <div key={contact.id} className="rounded-lg border border-amber-900/50 bg-bg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium">{contact.name}</span>
                    <span className="ml-2 text-xs text-ink-faint">{contact.relationship}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {contact.priority === "high" && <Badge tone="danger">high priority</Badge>}
                    <Badge tone="warn">{daysOverdue >= 999 ? "never contacted" : `${daysOverdue}d overdue`}</Badge>
                  </div>
                </div>
                {contact.notes && <p className="mt-1 text-xs text-ink-dim">{contact.notes}</p>}
                <form action={logInteraction} className="mt-2 flex gap-2">
                  <input type="hidden" name="contactId" value={contact.id} />
                  <select name="channel" className={`${inputClass} max-w-28 py-1 text-xs`} defaultValue="message">
                    {["message", "call", "in_person", "email"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                  </select>
                  <input name="note" placeholder="What was said" className={`${inputClass} py-1 text-xs`} />
                  <button className={buttonGhostClass}>Log touch</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>On cadence ({current.length})</CardTitle>
        <div className="mt-3 space-y-2">
          {current.length === 0 && <EmptyState title="Nobody is on cadence" />}
          {current.map(({ contact, daysOverdue }) => (
            <div key={contact.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2">
              <div>
                <span className="text-sm">{contact.name}</span>
                <span className="ml-2 text-xs text-ink-faint">{contact.category} · every {contact.followUpCadenceDays}d</span>
              </div>
              <span className="text-xs text-accent">due in {-daysOverdue}d</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
