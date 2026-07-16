// Stage 1 verification: fetch every candidate feed URL and report which return
// valid RSS/Atom with recent items. Runs in GitHub Actions where egress is open.
// Output: human report to stdout, machine report to digest/data/feed-verification.json.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "feed-verification.json");

// Multiple guesses per source, tried in order. First PASS wins.
const CANDIDATES = {
  // ── Lane A: AI in audit, assurance, professional services ──
  "frc": ["https://www.frc.org.uk/rss.xml", "https://www.frc.org.uk/news/rss", "https://www.frc.org.uk/news-and-events/news/rss/", "https://media.frc.org.uk/rss/news.xml", "https://www.frc.org.uk/rss/news.rss", "https://www.frc.org.uk/frc-rss-feeds/"],
  "iaasb": ["https://www.iaasb.org/rss.xml", "https://www.iaasb.org/news/rss", "https://www.iaasb.org/feed", "https://www.ifac.org/rss.xml"],
  "icaew": ["https://www.icaew.com/rss", "https://www.icaew.com/insights/rss", "https://www.icaew.com/rss/insights"],
  "accountingweb_uk": ["https://www.accountingweb.co.uk/rss.xml", "https://www.accountingweb.co.uk/feed", "https://www.accountingweb.co.uk/rss/all", "https://www.accountingweb.co.uk/taxonomy/term/all/feed"],
  "accountancy_age": ["https://www.accountancyage.com/feed/", "https://www.accountancyage.com/rss"],
  "ey_newsroom": ["https://www.ey.com/en_gl/newsroom/rss", "https://www.ey.com/rss/news", "https://www.ey.com/en_gl.rss"],
  "deloitte_press": ["https://www.deloitte.com/global/en/about/press-room.rss", "https://www2.deloitte.com/global/en/pages/about-deloitte/rss/press-releases.rss"],
  "pwc_press": ["https://www.pwc.com/gx/en/news-room/rss.xml", "https://press.pwc.com/rss"],
  "kpmg_press": ["https://kpmg.com/xx/en/home/media/press-releases/rss.xml", "https://kpmg.com/xx/en/media/press-releases/rss.xml"],
  // ── Lane B: enterprise AI platforms and agentic AI ──
  "anthropic_news": ["https://www.anthropic.com/rss.xml", "https://www.anthropic.com/news/rss.xml", "https://www.anthropic.com/feed.xml", "https://rsshub.app/anthropic/news"],
  "openai_news": ["https://openai.com/news/rss.xml", "https://openai.com/blog/rss.xml"],
  "databricks_blog": ["https://www.databricks.com/feed", "https://www.databricks.com/blog/feed", "https://www.databricks.com/blog/feed.xml", "https://www.databricks.com/blog/rss.xml"],
  "azure_ai_blog": ["https://azure.microsoft.com/en-us/blog/category/ai-machine-learning/feed/", "https://azure.microsoft.com/en-us/blog/feed/"],
  "google_cloud_ai": ["https://cloudblog.withgoogle.com/products/ai-machine-learning/rss/", "https://cloudblog.withgoogle.com/rss/"],
  "huggingface_blog": ["https://huggingface.co/blog/feed.xml"],
  // ── Lane C: AI strategy consulting market ──
  "mckinsey_insights": ["https://www.mckinsey.com/insights/rss", "https://www.mckinsey.com/featured-insights/rss"],
  "mckinsey_quantumblack": ["https://www.mckinsey.com/capabilities/quantumblack/our-insights/rss"],
  "bcg_insights": ["https://www.bcg.com/featured-insights/rss", "https://www.bcg.com/rss.xml", "https://feeds.bcg.com/bcg/featured-insights"],
  "bain_insights": ["https://www.bain.com/insights/feed/", "https://www.bain.com/rss/insights.xml", "https://www.bain.com/rss/"],
  "accenture_newsroom": ["https://newsroom.accenture.com/rss/news-releases.xml", "https://newsroom.accenture.com/feeds/news-releases.rss"],
  // ── Lane D: Pulse market (voice AI + UK service practices) ──
  "vapi_changelog": ["https://docs.vapi.ai/changelog/rss.xml", "https://docs.vapi.ai/changelog.rss"],
  "elevenlabs_blog": ["https://elevenlabs.io/blog/rss.xml", "https://elevenlabs.io/blog/feed.xml", "https://elevenlabs.io/rss.xml"],
  "retell_blog": ["https://www.retellai.com/blog/rss.xml", "https://www.retellai.com/feed"],
  "twilio_blog": ["https://www.twilio.com/en-us/blog/rss", "https://www.twilio.com/blog/feed", "https://www.twilio.com/en-us/blog/feed"],
  "dentistry_co_uk": ["https://dentistry.co.uk/feed/"],
  "bdj_news": ["https://www.nature.com/bdj.rss"],
  "vet_times": ["https://www.vettimes.co.uk/feed/", "https://www.vettimes.com/feed", "https://www.vettimes.co.uk/rss"],
  "vetsurgeon": ["https://www.vetsurgeon.org/news/rss", "https://www.vetsurgeon.org/b/news/rss.aspx"],
  "sifted": ["https://sifted.eu/feed"],
  // ── Lane E: UK/EU regulation and data protection ──
  "ico_news": ["https://ico.org.uk/rss/news", "https://ico.org.uk/about-the-ico/news-and-events/rss/", "https://ico.org.uk/rss/news.xml"],
  "eu_digital_strategy": ["https://digital-strategy.ec.europa.eu/en/rss.xml", "https://digital-strategy.ec.europa.eu/en/news/rss.xml"],
  "eu_ai_act_tracker": ["https://artificialintelligenceact.eu/feed/"],
  "ofcom": ["https://www.ofcom.org.uk/rss", "https://www.ofcom.org.uk/feed", "https://www.ofcom.org.uk/feeds/rss/news"],
  "fca_news": ["https://www.fca.org.uk/news/rss.xml", "https://www.fca.org.uk/rss/news"],
  "gov_uk_dsit": ["https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom"],
};

