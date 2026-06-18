// Spending rules. Pure functions, unit-tested.

export interface SpendRecord {
  date: string; // ISO
  amount: number;
  category: string;
  isBusiness: boolean;
}

// Historical baseline: 149 takeaway orders in 174 days. The line never to
// return to, expressed as a rolling 30-day equivalent.
export const TAKEAWAY_BASELINE = {
  orders: 149,
  days: 174,
  per30Days: Math.round((149 / 174) * 30), // 26
};

export function takeawayRolling30(
  records: SpendRecord[],
  today: string,
): number {
  const cutoff = new Date(today + "T00:00:00Z");
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return records.filter(
    (r) => r.category === "takeaway" && r.date > cutoffIso && r.date <= today,
  ).length;
}

export function businessPersonalSplit(records: SpendRecord[]): {
  business: number;
  personal: number;
} {
  let business = 0;
  let personal = 0;
  for (const r of records) {
    if (r.isBusiness) business += r.amount;
    else personal += r.amount;
  }
  return {
    business: Math.round(business * 100) / 100,
    personal: Math.round(personal * 100) / 100,
  };
}

export function categoryTotals(records: SpendRecord[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of records) {
    totals[r.category] = Math.round(((totals[r.category] ?? 0) + r.amount) * 100) / 100;
  }
  return totals;
}

// Spending leak: any non-business category exceeding both £50 and 25% of
// total personal spend in the window.
export function detectLeaks(records: SpendRecord[]): string[] {
  const personal = records.filter((r) => !r.isBusiness);
  const total = personal.reduce((sum, r) => sum + r.amount, 0);
  if (total === 0) return [];
  const totals = categoryTotals(personal);
  return Object.entries(totals)
    .filter(([, amount]) => amount > 50 && amount / total > 0.25)
    .map(([category]) => category);
}
