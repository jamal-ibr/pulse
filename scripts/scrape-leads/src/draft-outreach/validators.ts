import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ForbiddenConfig {
  phrases: string[];
  phrases_word_boundary: string[];
}

let cached: ForbiddenConfig | null = null;
export function loadForbiddenConfig(): ForbiddenConfig {
  if (cached) return cached;
  // Compiled path lands in dist/draft-outreach/, source path is src/draft-outreach/.
  // We bundle the JSON from src into dist via a copy step OR just resolve to src dir.
  const candidates = [
    resolve(__dirname, "config", "forbidden-phrases.json"),
    resolve(__dirname, "..", "..", "src", "draft-outreach", "config", "forbidden-phrases.json"),
  ];
  for (const p of candidates) {
    try {
      const txt = readFileSync(p, "utf8");
      cached = JSON.parse(txt) as ForbiddenConfig;
      cached.phrases ??= [];
      cached.phrases_word_boundary ??= [];
      return cached;
    } catch {
      /* try next */
    }
  }
  cached = { phrases: [], phrases_word_boundary: [] };
  return cached;
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export interface ValidationFailure {
  ok: false;
  reason: string;
  feedback: string; // passed back to LLM on regenerate
}
export interface ValidationSuccess {
  ok: true;
}
export type ValidationResult = ValidationFailure | ValidationSuccess;

export function validateWordCount(body: string): ValidationResult {
  const wc = wordCount(body);
  if (wc > 120) {
    return {
      ok: false,
      reason: `body too long (${wc} words)`,
      feedback: `Your previous body was ${wc} words. The hard maximum is 120 words. Tighten ruthlessly to between 60 and 90 words.`,
    };
  }
  if (wc < 30) {
    return {
      ok: false,
      reason: `body too short (${wc} words)`,
      feedback: `Your previous body was only ${wc} words — too thin. Target 60-90 words with a real specific hook and a clear ask.`,
    };
  }
  return { ok: true };
}

export function validateForbiddenPhrases(
  subjectAndBody: string,
  cfg: ForbiddenConfig,
): ValidationResult {
  const haystack = subjectAndBody.toLowerCase();
  const hits: string[] = [];
  for (const phrase of cfg.phrases) {
    if (!phrase) continue;
    if (haystack.includes(phrase.toLowerCase())) hits.push(phrase);
  }
  for (const word of cfg.phrases_word_boundary) {
    if (!word) continue;
    const re = new RegExp(`\\b${escapeRegex(word.toLowerCase())}\\b`, "i");
    if (re.test(haystack)) hits.push(word);
  }
  if (hits.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `forbidden phrase(s): ${hits.join(", ")}`,
    feedback: `You used forbidden phrasing: ${hits.join(", ")}. Rewrite without any of these.`,
  };
}

export function validateSignOff(body: string): ValidationResult {
  // Must end with "Jamal" then "Pulse" on their own lines, no EY anywhere.
  if (/\bEY\b/.test(body)) {
    return { ok: false, reason: "EY mention", feedback: "Remove any reference to EY. You are Jamal at Pulse only." };
  }
  const tail = body.split(/\n+/).slice(-3).join("\n");
  if (!/Jamal\s*\n\s*Pulse\s*$/i.test(tail.trim())) {
    return {
      ok: false,
      reason: "sign-off missing or wrong",
      feedback: "End with exactly two lines on their own: 'Jamal' then 'Pulse'. No extra title, no company tagline.",
    };
  }
  return { ok: true };
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "at",
  "by", "with", "as", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "your", "you", "i", "we",
  "my", "our", "if", "so", "not", "no", "do", "does", "did", "have", "has",
  "had", "can", "will", "would", "should", "could", "there", "hi", "hey",
  "jamal", "pulse",
]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function trigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) out.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  return out;
}

export interface PriorDraft {
  subject: string;
  body: string;
  /** Tokens to exclude from n-gram comparison (owner name, practice name, etc.). */
  protectedTokens?: string[];
}

/**
 * Check whether the new draft repeats subject structure, opening sentence
 * pattern, CTA, or any 3-word phrase from any prior draft (excluding
 * owner/practice/Pulse and common short connectors).
 */
export function validateNoDuplicatePattern(
  next: { subject: string; body: string; protectedTokens?: string[] },
  priors: PriorDraft[],
): ValidationResult {
  if (priors.length === 0) return { ok: true };

  // 1. Subject identical structure (first 5 tokens overlap)
  const nextSubjectTokens = tokenize(next.subject).slice(0, 5);
  for (const p of priors) {
    const ps = tokenize(p.subject).slice(0, 5);
    if (ps.length >= 3 && nextSubjectTokens.length >= 3) {
      const overlap = nextSubjectTokens.filter((t) => ps.includes(t)).length;
      if (overlap / Math.max(nextSubjectTokens.length, ps.length) >= 0.7) {
        return {
          ok: false,
          reason: `subject too similar to a prior draft (\"${p.subject}\")`,
          feedback: `Your subject is too similar to a prior draft in this batch (\"${p.subject}\"). Use a different structure.`,
        };
      }
    }
  }

  // 2. Opening sentence pattern (first 6 tokens of first body line that isn't the greeting)
  const nextOpener = openerTokens(next.body);
  for (const p of priors) {
    const op = openerTokens(p.body);
    if (op.length >= 4 && nextOpener.length >= 4) {
      const overlap = nextOpener.slice(0, 6).filter((t) => op.slice(0, 6).includes(t)).length;
      if (overlap >= 4) {
        return {
          ok: false,
          reason: `opener too similar to a prior draft`,
          feedback: `Your opening sentence reuses the same structure as a prior draft. Open with a different rhythm — e.g. question-first if you went problem-first, or a single specific noun phrase.`,
        };
      }
    }
  }

  // 3. Trigram overlap (excluding stopwords + protected tokens)
  const protectedSet = new Set((next.protectedTokens ?? []).map((t) => t.toLowerCase()));
  const nextTokens = tokenize(next.body).filter((t) => !protectedSet.has(t));
  const nextGrams = new Set(trigrams(nextTokens));
  for (const p of priors) {
    const priorProtected = new Set((p.protectedTokens ?? []).map((t) => t.toLowerCase()));
    const priorTokens = tokenize(p.body).filter((t) => !priorProtected.has(t) && !protectedSet.has(t));
    const priorGrams = trigrams(priorTokens);
    let hits = 0;
    const collisions: string[] = [];
    for (const g of priorGrams) {
      if (nextGrams.has(g)) {
        hits++;
        if (collisions.length < 3) collisions.push(g);
      }
    }
    if (hits >= 2) {
      return {
        ok: false,
        reason: `${hits} repeated 3-word phrases vs prior draft`,
        feedback: `You reused these 3-word phrases from a prior draft: ${collisions.map((c) => `\"${c}\"`).join(", ")}. Reword.`,
      };
    }
  }

  return { ok: true };
}

function openerTokens(body: string): string[] {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // Skip the greeting (usually "Hi {name},")
  const opener = lines.find((l) => !/^(hi|hey|hello|dear)\b/i.test(l)) ?? lines[0] ?? "";
  return tokenize(opener);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
