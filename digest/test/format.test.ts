import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DIGEST_ROOT, parseConfig, parseSources } from "../src/config.js";
import { renderDigest } from "../src/format.js";
import { applyLaneCaps } from "../src/run.js";
import { validateDigest } from "../src/synthesise.js";
import type { ScoredItem, Sources, SynthesisedDigest } from "../src/types.js";

const config = parseConfig(readFileSync(join(DIGEST_ROOT, "config.yaml"), "utf8"));
const sources = parseSources(readFileSync(join(DIGEST_ROOT, "sources.yaml"), "utf8"));

// A sources fixture with a capped lane, mirroring a private low-volume lane.
const cappedSources: Sources = {
  lanes: [
    { id: "audit_ai", title: "AUDIT + AI", weight: 5, feeds: [], search_topics: [] },
    { id: "world", title: "WORLD", weight: 1, max_items: 1, feeds: [], search_topics: [] },
  ],
};

function scored(id: string, lane: string, url: string): ScoredItem {
  return {
    id,
    lane,
    sourceId: "test",
    sourceName: "Test source",
    title: `Story ${id}`,
    url,
    publishedAt: "2026-07-14T04:00:00.000Z",
    summary: "A test summary.",
    score: 4,
    reason: "report: test",
  };
}

const items: ScoredItem[] = [
  scored("aaa", "audit_ai", "https://example.com/regulator"),
  scored("bbb", "enterprise_ai", "https://example.com/platform"),
  scored("ccc", "pulse", "https://example.com/market"),
];

const digest: SynthesisedDigest = {
  oneThing: {
    itemId: "aaa",
    whatHappened: "The regulator set out expectations for AI use in audit evidence. Firms get a twelve month lead-in.",
    whyItMatters: "It gives the written report a current regulatory anchor.",
  },
  sections: [
    {
      lane: "audit_ai",
      items: [
        {
          itemId: "aaa",
          headline: "Regulator sets expectations for AI in audit evidence",
          what: "The regulator published guidance covering AI-generated audit evidence. A lead-in period applies.",
          soWhat: "Cite in section 3 of the report.",
        },
      ],
    },
    {
      lane: "enterprise_ai",
      items: [
        {
          itemId: "bbb",
          headline: "Protocol adds registry for enterprise tool discovery",
          what: "The protocol gained a registry feature. Enterprises can now discover tools centrally.",
          soWhat: "Talking point for the next platform conversation.",
        },
      ],
    },
    {
      lane: "pulse",
      items: [
        {
          itemId: "ccc",
          headline: "Service group consolidates regional practices",
          what: "A group acquired three practices in one region. Consolidation continues in the sector.",
          soWhat: "Outreach hook for the regional prospect list.",
        },
      ],
    },
  ],
  twoMoves: ["Use the regulator item as the opener for the drafted message."],
  radar: ["A vendor released a minor update.", "A consultancy published a survey.", "A journal published a comment piece."],
};

describe("renderDigest", () => {
  const text = renderDigest(digest, items, sources, config, {
    date: new Date("2026-07-14T05:00:00Z"),
    timezone: "Europe/London",
    scanned: 84,
    recipient: "reader@example.com",
    masthead: "DAILY DIGEST",
  });

  test("starts with the masthead and counts line", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("DAILY DIGEST — Tuesday 14 July 2026");
    expect(lines[1]).toMatch(/^Read time: ~\d+ min \| 3 items from 84 scanned$/);
  });

  test("renders every populated section in sources.yaml lane order with the exact rule style", () => {
    expect(text).toContain("━━━ TODAY'S ONE THING ━━━");
    expect(text).toContain("━━━ AUDIT + AI ━━━");
    expect(text).toContain("━━━ ENTERPRISE AI ━━━");
    expect(text).toContain("━━━ PULSE ━━━");
    expect(text).toContain("━━━ TWO MOVES ━━━");
    expect(text).toContain("━━━ ON THE RADAR ━━━");
    expect(text.indexOf("━━━ AUDIT + AI ━━━")).toBeLessThan(text.indexOf("━━━ ENTERPRISE AI ━━━"));
    expect(text.indexOf("━━━ ENTERPRISE AI ━━━")).toBeLessThan(text.indexOf("━━━ PULSE ━━━"));
  });

  test("renders item structure with What, So what and link arrow", () => {
    expect(text).toContain("▸ Regulator sets expectations for AI in audit evidence");
    expect(text).toContain("  What: The regulator published guidance");
    expect(text).toContain("  So what: Cite in section 3 of the report.");
    expect(text).toContain("→ https://example.com/regulator");
  });

  test("every http link in the output comes from the item set", () => {
    const urls = [...text.matchAll(/https?:\/\/[^\s\])]+/g)].map((m) => m[0]);
    const allowed = new Set(items.map((i) => i.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(allowed.has(url), `unexpected link ${url}`).toBe(true);
    }
  });

  test("omits sections whose item list is empty", () => {
    const withEmpty: SynthesisedDigest = {
      ...digest,
      sections: [...digest.sections, { lane: "regulation", items: [] }],
    };
    const rendered = renderDigest(withEmpty, items, sources, config, {
      date: new Date("2026-07-14T05:00:00Z"),
      timezone: "Europe/London",
      scanned: 84,
      recipient: "reader@example.com",
      masthead: "DAILY DIGEST",
    });
    expect(rendered).not.toContain("━━━ REGULATION ━━━");
  });

  test("ends with the three-way rating mailto footer", () => {
    expect(text).toContain("Rate today: [useful] mailto:reader@example.com?subject=Digest%20rating%202026-07-14%3A%20useful");
    expect(text).toContain("[thin] mailto:");
    expect(text).toContain("[off-target] mailto:");
  });

  test("contains no exclamation marks", () => {
    const body = text.split("\n").slice(1).join("\n");
    expect(body).not.toContain("!");
  });
});