// Round 2: for sources whose direct guesses failed, fetch an HTML page and
// autodiscover feed URLs from <link rel="alternate"> and anchor hrefs.
const DISCOVER_PAGES = {
  "frc": ["https://www.frc.org.uk/news-and-events/news/", "https://www.frc.org.uk/"],
  "iaasb": ["https://www.iaasb.org/news-events"],
  "icaew": ["https://www.icaew.com/insights"],
  "ey_newsroom": ["https://www.ey.com/en_gl/newsroom"],
  "deloitte_press": ["https://www.deloitte.com/global/en/about/press-room.html"],
  "pwc_press": ["https://www.pwc.com/gx/en/site-information/rss-feeds.html"],
  "kpmg_press": ["https://kpmg.com/xx/en/media/press-releases.html"],
  "anthropic_news": ["https://www.anthropic.com/news"],
  "bcg_insights": ["https://www.bcg.com/publications"],
  "bain_insights": ["https://www.bain.com/insights/"],
  "accenture_newsroom": ["https://newsroom.accenture.com/"],
  "vapi_changelog": ["https://docs.vapi.ai/changelog"],
  "elevenlabs_blog": ["https://elevenlabs.io/blog"],
  "retell_blog": ["https://www.retellai.com/blog"],
  "bdj_news": ["https://www.nature.com/bdj/"],
  "vet_times": ["https://www.vettimes.com/", "https://www.vettimes.co.uk/"],
  "vetsurgeon": ["https://www.vetsurgeon.org/"],
  "ico_news": ["https://ico.org.uk/about-the-ico/media-centre/"],
  "ofcom": ["https://www.ofcom.org.uk/media-centre/"],
  "mckinsey_quantumblack": ["https://www.mckinsey.com/capabilities/quantumblack/our-insights"],
};

// Extra direct candidates surfaced by research, tried before autodiscovery.
CANDIDATES["bdj_news"].push("https://www.nature.com/bdj/rss.rdf", "https://www.nature.com/bdj.rss?format=xml");
CANDIDATES["vet_times"].push("https://www.vettimes.com/feed", "https://www.vettimes.com/rss", "https://www.vettimes.com/news/rss");
CANDIDATES["pwc_press"].push("https://www.pwc.com/gx/en/news-room/rss-feed.rss.gx.en.xml");

const UA = "PulseDigestBot/0.1 (+https://github.com/jamal-ibr/pulsewebsite; feed verification)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function extractDates(xml) {
  return [...xml.matchAll(/<(?:pubDate|dc:date|updated|published)[^>]*>([^<]+)</g)]
    .map((m) => new Date(m[1].trim()))
    .filter((d) => !Number.isNaN(+d));
}

