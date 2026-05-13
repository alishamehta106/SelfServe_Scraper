import * as cheerio from "cheerio";

import { extractFromAggregated, visibleTextFromHtml } from "@/lib/extractors/fromText";
import { probeImages } from "@/lib/extractors/imageProbe";
import type { HotelStructured, ScrapedPayload } from "@/lib/schema/hotel";
import { fetchRobotsRules, isUrlAllowedByRobots } from "@/lib/robots";

import { extractJsonLdHints } from "./jsonld";
import { closeRenderedBrowser, fetchRenderedHtml, newRenderContext } from "./rendered";
import { discoverSitemapUrls } from "./sitemap";

const MAX_PAGES = 90;
const MAX_DEPTH = 7;
const MAX_SITEMAP_SEED = 80;
const FETCH_TIMEOUT_MS = 12000;
const MAX_RENDERED_PAGES = 20;

const PRIORITY_KEYWORDS =
  /amenit|room|suite|accommodation|dining|restaurant|service|polic|contact|about|facilit|gallery|meet|event|spa|pool|stay|location|wedding|banquet|menu|eat|drink|faq|offer|experience/i;

const USER_AGENT = "HotelIngestMVP/0.1 (+research; contact: local)";

const COMMON_PAGE_PATHS = [
  "/rooms",
  "/suites",
  "/accommodations",
  "/amenities",
  "/dining",
  "/restaurants",
  "/restaurant",
  "/menu",
  "/services",
  "/policies",
  "/contact",
  "/location",
  "/gallery",
  "/meetings",
  "/events",
  "/spa",
  "/offers",
];

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function normalizeUrlKey(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    let p = u.pathname.replace(/\/+$/, "");
    if (!p) p = "/";
    u.pathname = p;
    return u.href;
  } catch {
    return href.split("#")[0];
  }
}

function scoreLink(href: string, anchor: string): number {
  let s = 0;
  const path = href.toLowerCase();
  const text = anchor.toLowerCase();
  if (PRIORITY_KEYWORDS.test(path)) s += 3;
  if (PRIORITY_KEYWORDS.test(text)) s += 2;
  if (/contact|location|about|dining|eat|menu|room|suite|amenit|polic/.test(path)) s += 1;
  return s;
}

function shouldSkipPath(href: string): boolean {
  return /\.(pdf|zip|xml|rss|jpg|jpeg|png|webp|gif|svg|css|js|ico)(\?|$)/i.test(href);
}

async function fetchHtml(url: string): Promise<{ html: string; title: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    return { html, title };
  } catch {
    return null;
  }
}

function shouldRenderPage(
  url: string,
  score: number,
  got: { html: string; title: string } | null,
): boolean {
  if (!got) return true;
  const text = visibleTextFromHtml(got.html);
  if (score >= 70) return true;
  if (score >= 40 && text.length < 2500) return true;
  if (collectLinks(got.html, url).length < 4 && text.length < 3500) return true;
  return false;
}

function betterHtml(
  staticHtml: { html: string; title: string } | null,
  renderedHtml: { html: string; title: string } | null,
): { html: string; title: string } | null {
  if (!renderedHtml) return staticHtml;
  if (!staticHtml) return renderedHtml;
  const staticText = visibleTextFromHtml(staticHtml.html);
  const renderedText = visibleTextFromHtml(renderedHtml.html);
  const staticLinks = staticHtml.html.match(/\bhref=/gi)?.length ?? 0;
  const renderedLinks = renderedHtml.html.match(/\bhref=/gi)?.length ?? 0;
  if (renderedText.length > staticText.length * 1.15 || renderedLinks > staticLinks) {
    return renderedHtml;
  }
  return staticHtml;
}

function collectOpenGraph(html: string): { ogTitle?: string; ogSiteName?: string } {
  const $ = cheerio.load(html);
  return {
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim(),
    ogSiteName: $('meta[property="og:site_name"]').attr("content")?.trim(),
  };
}

