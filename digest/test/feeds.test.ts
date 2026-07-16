import { describe, expect, test } from "vitest";
import { itemId, parseFeed } from "../src/feeds.js";

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test feed</title>
    <item>
      <title><![CDATA[FRC publishes new guidance on AI &amp; audit]]></title>
      <link>https://example.com/frc-guidance</link>
      <pubDate>Mon, 13 Jul 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[<p>The FRC has published <b>new guidance</b> today.</p>]]></description>
    </item>
    <item>
      <title>Undated item</title>
      <link>https://example.com/undated</link>
      <description>No date on this one.</description>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <title>DSIT announces AI assurance platform</title>
    <link rel="alternate" href="https://www.gov.uk/dsit-ai-assurance"/>
    <published>2026-07-13T08:00:00Z</published>
    <summary>Government announcement.</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  test("parses RSS 2.0 items with CDATA titles and HTML descriptions", () => {
    // Act
    const entries = parseFeed(RSS_FIXTURE);

    // Assert
    expect(entries).toHaveLength(2);
    expect(entries[0]?.title).toBe("FRC publishes new guidance on AI & audit");
    expect(entries[0]?.url).toBe("https://example.com/frc-guidance");
    expect(entries[0]?.publishedAt).toBe("2026-07-13T09:00:00.000Z");
    expect(entries[0]?.summary).toBe("The FRC has published new guidance today.");
  });

  test("keeps items with no parseable date as null-dated", () => {
    const entries = parseFeed(RSS_FIXTURE);
    expect(entries[1]?.publishedAt).toBeNull();
  });

  test("parses Atom entries using the alternate link href", () => {
    const entries = parseFeed(ATOM_FIXTURE);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe("https://www.gov.uk/dsit-ai-assurance");
    expect(entries[0]?.publishedAt).toBe("2026-07-13T08:00:00.000Z");
  });

  test("returns empty array for non-feed XML", () => {
    expect(parseFeed("<html><body>Not a feed</body></html>")).toEqual([]);
  });
});

describe("itemId", () => {
  test("is stable for the same url and title", () => {
    expect(itemId("https://a.com/x", "Title")).toBe(itemId("https://a.com/x", "Title"));
  });

  test("differs when the title differs", () => {
    expect(itemId("https://a.com/x", "Title A")).not.toBe(itemId("https://a.com/x", "Title B"));
  });
});
