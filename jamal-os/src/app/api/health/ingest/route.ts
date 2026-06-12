// Receives Apple Health data pushed by the Health Auto Export iPhone
// app. Authenticated with a shared bearer token (HEALTH_INGEST_TOKEN
// in .env.local); the phone is configured with the same token per
// SETUP.md. Read-only from the phone's perspective: this endpoint
// never sends anything back to Apple Health.

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { parseHealthExport } from "@/lib/health-ingest";

// Health Auto Export daily payloads are tens of kilobytes; anything
// near this cap is not a legitimate push.
const MAX_BODY_BYTES = 512 * 1024;

function tokenMatches(header: string, expected: string): boolean {
  const received = Buffer.from(header);
  const wanted = Buffer.from(`Bearer ${expected}`);
  // Length check first; timingSafeEqual requires equal lengths
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.HEALTH_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "HEALTH_INGEST_TOKEN is not set in .env.local (see SETUP.md)" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!tokenMatches(auth, expected)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: "Content-Length required" }, { status: 411 });
  }
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = parseHealthExport(payload);
  const total = parsed.metrics.length + parsed.weights.length + parsed.sleeps.length;
  if (total === 0) {
    return NextResponse.json(
      { error: "No recognisable Health Auto Export metrics in payload" },
      { status: 422 },
    );
  }

  for (const metric of parsed.metrics) {
    await db
      .insert(schema.healthMetrics)
      .values(metric)
      .onConflictDoUpdate({
        target: [schema.healthMetrics.date, schema.healthMetrics.metric],
        set: { value: metric.value, units: metric.units },
      });
  }
  for (const weight of parsed.weights) {
    await db
      .insert(schema.weightLogs)
      .values({ date: weight.date, weightKg: weight.weightKg, notes: "Apple Health" })
      .onConflictDoUpdate({
        target: schema.weightLogs.date,
        set: { weightKg: weight.weightKg },
      });
  }
  for (const sleep of parsed.sleeps) {
    await db
      .insert(schema.sleepLogs)
      .values({ date: sleep.date, sleepHours: sleep.sleepHours, notes: "Apple Health" })
      .onConflictDoUpdate({
        target: schema.sleepLogs.date,
        set: { sleepHours: sleep.sleepHours },
      });
  }

  await db.insert(schema.auditLogs).values({
    action: "health_ingest",
    target: "apple_health",
    detail: `${parsed.metrics.length} metrics, ${parsed.weights.length} weights, ${parsed.sleeps.length} sleep records`,
  });

  return NextResponse.json({
    ok: true,
    stored: {
      metrics: parsed.metrics.length,
      weights: parsed.weights.length,
      sleeps: parsed.sleeps.length,
    },
    // Health Auto Export shows this string in its automation log
    message: `Stored ${total} records`,
  });
}
