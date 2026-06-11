import Link from "next/link";
import { db, schema } from "@/db/client";
import { desc, like, or } from "drizzle-orm";
import { Card, CardTitle, Badge, EmptyState, inputClass, buttonClass, buttonGhostClass } from "@/components/ui";
import { addMemory, forgetMemory, toggleSensitive } from "./actions";

export const dynamic = "force-dynamic";

const MEMORY_TYPES = [
  "identity", "goals", "preferences", "constraints", "current_projects",
  "people", "routines", "lessons_learned", "wins", "weakness_patterns",
  "avoidance_patterns", "long_term_vision", "private_notes",
];

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const items = q
    ? await db.query.memoryItems.findMany({
        where: or(
          like(schema.memoryItems.title, `%${q}%`),
          like(schema.memoryItems.content, `%${q}%`),
          like(schema.memoryItems.tags, `%${q}%`),
        ),
        orderBy: desc(schema.memoryItems.updatedAt),
      })
    : await db.query.memoryItems.findMany({
        orderBy: desc(schema.memoryItems.updatedAt),
      });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Memory</h1>
          <p className="text-xs text-ink-faint">
            Private memory layer. Sensitive items never reach AI unless explicitly included.
          </p>
        </div>
        <a
          href={`data:application/json,${encodeURIComponent(JSON.stringify(items, null, 2))}`}
          download="jamal-os-memory-export.json"
          className={buttonGhostClass}
        >
          Export JSON
        </a>
      </div>

      <form className="flex gap-2" action="/memory" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder="Search memory" className={inputClass} />
        <button className={buttonClass}>Search</button>
        {q && <Link href="/memory" className={buttonGhostClass}>Clear</Link>}
      </form>

      <Card>
        <CardTitle>Add memory</CardTitle>
        <form action={addMemory} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <select name="type" className={inputClass} defaultValue="lessons_learned">
            {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <input name="title" required placeholder="Title" className={inputClass} />
          <input name="tags" placeholder="Tags (comma separated)" className={inputClass} />
          <select name="sensitivity" className={inputClass} defaultValue="normal">
            <option value="normal">normal</option>
            <option value="sensitive">sensitive</option>
          </select>
          <textarea name="content" required placeholder="Content" rows={2} className={`${inputClass} col-span-2 md:col-span-3`} />
          <button className={buttonClass}>Add</button>
        </form>
      </Card>

      <div className="space-y-2">
        {items.length === 0 && <EmptyState title={q ? `No memory matches "${q}"` : "No memory yet"} />}
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <Badge tone="neutral">{item.type.replace(/_/g, " ")}</Badge>
                  {item.sensitivity === "sensitive" && <Badge tone="danger">sensitive</Badge>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-dim">{item.content}</p>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {item.tags && <>tags: {item.tags} · </>}confidence: {item.confidence} · updated {item.updatedAt.slice(0, 10)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <form action={toggleSensitive}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className={buttonGhostClass}>
                    {item.sensitivity === "sensitive" ? "Unmark" : "Mark sensitive"}
                  </button>
                </form>
                <form action={forgetMemory}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className={buttonGhostClass}>Forget</button>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
