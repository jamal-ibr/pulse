import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DIGEST_ROOT, parseConfig, parseProfile, parseSources } from "../src/config.js";

describe("shipped configuration", () => {
  test("config.yaml is valid and carries nothing personal", () => {
    const raw = readFileSync(join(DIGEST_ROOT, "config.yaml"), "utf8");
    const cfg = parseConfig(raw);
    expect(cfg.models.triage).toBe("claude-haiku-4-5-20251001");
    expect(cfg.models.synthesis).toBe("claude-sonnet-5");
    expect(cfg.digest.max_items).toBe(8);
    // No personal values: the only permitted email-like string is the Resend
    // onboarding sender.
    expect(raw.replace("onboarding@resend.dev", "")).not.toMatch(/\S+@\S+/);
  });

  test("profile.example.yaml parses as a valid profile", () => {
    const profile = parseProfile(readFileSync(join(DIGEST_ROOT, "profile.example.yaml"), "utf8"));
    expect(profile.recipient).toBe("you@example.com");
    expect(profile.plate.length).toBeGreaterThan(0);
    expect(profile.masthead).toBe("DAILY DIGEST");
  });

  test("sources.yaml is valid and has five default lanes", () => {
    const sources = parseSources(readFileSync(join(DIGEST_ROOT, "sources.yaml"), "utf8"));
    expect(sources.lanes.map((l) => l.id)).toEqual(["audit_ai", "enterprise_ai", "consulting", "pulse", "regulation"]);
  });

  test("every configured feed URL is https", () => {
    const sources = parseSources(readFileSync(join(DIGEST_ROOT, "sources.yaml"), "utf8"));
    for (const lane of sources.lanes) {
      for (const feed of lane.feeds) expect(feed.url).toMatch(/^https:\/\//);
    }
  });
});

describe("validation failures", () => {
  test("rejects a profile without a recipient email", () => {
    expect(() => parseProfile("recipient: nope\ncontext: long enough context about the reader and their uses\nplate: [a]")).toThrow(
      /recipient/,
    );
  });

  test("rejects a profile with a trivial context block", () => {
    expect(() => parseProfile("recipient: a@b.com\ncontext: too short\nplate: [a]")).toThrow(/context/);
  });

  test("rejects sources with duplicate lane ids", () => {
    const yaml = `lanes:
  - { id: a, title: A, weight: 1, feeds: [], search_topics: [] }
  - { id: a, title: B, weight: 1, feeds: [], search_topics: [] }`;
    expect(() => parseSources(yaml)).toThrow(/duplicate lane id/);
  });

  test("rejects a feed with an http url", () => {
    const yaml = `lanes:
  - id: a
    title: A
    weight: 1
    search_topics: []
    feeds:
      - { id: f, name: F, url: "http://insecure.example.com/feed" }`;
    expect(() => parseSources(yaml)).toThrow(/https url/);
  });
});
