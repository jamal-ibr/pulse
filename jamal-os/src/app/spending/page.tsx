import { db, schema } from "@/db/client";
import { desc, gte } from "drizzle-orm";
import { Card, CardTitle, Stat, Badge, EmptyState, inputClass, buttonClass } from "@/components/ui";
import { takeawayRolling30, businessPersonalSplit, categoryTotals, detectLeaks, TAKEAWAY_BASELINE } from "@/lib/spending-logic";
import { todayIso, daysAgoIso } from "@/lib/dates";
import { addSpend, importCsv, syncMonzo } from "./actions";
import { buttonGhostClass } from "@/components/ui";
import { readMonzoEnv } from "@/lib/monzo";
import { getConnectorAccount } from "@/lib/services/connectors";

export const dynamic = "force-dynamic";

const CATEGORIES = ["groceries", "takeaway", "transport", "subscriptions", "business", "other"];

export default async function SpendingPage(props: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const monzoConfigured = readMonzoEnv() !== null;
  const monzoAccount = await getConnectorAccount("monzo");
  const monzoConnected = Boolean(monzoAccount?.encryptedToken);
  const today = todayIso();
  const rows = await db.query.spending.findMany({
    where: gte(schema.spending.date, daysAgoIso(31)),
    orderBy: desc(schema.spending.date),
  });
  const records = rows.map((r) => ({
    date: r.date,
    amount: r.amount,
    category: r.category,
    isBusiness: r.isBusiness,
  }));

  const takeaway30 = takeawayRolling30(records, today);
  const split = businessPersonalSplit(records);
  const totals = categoryTotals(records.filter((r) => !r.isBusiness));
  const leaks = detectLeaks(records);
  const weekRows = records.filter((r) => r.date >= daysAgoIso(7));
  const weekTotal = Math.round(weekRows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const imports = await db.query.csvImports.findMany({ orderBy: desc(schema.csvImports.createdAt) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Spending</h1>
          <p className="text-xs text-ink-faint">Rolling 30 days. Structural change beats willpower.</p>
        </div>
        {monzoConnected ? (
          <form action={syncMonzo}>
            <button type="submit" className={buttonGhostClass}>
              Sync Monzo
            </button>
          </form>
        ) : monzoConfigured ? (
          <a href="/api/oauth/monzo/start" className={buttonGhostClass}>
            Connect Monzo (read-only)
          </a>
        ) : null}
      </div>

      {searchParams.connected === "monzo" && (
        <Card>
          <p className="text-sm text-accent">
            Monzo connected. Open the Monzo app on your phone and approve the
            connection, then come back and press Sync Monzo.
          </p>
        </Card>
      )}
      {searchParams.error && (
        <Card>
          <p className="text-sm text-danger">
            Monzo connection failed ({searchParams.error}). Check the values
            in .env.local and try again.
          </p>
        </Card>
      )}

      <div className={`rounded-xl border p-4 ${takeaway30 >= 8 ? "border-red-900 bg-red-950/50" : "border-edge bg-panel"}`}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className={`text-3xl font-bold tabular-nums ${takeaway30 >= 8 ? "text-danger" : takeaway30 >= 5 ? "text-warn" : "text-accent"}`}>
              {takeaway30}
            </div>
            <div className="text-xs text-ink-dim">Takeaway orders, rolling 30 days</div>
          </div>
          <div className="text-right text-[11px] text-ink-faint">
            Historical baseline: {TAKEAWAY_BASELINE.per30Days} per 30 days
            <br />
            ({TAKEAWAY_BASELINE.orders} orders in {TAKEAWAY_BASELINE.days} days)
            <br />
            <span className="font-medium text-danger">The line never to return to.</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><Stat label="This week" value={`£${weekTotal}`} /></Card>
        <Card><Stat label="Personal (30d)" value={`£${split.personal}`} /></Card>
        <Card><Stat label="Business (30d)" value={`£${split.business}`} hint="Pulse AI expenses" /></Card>
      </div>

      {leaks.length > 0 && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-sm text-warn">
          Spending leak detected: {leaks.join(", ")} dominates personal spend this month.
        </div>
      )}

      <Card>
        <CardTitle>Quick add</CardTitle>
        <form action={addSpend} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <input name="date" type="date" defaultValue={today} className={inputClass} />
          <input name="amount" type="number" step="0.01" min="0.01" required placeholder="£" className={inputClass} />
          <select name="category" className={inputClass} defaultValue="groceries">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="merchant" placeholder="Merchant" className={inputClass} />
          <input name="note" placeholder="Note" className={inputClass} />
          <button className={buttonClass}>Add</button>
        </form>
      </Card>

      <Card>
        <CardTitle>CSV import</CardTitle>
        <form action={importCsv} className="mt-3 flex flex-wrap items-center gap-2">
          <input name="file" type="file" accept=".csv,text/csv" required className={`${inputClass} max-w-xs`} />
          <button className={buttonClass}>Import</button>
          <span className="text-[11px] text-ink-faint">
            Monzo and typical UK bank exports supported. See SETUP.md for formats.
          </span>
        </form>
        {imports.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-edge pt-2 text-[11px] text-ink-faint">
            {imports.slice(0, 3).map((i) => (
              <div key={i.id}>
                {i.filename}: {i.rowsImported} rows ({i.createdAt.slice(0, 10)})
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Category totals, 30 days (personal)</CardTitle>
        <div className="mt-3 space-y-1.5">
          {Object.entries(totals)
            .sort(([, a], [, b]) => b - a)
            .map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="text-ink-dim">{category}</span>
                <span className="tabular-nums">£{amount}</span>
              </div>
            ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Recent transactions</CardTitle>
        <div className="mt-3 space-y-1.5">
          {rows.length === 0 && <EmptyState title="No spending logged" />}
          {rows.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="w-12 shrink-0 text-xs text-ink-faint">{r.date.slice(5)}</span>
              <span className="min-w-0 flex-1 truncate">{r.merchant ?? r.note ?? r.category}</span>
              <Badge tone={r.category === "takeaway" ? "danger" : r.isBusiness ? "info" : "neutral"}>{r.category}</Badge>
              <span className="w-16 text-right tabular-nums">£{r.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
