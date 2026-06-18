// Generic bank CSV parser for spending import. Handles Monzo and typical
// UK bank exports. Column mapping is resolved from headers, with manual
// mapping supported by the caller.

export interface ParsedTransaction {
  date: string; // ISO date
  amount: number; // positive spend amount
  merchant: string;
  category: string;
  note: string;
}

export interface ColumnMapping {
  date: string;
  amount: string;
  merchant?: string;
  description?: string;
  category?: string;
}

const KNOWN_DATE_HEADERS = ["date", "transaction date", "created", "date and time"];
const KNOWN_AMOUNT_HEADERS = ["amount", "value", "debit", "money out", "amount (gbp)"];
const KNOWN_MERCHANT_HEADERS = ["merchant", "name", "counterparty", "payee"];
const KNOWN_DESCRIPTION_HEADERS = ["description", "reference", "memo", "notes", "details"];
const KNOWN_CATEGORY_HEADERS = ["category", "type"];

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function detectMapping(headers: string[]): ColumnMapping | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (candidates: string[]) => {
    const idx = lower.findIndex((h) => candidates.includes(h));
    return idx >= 0 ? headers[idx] : undefined;
  };
  const date = find(KNOWN_DATE_HEADERS);
  const amount = find(KNOWN_AMOUNT_HEADERS);
  if (!date || !amount) return null;
  return {
    date,
    amount,
    merchant: find(KNOWN_MERCHANT_HEADERS),
    description: find(KNOWN_DESCRIPTION_HEADERS),
    category: find(KNOWN_CATEGORY_HEADERS),
  };
}

function normaliseDate(raw: string): string | null {
  const trimmed = raw.trim();
  // ISO or ISO datetime
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // UK format dd/mm/yyyy
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (uk) {
    return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  return null;
}

const CATEGORY_MAP: Record<string, string> = {
  groceries: "groceries",
  "eating out": "takeaway",
  takeaway: "takeaway",
  takeaways: "takeaway",
  food: "groceries",
  transport: "transport",
  travel: "transport",
  subscriptions: "subscriptions",
  bills: "subscriptions",
  business: "business",
  general: "other",
  shopping: "other",
  entertainment: "other",
};

function normaliseCategory(raw: string | undefined): string {
  if (!raw) return "other";
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? "other";
}

export function rowsToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
): ParsedTransaction[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const idx = (name: string | undefined) =>
    name ? headers.findIndex((h) => h === name) : -1;

  const dateIdx = idx(mapping.date);
  const amountIdx = idx(mapping.amount);
  const merchantIdx = idx(mapping.merchant);
  const descIdx = idx(mapping.description);
  const catIdx = idx(mapping.category);

  const transactions: ParsedTransaction[] = [];
  for (const row of rows.slice(1)) {
    const date = normaliseDate(row[dateIdx] ?? "");
    const rawAmount = (row[amountIdx] ?? "").replace(/[£,\s]/g, "");
    const amount = Number(rawAmount);
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    // Monzo exports spends as negative numbers. Imports track spend only,
    // so income rows (positive in Monzo convention with a debit column
    // absent) are kept as absolute values; callers can filter.
    transactions.push({
      date,
      amount: Math.abs(amount),
      merchant: (merchantIdx >= 0 ? row[merchantIdx] : "")?.trim() || "Unknown",
      category: normaliseCategory(catIdx >= 0 ? row[catIdx] : undefined),
      note: (descIdx >= 0 ? row[descIdx] : "")?.trim() || "",
    });
  }
  return transactions;
}

export function parseBankCsv(text: string): {
  transactions: ParsedTransaction[];
  error?: string;
} {
  const rows = parseCsv(text);
  if (rows.length === 0) return { transactions: [], error: "Empty file" };
  const mapping = detectMapping(rows[0]);
  if (!mapping) {
    return {
      transactions: [],
      error:
        "Could not detect date and amount columns. Expected headers like Date, Amount, Description.",
    };
  }
  return { transactions: rowsToTransactions(rows, mapping) };
}
