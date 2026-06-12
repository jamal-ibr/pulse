import { describe, expect, test } from "vitest";
import { buildMonzoAuthUrl, mapMonzoTransaction } from "../src/lib/monzo";

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_0001",
    created: "2026-06-10T12:30:00.000Z",
    amount: -1250,
    description: "PRET A MANGER",
    category: "eating_out",
    merchant: { name: "Pret a Manger" },
    ...overrides,
  };
}

describe("buildMonzoAuthUrl", () => {
  test("targets auth.monzo.com with code response type and state", () => {
    const url = new URL(
      buildMonzoAuthUrl({
        clientId: "oauth2client_1",
        redirectUri: "http://localhost:3000/api/oauth/monzo/callback",
        state: "state-9",
      }),
    );
    expect(url.origin).toBe("https://auth.monzo.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-9");
  });
});

describe("mapMonzoTransaction", () => {
  test("converts negative pennies to positive pounds", () => {
    const mapped = mapMonzoTransaction(makeTx());
    expect(mapped).toEqual({
      externalId: "tx_0001",
      date: "2026-06-10",
      amount: 12.5,
      category: "takeaway",
      merchant: "Pret a Manger",
      note: "PRET A MANGER",
    });
  });

  test("maps eating_out to takeaway and unknown categories to other", () => {
    expect(mapMonzoTransaction(makeTx({ category: "eating_out" }))?.category).toBe("takeaway");
    expect(mapMonzoTransaction(makeTx({ category: "charity" }))?.category).toBe("other");
    expect(mapMonzoTransaction(makeTx({ category: undefined }))?.category).toBe("other");
  });

  test("skips income and refunds", () => {
    expect(mapMonzoTransaction(makeTx({ amount: 250000 }))).toBeNull();
    expect(mapMonzoTransaction(makeTx({ amount: 0 }))).toBeNull();
  });

  test("skips declined transactions", () => {
    expect(mapMonzoTransaction(makeTx({ decline_reason: "INSUFFICIENT_FUNDS" }))).toBeNull();
  });

  test("skips internal pot transfers", () => {
    expect(mapMonzoTransaction(makeTx({ scheme: "uk_retail_pot" }))).toBeNull();
    expect(mapMonzoTransaction(makeTx({ description: "pot_0000Abc123" }))).toBeNull();
  });

  test("falls back to counterparty name for bank transfers", () => {
    const mapped = mapMonzoTransaction(
      makeTx({ merchant: null, counterparty: { name: "John Smith" } }),
    );
    expect(mapped?.merchant).toBe("John Smith");
  });

  test("prefers notes over description for the note field", () => {
    const mapped = mapMonzoTransaction(makeTx({ notes: "team lunch" }));
    expect(mapped?.note).toBe("team lunch");
  });
});
