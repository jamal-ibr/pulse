// Redaction layer. Strips or masks sensitive material before any text
// leaves the machine for an AI provider. Unit-tested.

const PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  {
    name: "private_key_block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    name: "card_number",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[REDACTED_CARD]",
  },
  {
    name: "ni_number",
    // Deliberately broader than strict NI prefix rules: for outbound
    // redaction, over-matching is safer than under-matching.
    regex: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
    replacement: "[REDACTED_NI]",
  },
  {
    name: "anthropic_key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    name: "generic_sk_key",
    regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    name: "bearer_token",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  {
    name: "oauth_token",
    regex: /\bya29\.[A-Za-z0-9._-]{20,}\b/g,
    replacement: "[REDACTED_OAUTH_TOKEN]",
  },
  {
    name: "aws_key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY]",
  },
  {
    name: "password_assignment",
    regex: /\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi,
    replacement: "$1=[REDACTED]",
  },
];

export function redact(input: string): string {
  let output = input;
  for (const pattern of PATTERNS) {
    output = output.replace(pattern.regex, pattern.replacement);
  }
  return output;
}

export function containsSensitive(input: string): boolean {
  return PATTERNS.some((p) => {
    p.regex.lastIndex = 0;
    return p.regex.test(input);
  });
}

// Email bodies marked sensitive are removed entirely, not just masked.
export function redactEmailBody(body: string, isSensitive: boolean): string {
  if (isSensitive) return "[SENSITIVE EMAIL BODY WITHHELD]";
  return redact(body);
}