describe("validateDigest", () => {
  test("accepts a well-formed digest", () => {
    expect(validateDigest(digest, items, config, sources)).toEqual([]);
  });

  test("rejects unknown item ids", () => {
    const bad = { ...digest, oneThing: { ...digest.oneThing, itemId: "zzz" } };
    expect(validateDigest(bad, items, config, sources).join(" ")).toContain("zzz");
  });

  test("rejects items placed in the wrong lane", () => {
    const bad: SynthesisedDigest = {
      ...digest,
      sections: [{ lane: "pulse", items: digest.sections[0]!.items }],
    };
    expect(validateDigest(bad, items, config, sources).join(" ")).toContain("wrong lane");
  });

  test("rejects duplicate sections for the same lane", () => {
    const bad: SynthesisedDigest = {
      ...digest,
      sections: [
        { lane: "audit_ai", items: digest.sections[0]!.items },
        { lane: "audit_ai", items: [] },
      ],
    };
    expect(validateDigest(bad, items, config, sources).join(" ")).toContain("two sections");
  });

  test("rejects more than max_items", () => {
    const many = Array.from({ length: 9 }, (_, i) => scored(`id${i}`, "audit_ai", `https://example.com/${i}`));
    const bad: SynthesisedDigest = {
      ...digest,
      oneThing: { ...digest.oneThing, itemId: "id0" },
      sections: [
        {
          lane: "audit_ai",
          items: many.map((m) => ({ itemId: m.id, headline: "h", what: "w", soWhat: "s" })),
        },
      ],
    };
    expect(validateDigest(bad, many, config, sources).join(" ")).toContain("maximum is 8");
  });

  test("rejects raw URLs inside model-written text", () => {
    const bad: SynthesisedDigest = {
      ...digest,
      sections: [
        {
          lane: "audit_ai",
          items: [{ itemId: "aaa", headline: "h", what: "see https://sneaky.com", soWhat: "s" }],
        },
      ],
    };
    expect(validateDigest(bad, items, config, sources).join(" ")).toContain("raw URL");
  });

  test("rejects a second item in a lane capped at one", () => {
    const worldItems = [
      scored("w1", "world", "https://example.com/w1"),
      scored("w2", "world", "https://example.com/w2"),
    ];
    const bad: SynthesisedDigest = {
      ...digest,
      oneThing: { ...digest.oneThing, itemId: "w1" },
      sections: [
        {
          lane: "world",
          items: worldItems.map((m) => ({ itemId: m.id, headline: "h", what: "w", soWhat: "s" })),
        },
      ],
    };
    expect(validateDigest(bad, worldItems, config, cappedSources).join(" ")).toContain("capped at 1 item");
  });
});

describe("applyLaneCaps", () => {
  test("caps a max_items lane before synthesis", () => {
    const mixed = [
      scored("w1", "world", "https://example.com/w1"),
      scored("w2", "world", "https://example.com/w2"),
      scored("a1", "audit_ai", "https://example.com/a1"),
    ];
    const capped = applyLaneCaps(mixed, cappedSources);
    expect(capped.filter((i) => i.lane === "world")).toHaveLength(1);
    expect(capped.filter((i) => i.lane === "audit_ai")).toHaveLength(1);
  });
});
