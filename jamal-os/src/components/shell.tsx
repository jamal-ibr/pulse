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

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-panel-hover font-semibold text-accent"
          : "text-ink-dim hover:bg-panel-hover hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

export function Sidebar({ dataMode }: { dataMode: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-edge bg-panel/50 px-3 py-5 md:flex">
      <Link href="/" className="px-3">
        <div className="text-lg font-bold tracking-tight">
          Jamal <span className="text-accent">OS</span>
        </div>
        <div className="mt-0.5 text-[10px] leading-tight text-ink-faint">
          Discipline. Strategy. Becoming.
        </div>
      </Link>
      <nav className="mt-6 flex-1 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
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
    local_mock: ["Local mock mode", "bg-amber-400"],
    local_real: ["Local real data", "bg-emerald-400"],
    connected_read: ["Connected read-only", "bg-blue-400"],
    connected_write: ["Connected write-enabled", "bg-red-400"],
  };
  const [label, dot] = labels[mode] ?? labels.local_mock;
  return (
    <div className="mx-3 flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-[11px] text-ink-dim">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-edge bg-panel/95 backdrop-blur md:hidden">
      {MOBILE_NAV.map(([href, label, icon]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              active ? "text-accent" : "text-ink-dim"
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
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-edge bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/" className="text-base font-bold">
        Jamal <span className="text-accent">OS</span>
      </Link>
      <DataModeIndicator mode={dataMode} />
    </header>
  );
}
