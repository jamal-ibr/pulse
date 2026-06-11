import { describe, test, expect } from "vitest";
import { redact, containsSensitive, redactEmailBody } from "../src/lib/redact";

describe("redact", () => {
  test("masks card numbers", () => {
    const result = redact("Paid with 4242 4242 4242 4242 yesterday");
    expect(result).not.toContain("4242 4242 4242 4242");
    expect(result).toContain("[REDACTED_CARD]");
  });

  test("masks NI numbers", () => {
    const result = redact("My NI is QQ 12 34 56 C");
    expect(result).toContain("[REDACTED_NI]");
  });

  test("masks Anthropic API keys", () => {
    const result = redact("key is sk-ant-abc123def456ghi789");
    expect(result).not.toContain("sk-ant-abc123def456ghi789");
    expect(result).toContain("[REDACTED_API_KEY]");
  });

  test("masks bearer tokens", () => {
    const result = redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(result).toContain("Bearer [REDACTED_TOKEN]");
  });

  test("masks OAuth tokens", () => {
    const result = redact("token ya29.a0AfH6SMBx7-longgoogletokenvalue123");
    expect(result).toContain("[REDACTED_OAUTH_TOKEN]");
  });

  test("masks password assignments", () => {
    const result = redact("password: hunter2secret");
    expect(result).not.toContain("hunter2secret");
    expect(result).toContain("[REDACTED]");
  });

  test("masks private key blocks", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----";
    expect(redact(input)).toBe("[REDACTED_PRIVATE_KEY]");
  });

  test("leaves normal text untouched", () => {
    const input = "Send outreach to 5 dental practices before 10:00.";
    expect(redact(input)).toBe(input);
  });

  test("containsSensitive detects secrets", () => {
    expect(containsSensitive("api_key=abc123secret")).toBe(true);
    expect(containsSensitive("Protein was 172g today")).toBe(false);
  });

  test("sensitive email bodies are withheld entirely", () => {
    expect(redactEmailBody("salary details inside", true)).toBe(
      "[SENSITIVE EMAIL BODY WITHHELD]",
    );
  });
});
