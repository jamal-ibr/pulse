import React from "react";
import Link from "next/link";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-edge bg-panel p-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  const title = (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-dim">
      {children}
    </h2>
  );
  if (href) {
    return (
      <Link href={href} className="group flex items-center justify-between">
        {title}
        <span className="text-ink-faint transition group-hover:text-accent">&rarr;</span>
      </Link>
    );
  }
  return title;
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
  hint?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-accent"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-ink-dim">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-edge text-ink-dim",
    good: "bg-emerald-950 text-accent border border-emerald-900",
    warn: "bg-amber-950 text-warn border border-amber-900",
    danger: "bg-red-950 text-danger border border-red-900",
    info: "bg-blue-950 text-info border border-blue-900",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "good",
}: {
  value: number;
  max: number;
  tone?: "good" | "warn" | "danger";
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color =
    tone === "good" ? "bg-accent" : tone === "warn" ? "bg-warn" : "bg-danger";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-edge px-4 py-8 text-center">
      <p className="text-sm text-ink-dim">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-edge bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export const buttonClass =
  "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent-dim disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center justify-center rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs font-medium text-ink-dim transition hover:border-accent hover:text-accent";