function pushLink(
  out: Array<{ href: string; anchor: string; score: number }>,
  rawHref: string | undefined,
  pageUrl: string,
  anchor: string,
) {
  const href = rawHref?.trim();
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
  let abs: string;
  try {
    abs = new URL(href, pageUrl).href;
  } catch {
    return;
  }
  if (!/^https?:\/\//i.test(abs)) return;
  if (!sameOrigin(abs, pageUrl)) return;
  if (shouldSkipPath(abs)) return;
  out.push({ href: normalizeUrlKey(abs), anchor, score: scoreLink(abs, anchor) });
}

function collectLinks(html: string, pageUrl: string): Array<{ href: string; anchor: string; score: number }> {
  const $ = cheerio.load(html);
  const out: Array<{ href: string; anchor: string; score: number }> = [];
  $("a[href]").each((_, el) => {
    pushLink(out, $(el).attr("href"), pageUrl, $(el).text().trim());
  });
  $("[data-href],[data-url],[data-link],[data-page],[data-target-url]").each((_, el) => {
    const anchor = $(el).text().trim();
    for (const attr of ["data-href", "data-url", "data-link", "data-page", "data-target-url"]) {
      pushLink(out, $(el).attr(attr), pageUrl, anchor);
    }
  });
  $("[onclick]").each((_, el) => {
    const onclick = $(el).attr("onclick") ?? "";
    const anchor = $(el).text().trim();
    for (const match of onclick.matchAll(/['"]([^'"]+\/[^'"]*)['"]/g)) {
      pushLink(out, match[1], pageUrl, anchor);
    }
  });
  return out;
}

export async function scrapeHotelWebsite(startUrl: string): Promise<ScrapedPayload> {
  let originUrl: URL;
  try {
    originUrl = new URL(startUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/i.test(originUrl.protocol)) {
    throw new Error("Only http(s) URLs are supported");
  }

  const normalizedStart = normalizeUrlKey(originUrl.href);
  const robotsRules = await fetchRobotsRules(originUrl.origin);

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number; score: number }> = [
    { url: normalizedStart, depth: 0, score: 100 },
  ];

  for (const path of COMMON_PAGE_PATHS) {
    const u = normalizeUrlKey(new URL(path, originUrl.origin).href);
    if (!isUrlAllowedByRobots(robotsRules, u)) continue;
    queue.push({ url: u, depth: 0, score: 38 });
  }

  const sitemapUrls = await discoverSitemapUrls(originUrl.origin, MAX_SITEMAP_SEED);
  for (const u of sitemapUrls) {
    const nu = normalizeUrlKey(u);
    if (!sameOrigin(nu, normalizedStart)) continue;
    if (shouldSkipPath(nu)) continue;
    if (!isUrlAllowedByRobots(robotsRules, nu)) continue;
    queue.push({ url: nu, depth: 0, score: 45 });
  }

  const raw_pages: Array<{ url: string; text: string }> = [];
  const htmlByUrl: Array<{ url: string; html: string }> = [];
  let bestTitle = "";
  const ogTitles: string[] = [];
  const ogSiteNames: string[] = [];
  let renderedPages = 0;
  const renderContext = await newRenderContext(USER_AGENT);

  try {
    while (queue.length && raw_pages.length < MAX_PAGES) {
      queue.sort((a, b) => b.score - a.score);
      const next = queue.shift();
      if (!next) break;
      const { url, depth, score } = next;
      if (visited.has(url)) continue;
      if (!isUrlAllowedByRobots(robotsRules, url)) continue;
      visited.add(url);

      const staticGot = await fetchHtml(url);
      const renderedGot =
        renderedPages < MAX_RENDERED_PAGES && shouldRenderPage(url, score, staticGot)
          ? await fetchRenderedHtml(renderContext, url)
          : null;
      if (renderedGot) renderedPages += 1;
      const got = betterHtml(staticGot, renderedGot);
      if (!got) continue;
      if (got.title.length > bestTitle.length) bestTitle = got.title;

      const og = collectOpenGraph(got.html);
      if (og.ogTitle) ogTitles.push(og.ogTitle);
      if (og.ogSiteName) ogSiteNames.push(og.ogSiteName);

      const text = visibleTextFromHtml(got.html);
      raw_pages.push({ url, text });
      htmlByUrl.push({ url, html: got.html });

      if (depth < MAX_DEPTH && raw_pages.length < MAX_PAGES) {
        const links = collectLinks(got.html, url);
        const seenHref = new Set<string>();
        for (const L of links) {
          if (seenHref.has(L.href)) continue;
          seenHref.add(L.href);
          if (visited.has(L.href)) continue;
          if (!isUrlAllowedByRobots(robotsRules, L.href)) continue;
          queue.push({ url: L.href, depth: depth + 1, score: L.score + score * 0.01 });
        }
      }
    }
  } finally {
    await renderContext?.close().catch(() => undefined);
    await closeRenderedBrowser();
  }

  if (!raw_pages.length) {
    throw new Error(
      "No crawlable HTML pages were retrieved. The site may block automated requests, robots.txt may disallow paths, or the URL may be invalid.",
    );
  }

  const jsonLd = extractJsonLdHints(htmlByUrl);
  const fullText = raw_pages.map((p) => p.text).join("\n\n");
  const { structured, fieldConfidence } = extractFromAggregated(fullText, htmlByUrl, originUrl.origin + "/", {
    bestDocumentTitle: bestTitle,
    ogTitles,
    ogSiteNames,
    jsonLd,
  });
  structured.website = originUrl.href;
  structured.metadata.source_pages = raw_pages.map((p) => p.url);
  structured.metadata.scrape_timestamp = new Date().toISOString();

  const probe = await probeImages(structured.images, 4);
  if (probe.length) {
    structured.metadata.image_probe = probe;
  }

  return {
    structured: mergeTitleFallback(structured, bestTitle),
    raw_pages,
    fieldConfidence,
  };
}

function mergeTitleFallback(s: HotelStructured, title: string): HotelStructured {
  if (!s.hotel_name.trim() && title) {
    const cleaned = title.split(/[|\-–]/)[0].trim();
    return { ...s, hotel_name: cleaned };
  }
  return s;
}
