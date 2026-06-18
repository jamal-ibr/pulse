// Pure parsing for Health Auto Export payloads (the iPhone app that
// POSTs Apple Health data to a REST endpoint). No IO here; the route
// in src/app/api/health/ingest applies the results to the database.
//
// Payload shape (abridged):
// { "data": { "metrics": [
//     { "name": "step_count", "units": "count",
//       "data": [{ "date": "2026-06-12 07:00:00 +0100", "qty": 4211 }] }
// ] } }

export interface NormalizedMetric {
  date: string; // YYYY-MM-DD
  metric: string;
  value: number;
  units: string | null;
}

export interface HealthIngestResult {
  metrics: NormalizedMetric[];
  weights: Array<{ date: string; weightKg: number }>;
  sleeps: Array<{ date: string; sleepHours: number }>;
}

interface RawDataPoint {
  date?: unknown;
  qty?: unknown;
  asleep?: unknown;
  totalSleep?: unknown;
  avg?: unknown;
}

interface RawMetric {
  name?: unknown;
  units?: unknown;
  data?: unknown;
}

const LB_TO_KG = 0.45359237;

// Units where multiple samples in a day add up; everything else
// (bpm, kg, %, ratings) is averaged.
const SUMMED_UNITS = new Set(["count", "kcal", "kj", "km", "mi", "m", "min", "hr", "l"]);

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseHealthExport(payload: unknown): HealthIngestResult {
  const result: HealthIngestResult = { metrics: [], weights: [], sleeps: [] };
  const metrics =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "metrics" in payload.data &&
    Array.isArray(payload.data.metrics)
      ? (payload.data.metrics as RawMetric[])
      : null;
  if (!metrics) return result;

  // Accumulate per (metric, date) so multi-sample days collapse to one row
  const buckets = new Map<
    string,
    { date: string; metric: string; units: string | null; sum: number; count: number }
  >();
  const sleepByDate = new Map<string, number>();
  const weightByDate = new Map<string, number>();

  for (const raw of metrics) {
    // Metric names from the payload are stored verbatim; constrain them
    const name =
      typeof raw.name === "string" && /^[a-z0-9_]{1,100}$/i.test(raw.name)
        ? raw.name
        : null;
    const units = typeof raw.units === "string" ? raw.units.toLowerCase() : null;
    if (!name || !Array.isArray(raw.data)) continue;

    for (const point of raw.data as RawDataPoint[]) {
      const date = dateOnly(point.date);
      if (!date) continue;

      if (name === "sleep_analysis") {
        const hours =
          numeric(point.asleep) ?? numeric(point.totalSleep) ?? numeric(point.qty);
        if (hours !== null && hours > 0) {
          sleepByDate.set(date, (sleepByDate.get(date) ?? 0) + hours);
        }
        continue;
      }

      const quantity = numeric(point.qty) ?? numeric(point.avg);
      if (quantity === null) continue;

      if (name === "weight_body_mass") {
        const kg = units === "lb" ? quantity * LB_TO_KG : quantity;
        // Last reading of the day wins
        weightByDate.set(date, Number(kg.toFixed(2)));
        continue;
      }

      const key = `${name}|${date}`;
      const bucket = buckets.get(key) ?? { date, metric: name, units, sum: 0, count: 0 };
      bucket.sum += quantity;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
  }

  for (const bucket of buckets.values()) {
    const summed = bucket.units !== null && SUMMED_UNITS.has(bucket.units);
    const value = summed ? bucket.sum : bucket.sum / bucket.count;
    result.metrics.push({
      date: bucket.date,
      metric: bucket.metric,
      value: Number(value.toFixed(2)),
      units: bucket.units,
    });
  }
  for (const [date, weightKg] of weightByDate) {
    result.weights.push({ date, weightKg });
  }
  for (const [date, hours] of sleepByDate) {
    result.sleeps.push({ date, sleepHours: Number(hours.toFixed(2)) });
  }
  return result;
}
