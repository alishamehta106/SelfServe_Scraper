import * as cheerio from "cheerio";

import { extractFromAggregated, visibleTextFromHtml } from "@/lib/extractors/fromText";
import { probeImages } from "@/lib/extractors/imageProbe";
import type { HotelStructured, ScrapedPayload } from "@/lib/schema/hotel";
import { fetchRobotsRules, isUrlAllowedByRobots } from "@/lib/robots";

import { extractJsonLdHints } from "./jsonld";
import { discoverSitemapUrls } from "./sitemap";

const MAX_PAGES = 45;
const MAX_DEPTH = 5;
const MAX_SITEMAP_SEED = 35;
const FETCH_TIMEOUT_MS = 12000;

const PRIORITY_KEYWORDS =
  /amenit|room|dining|restaurant|service|polic|contact|about|facilit|gallery|meet|event|spa|pool|stay|location|wedding|banquet|menu|eat|drink/i;

const USER_AGENT = "HotelIngestMVP/0.1 (+research; contact: local)";

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
  if (/contact|location|about|dining|eat/.test(path)) s += 1;
  return s;
}

function shouldSkipPath(href: string): boolean {
  return /\.(pdf|zip|xml|rss)(\?|$)/i.test(href);
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

function collectOpenGraph(html: string): { ogTitle?: string; ogSiteName?: string } {
  const $ = cheerio.load(html);
  return {
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim(),
    ogSiteName: $('meta[property="og:site_name"]').attr("content")?.trim(),
  };
}

function collectLinks(html: string, pageUrl: string): Array<{ href: string; anchor: string; score: number }> {
  const $ = cheerio.load(html);
  const out: Array<{ href: string; anchor: string; score: number }> = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
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
    const anchor = $(el).text().trim();
    out.push({ href: normalizeUrlKey(abs), anchor, score: scoreLink(abs, anchor) });
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

  while (queue.length && raw_pages.length < MAX_PAGES) {
    queue.sort((a, b) => b.score - a.score);
    const next = queue.shift();
    if (!next) break;
    const { url, depth, score } = next;
    if (visited.has(url)) continue;
    if (!isUrlAllowedByRobots(robotsRules, url)) continue;
    visited.add(url);

    const got = await fetchHtml(url);
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
