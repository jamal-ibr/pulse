import { describe, test, expect } from "vitest";
import { parseBankCsv, parseCsv, detectMapping } from "../src/lib/csv";

describe("CSV parser", () => {
  test("parses a basic Monzo-style export", () => {
    const csv = [
      "Date,Name,Category,Amount,Description",
      '01/06/2026,Deliveroo,Eating out,-14.50,"Dinner, late"',
      "02/06/2026,Aldi,Groceries,-42.30,Weekly shop",
    ].join("\n");
    const { transactions, error } = parseBankCsv(csv);
    expect(error).toBeUndefined();
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      date: "2026-06-01",
      amount: 14.5,
      merchant: "Deliveroo",
      category: "takeaway",
    });
    expect(transactions[0].note).toBe("Dinner, late");
  });

  test("handles ISO dates and pound signs", () => {
    const csv = "Date,Amount,Description\n2026-06-03,£9.99,Spotify";
    const { transactions } = parseBankCsv(csv);
    expect(transactions[0].date).toBe("2026-06-03");
    expect(transactions[0].amount).toBe(9.99);
  });

  test("rejects files without detectable columns", () => {
    const { transactions, error } = parseBankCsv("Foo,Bar\n1,2");
    expect(transactions).toHaveLength(0);
    expect(error).toBeDefined();
  });

  test("quoted fields with commas survive", () => {
    const rows = parseCsv('a,"b,c",d');
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
  });

  test("detects mapping from typical UK headers", () => {
    const mapping = detectMapping(["Transaction Date", "Description", "Amount"]);
    expect(mapping).not.toBeNull();
    expect(mapping!.date).toBe("Transaction Date");
    expect(mapping!.amount).toBe("Amount");
  });
});
