import { describe, expect, test } from "vitest";
import { dedupe, isSeen, loadSeenCache, normaliseUrl, pruneSeenCache, titleKey, titleSimilarity } from "../src/dedupe.js";
import type { RawItem, SeenCache } from "../src/types.js";

function item(overrides: Partial<RawItem>): RawItem {
  return {
    id: "abc123",
    lane: "audit_ai",
    sourceId: "test",
    sourceName: "Test",
    title: "FRC publishes new guidance on AI in audit",
    url: "https://example.com/frc-ai-guidance",
    publishedAt: "2026-07-14T05:00:00.000Z",
    summary: "",
    ...overrides,
  };
}

describe("normaliseUrl", () => {
  test("strips tracking params, hash, www and trailing slash", () => {
    // Arrange
    const url = "https://www.Example.com/story/?utm_source=x&utm_medium=rss&id=7#top";

    // Act
    const normalised = normaliseUrl(url);

    // Assert
    expect(normalised).toBe("example.com/story?id=7");
  });

  test("treats http and https duplicates as the same page", () => {
    expect(normaliseUrl("http://example.com/a")).toBe(normaliseUrl("https://example.com/a/"));
  });

  test("falls back to trimmed lowercase for malformed URLs", () => {
    expect(normaliseUrl("  Not A Url ")).toBe("not a url");
  });
});

describe("titleSimilarity", () => {
  test("scores near-identical headlines above the fuzzy threshold", () => {
    const a = "FRC publishes new guidance on AI in audit";
    const b = "FRC publishes guidance on AI in audit";
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.8);
  });

  test("scores unrelated headlines low", () => {
    const a = "FRC publishes new guidance on AI in audit";
    const b = "Coffee chain opens three new regional outlets";
    expect(titleSimilarity(a, b)).toBeLessThan(0.2);
  });
});

describe("dedupe", () => {
  test("removes exact URL duplicates already in the seen cache", () => {
    // Arrange
    const cache: SeenCache = {
      entries: [{ url: "example.com/frc-ai-guidance", titleKey: "anything", firstSeen: "2026-07-13T05:00:00.000Z" }],
    };

    // Act
    const { fresh } = dedupe([item({})], cache, new Date("2026-07-14T05:00:00Z"));

    // Assert
    expect(fresh).toHaveLength(0);
  });

  test("removes fuzzy title duplicates across different URLs", () => {
    const cache: SeenCache = {
      entries: [
        {
          url: "other-outlet.com/story",
          titleKey: titleKey("FRC publishes new guidance on AI in audit"),
          firstSeen: "2026-07-13T05:00:00.000Z",
        },
      ],
    };
    const near = item({ title: "FRC publishes guidance on AI in audit", url: "https://example.com/different" });
    expect(dedupe([near], cache, new Date()).fresh).toHaveLength(0);
  });

  test("removes in-batch duplicates and keeps the first occurrence", () => {
    const a = item({ url: "https://example.com/a" });
    const b = item({ url: "https://example.com/a?utm_source=rss" });
    const { fresh, additions } = dedupe([a, b], { entries: [] }, new Date());
    expect(fresh).toHaveLength(1);
    expect(additions).toHaveLength(1);
  });

  test("keeps genuinely new items and records cache additions", () => {
    const { fresh, additions } = dedupe([item({})], { entries: [] }, new Date("2026-07-14T05:00:00Z"));
    expect(fresh).toHaveLength(1);
    expect(additions[0]?.url).toBe("example.com/frc-ai-guidance");
    expect(additions[0]?.firstSeen).toBe("2026-07-14T05:00:00.000Z");
  });
});

describe("pruneSeenCache", () => {
  test("drops entries older than the max age and keeps newer ones", () => {
    // Arrange
    const cache: SeenCache = {
      entries: [
        { url: "old.com/a", titleKey: "old", firstSeen: "2026-06-01T00:00:00.000Z" },
        { url: "new.com/b", titleKey: "new", firstSeen: "2026-07-10T00:00:00.000Z" },
      ],
    };

    // Act
    const pruned = pruneSeenCache(cache, 14, new Date("2026-07-14T00:00:00Z"));

    // Assert
    expect(pruned.entries.map((e) => e.url)).toEqual(["new.com/b"]);
  });
});

describe("loadSeenCache", () => {
  test("returns an empty cache when the file does not exist", () => {
    expect(loadSeenCache("/nonexistent/path/cache.json")).toEqual({ entries: [] });
  });
});

describe("isSeen", () => {
  test("returns false against an empty cache", () => {
    expect(isSeen(item({}), { entries: [] })).toBe(false);
  });
});
