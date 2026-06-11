import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { Card, CardTitle, Badge, inputClass, buttonClass } from "@/components/ui";
import { getSetting } from "@/lib/services/settings";
import { activeProvider } from "@/lib/ai/provider";
import { setDataMode } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const dataMode = await getSetting("data_mode", "local_mock");
  const permissions = await db.query.permissionRules.findMany();
  const connectors = await db.query.connectorAccounts.findMany();
  const auditLogs = await db.query.auditLogs.findMany({
    orderBy: desc(schema.auditLogs.createdAt),
  });
  const aiCalls = await db.query.aiInteractions.findMany({
    orderBy: desc(schema.aiInteractions.createdAt),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-xs text-ink-faint">Local-first. Nothing leaves this machine without explicit consent.</p>
      </div>

      <Card>
        <CardTitle>Data mode</CardTitle>
        <form action={setDataMode} className="mt-3 flex gap-2">
          <select name="mode" defaultValue={dataMode} className={inputClass}>
            <option value="local_mock">Local mock mode</option>
            <option value="local_real">Local real data mode</option>
            <option value="connected_read">Connected read-only mode</option>
            <option value="connected_write">Connected write-enabled mode</option>
          </select>
          <button className={buttonClass}>Set</button>
        </form>
        <p className="mt-2 text-[11px] text-ink-faint">
          The indicator in the sidebar reflects this mode. Connected modes require OAuth setup per SETUP.md; until then connectors stay mocked.
        </p>
      </Card>

      <Card>
        <CardTitle>AI provider</CardTitle>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Badge tone={activeProvider() === "anthropic" ? "good" : "warn"}>{activeProvider()}</Badge>
          <span className="text-xs text-ink-dim">
            {activeProvider() === "anthropic"
              ? "Anthropic API key found in .env.local. Redaction applies to every call."
              : "No ANTHROPIC_API_KEY in .env.local. All AI features run on the deterministic mock provider."}
          </span>
        </div>
      </Card>

      <Card>
        <CardTitle>Permission registry</CardTitle>
        <div className="mt-3 space-y-1.5">
          {permissions.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-mono text-xs">{rule.scope}</span>
                {rule.note && <p className="text-[11px] text-ink-faint">{rule.note}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Badge tone={rule.allowed ? "good" : "neutral"}>{rule.allowed ? "allowed" : "off"}</Badge>
                {rule.requiresConfirmation && <Badge tone="warn">confirm required</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Connectors</CardTitle>
        <div className="mt-3 space-y-1.5">
          {connectors.map((connector) => (
            <div key={connector.id} className="flex items-center justify-between text-sm">
              <span>{connector.provider}</span>
              <Badge tone={connector.mode === "mock" ? "warn" : "good"}>{connector.mode}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Gmail is read-only by design and never gets a send scope. Calendar writes always require a confirmation click. OAuth setup steps are in SETUP.md.
        </p>
      </Card>

      <Card>
        <CardTitle>Action audit log</CardTitle>
        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {auditLogs.slice(0, 50).map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono">{log.action}</span>
              <span className="truncate text-ink-faint">{log.detail ?? log.target}</span>
              <span className="shrink-0 text-ink-faint">{log.createdAt.slice(0, 16).replace("T", " ")}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>AI interaction log ({aiCalls.length})</CardTitle>
        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {aiCalls.slice(0, 30).map((call) => (
            <div key={call.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono">{call.promptName}</span>
              <Badge tone={call.provider === "anthropic" ? "good" : "neutral"}>{call.provider}</Badge>
              <span className="shrink-0 text-ink-faint">{call.createdAt.slice(0, 16).replace("T", " ")}</span>
            </div>
          ))}
          {aiCalls.length === 0 && <span className="text-xs text-ink-faint">No AI calls yet.</span>}
        </div>
      </Card>
    </div>
  );
}