function firstTitle(xml) {
  const item = xml.match(/<(?:item|entry)[\s>][\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
  return item ? item[1].trim().slice(0, 90) : null;
}

async function fetchOnce(url, ua) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": ua, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const body = await res.text();
    return { status: res.status, body, contentType: res.headers.get("content-type") || "" };
  } finally {
    clearTimeout(t);
  }
}

async function tryUrl(url) {
  for (const ua of [UA, BROWSER_UA]) {
    let r;
    try {
      r = await fetchOnce(url, ua);
    } catch (e) {
      return { url, ok: false, why: e.name === "AbortError" ? "timeout" : String(e.cause?.code || e.message).slice(0, 100) };
    }
    if (r.status === 403 || r.status === 429) continue; // retry with browser UA
    if (r.status >= 400) return { url, ok: false, why: `HTTP ${r.status}` };
    const head = r.body.slice(0, 3000);
    if (!/<(rss|feed|rdf:RDF)[\s>]/.test(head)) return { url, ok: false, why: `not a feed (${r.contentType.split(";")[0]})` };
    const items = (r.body.match(/<(item|entry)[\s>]/g) || []).length;
    if (items === 0) return { url, ok: false, why: "feed has 0 items" };
    const dates = extractDates(r.body);
    const newest = dates.length ? new Date(Math.max(...dates.map(Number))) : null;
    return {
      url,
      ok: true,
      items,
      newestItemDate: newest ? newest.toISOString().slice(0, 10) : "no dates found",
      ageDays: newest ? Number(((Date.now() - +newest) / 86_400_000).toFixed(1)) : null,
      sampleTitle: firstTitle(r.body),
    };
  }
  return { url, ok: false, why: "HTTP 403 (both user agents)" };
}

function discoverFeedUrls(pageUrl, html) {
  const found = new Set();
  for (const m of html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)) {
    const tag = m[0];
    if (!/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) found.add(new URL(href, pageUrl).href);
  }
  for (const m of html.matchAll(/href=["']([^"']*(?:\.rss|\.atom|rss\.xml|atom\.xml|feed\.xml|\/feed\/?|\/rss\/?)(?:\?[^"']*)?)["']/gi)) {
    try {
      const u = new URL(m[1], pageUrl);
      if (u.origin === new URL(pageUrl).origin) found.add(u.href);
    } catch { /* ignore malformed hrefs */ }
  }
  return [...found].slice(0, 8);
}

const report = {};
await Promise.all(
  Object.entries(CANDIDATES).map(async ([name, urls]) => {
    const failures = [];
    for (const url of urls) {
      const r = await tryUrl(url);
      if (r.ok) {
        report[name] = { verdict: "PASS", ...r, failures };
        return;
      }
      failures.push({ url: r.url, why: r.why });
    }
    // Autodiscovery round: scrape configured HTML pages for feed links.
    for (const pageUrl of DISCOVER_PAGES[name] || []) {
      let page;
      try {
        page = await fetchOnce(pageUrl, BROWSER_UA);
      } catch {
        failures.push({ url: pageUrl, why: "page fetch failed" });
        continue;
      }
      if (page.status >= 400) {
        failures.push({ url: pageUrl, why: `page HTTP ${page.status}` });
        continue;
      }
      for (const feedUrl of discoverFeedUrls(pageUrl, page.body)) {
        const r = await tryUrl(feedUrl);
        if (r.ok) {
          report[name] = { verdict: "PASS", discoveredFrom: pageUrl, ...r, failures };
          return;
        }
        failures.push({ url: r.url, why: `(discovered) ${r.why}` });
      }
    }
    report[name] = { verdict: "FAIL", failures };
  }),
);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ verifiedAt: new Date().toISOString(), report }, null, 2));

let pass = 0;
for (const [name, r] of Object.entries(report).sort(([a], [b]) => a.localeCompare(b))) {
  if (r.verdict === "PASS") {
    pass += 1;
    console.log(`PASS  ${name}`);
    console.log(`      ${r.url}`);
    console.log(`      ${r.items} items | newest ${r.newestItemDate} (${r.ageDays}d) | "${r.sampleTitle}"`);
  } else {
    console.log(`FAIL  ${name}`);
    for (const f of r.failures) console.log(`      ${f.url} -> ${f.why}`);
  }
}
console.log(`\n${pass}/${Object.keys(report).length} sources verified`);
