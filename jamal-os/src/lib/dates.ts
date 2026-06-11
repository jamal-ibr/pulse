// Date helpers. All dates stored as ISO strings (YYYY-MM-DD).

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z");
  const to = new Date(toIso + "T00:00:00Z");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function isAfter2230(date: Date): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours > 22 || (hours === 22 && minutes >= 30);
}

export function weekStartIso(from: Date = new Date()): string {
  // Monday-start week.
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
