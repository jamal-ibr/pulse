import { describe, expect, test } from "vitest";
import { encryptWithKey, decryptWithKey, isValidKeyHex } from "../src/lib/crypto";
import { buildGoogleAuthUrl, tokensFromResponse, GMAIL_READONLY_SCOPE } from "../src/lib/google-oauth";
import { mapGmailMessage } from "../src/lib/email/gmail-mapper";
import { parseHealthExport } from "../src/lib/health-ingest";

const KEY = "a".repeat(64);

describe("crypto", () => {
  test("round-trips a token payload", () => {
    const secret = JSON.stringify({ accessToken: "ya29.test", expiresAt: 123 });
    const encrypted = encryptWithKey(secret, KEY);
    expect(encrypted).not.toContain("ya29");
    expect(decryptWithKey(encrypted, KEY)).toBe(secret);
  });

  test("produces a different ciphertext each call", () => {
    expect(encryptWithKey("same", KEY)).not.toBe(encryptWithKey("same", KEY));
  });

  test("rejects decryption with the wrong key", () => {
    const encrypted = encryptWithKey("secret", KEY);
    expect(() => decryptWithKey(encrypted, "b".repeat(64))).toThrow();
  });

  test("rejects malformed keys", () => {
    expect(isValidKeyHex("short")).toBe(false);
    expect(isValidKeyHex("z".repeat(64))).toBe(false);
    expect(isValidKeyHex(KEY)).toBe(true);
    expect(() => encryptWithKey("x", "short")).toThrow(/64 hex/);
  });
});

describe("google oauth", () => {
  test("auth url requests only the read-only gmail scope", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "client-1",
        redirectUri: "http://localhost:3000/api/oauth/google/callback",
        scope: GMAIL_READONLY_SCOPE,
        state: "state-1",
      }),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("scope")).not.toContain("send");
    expect(url.searchParams.get("scope")).not.toContain("modify");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  test("keeps the previous refresh token when google omits it", () => {
    const tokens = tokensFromResponse(
      { access_token: "new-access", expires_in: 3600 },
      "old-refresh",
      1_000_000,
    );
    expect(tokens.refreshToken).toBe("old-refresh");
    expect(tokens.accessToken).toBe("new-access");
  });

  test("expires the access token a minute early", () => {
    const tokens = tokensFromResponse(
      { access_token: "a", expires_in: 3600 },
      null,
      0,
    );
    expect(tokens.expiresAt).toBe(3540 * 1000);
  });
});

describe("gmail mapper", () => {
  test("maps headers, snippet, and unread label", () => {
    const message = mapGmailMessage({
      id: "msg-1",
      snippet: "Following up on the demo &amp; pricing",
      internalDate: "1780000000000",
      labelIds: ["UNREAD", "INBOX"],
      payload: {
        headers: [
          { name: "From", value: "Dr Patel <reception@brightsmile.co.uk>" },
          { name: "Subject", value: "Re: Pulse AI demo" },
        ],
      },
    });
    expect(message.externalId).toBe("msg-1");
    expect(message.sender).toContain("brightsmile.co.uk");
    expect(message.subject).toBe("Re: Pulse AI demo");
    expect(message.snippet).toBe("Following up on the demo & pricing");
    expect(message.isRead).toBe(false);
    expect(message.receivedAt).toBe(new Date(1780000000000).toISOString());
  });

  test("falls back gracefully on missing fields", () => {
    const message = mapGmailMessage({ id: "msg-2", labelIds: [] });
    expect(message.sender).toBe("(unknown sender)");
    expect(message.subject).toBe("(no subject)");
    expect(message.isRead).toBe(true);
  });
});

describe("health ingest parsing", () => {
  const payload = {
    data: {
      metrics: [
        {
          name: "step_count",
          units: "count",
          data: [
            { date: "2026-06-11 09:00:00 +0100", qty: 4000 },
            { date: "2026-06-11 18:00:00 +0100", qty: 6500 },
          ],
        },
        {
          name: "heart_rate",
          units: "bpm",
          data: [
            { date: "2026-06-11 09:00:00 +0100", avg: 60 },
            { date: "2026-06-11 18:00:00 +0100", avg: 70 },
          ],
        },
        {
          name: "weight_body_mass",
          units: "lb",
          data: [{ date: "2026-06-11 07:30:00 +0100", qty: 198.0 }],
        },
        {
          name: "sleep_analysis",
          units: "hr",
          data: [{ date: "2026-06-11 08:00:00 +0100", asleep: 6.8 }],
        },
      ],
    },
  };

  test("sums countable metrics per day and averages rates", () => {
    const result = parseHealthExport(payload);
    const steps = result.metrics.find((m) => m.metric === "step_count");
    const heartRate = result.metrics.find((m) => m.metric === "heart_rate");
    expect(steps?.value).toBe(10500);
    expect(heartRate?.value).toBe(65);
  });

  test("converts weight from pounds to kilograms", () => {
    const result = parseHealthExport(payload);
    expect(result.weights).toEqual([{ date: "2026-06-11", weightKg: 89.81 }]);
  });

  test("maps sleep_analysis asleep hours to sleep logs", () => {
    const result = parseHealthExport(payload);
    expect(result.sleeps).toEqual([{ date: "2026-06-11", sleepHours: 6.8 }]);
  });

  test("returns empty result for unrecognisable payloads", () => {
    expect(parseHealthExport({ nonsense: true })).toEqual({
      metrics: [],
      weights: [],
      sleeps: [],
    });
    expect(parseHealthExport(null).metrics).toHaveLength(0);
  });

  test("ignores points with invalid dates or quantities", () => {
    const result = parseHealthExport({
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [
              { date: "yesterday", qty: 100 },
              { date: "2026-06-11 09:00:00 +0100", qty: "lots" },
            ],
          },
        ],
      },
    });
    expect(result.metrics).toHaveLength(0);
  });
});
