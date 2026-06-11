"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  {
    label: "Command",
    items: [
      ["/", "Daily Brief"],
      ["/planner", "Planner"],
      ["/weekly-review", "Weekly Review"],
      ["/level", "Level"],
    ],
  },
  {
    label: "Execution",
    items: [
      ["/pipeline", "Pulse Pipeline"],
      ["/tasks", "Tasks"],
      ["/projects", "Projects"],
      ["/build-queue", "Build Queue"],
    ],
  },
  {
    label: "Body and Mind",
    items: [
      ["/habits", "Habits"],
      ["/fitness", "Fitness"],
      ["/reading", "Reading"],
    ],
  },
  {
    label: "Life",
    items: [
      ["/spending", "Spending"],
      ["/contacts", "Contacts"],
      ["/memory", "Memory"],
    ],
  },
  {
    label: "Inbox",
    items: [
      ["/email", "Email"],
      ["/calendar", "Calendar"],
      ["/settings", "Settings"],
    ],
  },
];

const MOBILE_NAV: Array<[string, string, string]> = [
  ["/", "Brief", "◉"],
  ["/habits", "Log", "✓"],
  ["/tasks", "Tasks", "▤"],
  ["/pipeline", "Pulse", "▶"],
  ["/level", "Level", "▲"],
];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`font-mono font-bold uppercase tracking-[0.22em] ${
        compact ? "text-sm" : "text-base"
      }`}
    >
      Jamal&nbsp;<span className="glow-accent text-accent">OS</span>
    </span>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-accent/10 font-semibold text-accent"
          : "text-ink-dim hover:bg-panel-hover hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

export function Sidebar({ dataMode }: { dataMode: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-edge bg-panel/60 px-3 py-5 backdrop-blur-sm md:flex">
      <Link href="/" className="px-3">
        <BrandMark />
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] leading-tight text-ink-faint">
          Discipline. Strategy. Becoming.
        </div>
      </Link>
      <nav className="mt-6 flex-1 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {group.label}
            </div>
            {group.items.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} />
            ))}
          </div>
        ))}
      </nav>
      <DataModeIndicator mode={dataMode} />
    </aside>
  );
}

export function DataModeIndicator({ mode }: { mode: string }) {
  const labels: Record<string, [string, string]> = {
    local_mock: ["Local mock", "text-warn"],
    local_real: ["Local live", "text-accent"],
    connected_read: ["Connected read", "text-info"],
    connected_write: ["Connected write", "text-danger"],
  };
  const [label, tone] = labels[mode] ?? labels.local_mock;
  return (
    <div className="mx-3 flex items-center gap-2 rounded-full border border-edge bg-bg/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
      <span className={`hud-dot h-2 w-2 rounded-full bg-current ${tone}`} />
      {label}
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-edge bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {MOBILE_NAV.map(([href, label, icon]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-2 font-mono text-[10px] uppercase tracking-wide ${
              active ? "glow-accent text-accent" : "text-ink-dim"
            }`}
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TopBar({ dataMode }: { dataMode: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-edge bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/">
        <BrandMark compact />
      </Link>
      <DataModeIndicator mode={dataMode} />
    </header>
  );
}
