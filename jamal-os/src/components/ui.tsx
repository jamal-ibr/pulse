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
    <div className={`rounded-xl border border-edge bg-panel/80 p-4 ${className}`}>
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
    <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-dim">
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
      <div className={`font-mono text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
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
    good: "bg-accent/10 text-accent border border-accent/30",
    warn: "bg-warn/10 text-warn border border-warn/30",
    danger: "bg-danger/10 text-danger border border-danger/30",
    info: "bg-info/10 text-info border border-info/30",
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
    tone === "good"
      ? "bg-accent text-accent"
      : tone === "warn"
        ? "bg-warn text-warn"
        : "bg-danger text-danger";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%`, boxShadow: "0 0 6px 0 currentColor" }}
      />
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
  "w-full rounded-lg border border-edge bg-bg/70 px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40";

export const buttonClass =
  "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:bg-accent-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center justify-center rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs font-medium text-ink-dim transition hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
