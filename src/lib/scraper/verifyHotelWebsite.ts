import * as cheerio from "cheerio";

import { visibleTextFromHtml } from "@/lib/extractors/fromText";
import { extractJsonLdHints } from "@/lib/scraper/jsonld";

const VERIFY_TIMEOUT_MS = 9000;
const USER_AGENT = "HotelIngestMVP/0.1 (+research; contact: local)";

const BLOCKED_MARKETPLACE_HOSTS =
  /\b(booking|expedia|hotels|tripadvisor|airbnb|vrbo|kayak|trivago|priceline|agoda|orbitz)\./i;
const HOTEL_IDENTITY =
  /\b(hotel|resort|inn|motel|lodge|lodging|bed\s*(?:and|&)\s*breakfast|guest\s*house|suites?)\b/i;
const HOTEL_OPERATIONS =
  /\b(guest\s*rooms?|rooms?|suites?|accommodations?|amenities|check[-\s]?in|check[-\s]?out|reservations?|book\s+(?:now|a\s+room|your\s+stay)|stay\s+with\s+us|property\s+amenities)\b/i;
const HOTEL_DETAIL =
  /\b(front desk|concierge|room service|parking|pet policy|cancellation policy|accessible rooms?|fitness center|pool|spa|on-site dining|complimentary wi-?fi)\b/i;
const NON_HOTEL_NOISE =
  /\b(source code|repository|developer docs|api reference|software platform|case study|download app|pricing plan|careers|job openings)\b/i;

type VerificationPage = {
  url: string;
  html: string;
  title: string;
  text: string;
};

export type HotelWebsiteVerification = {
  ok: boolean;
  normalizedUrl: string;
  reason?: string;
};

function normalizeInputUrl(input: string): URL {
  const value = input.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withProtocol);
}

async function fetchVerifyPage(url: string): Promise<VerificationPage | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    return {
      url: res.url || url,
      html,
      title: $("title").first().text().trim(),
      text: visibleTextFromHtml(html).slice(0, 18000),
    };
  } catch {
    return null;
  }
}

function countSignals(text: string, re: RegExp): number {
  const matches = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`));
  return matches?.length ?? 0;
}

function scoreVerification(startUrl: URL, pages: VerificationPage[]): number {
  let score = 0;
  const joinedText = pages.map((page) => `${page.title}\n${page.text}`).join("\n\n");
  const host = startUrl.hostname.replace(/^www\./i, "");
  const jsonLd = extractJsonLdHints(pages.map((page) => ({ url: page.url, html: page.html })));

  if (jsonLd.hotelNames.length) score += 8;
  if (jsonLd.streetAddresses.length && jsonLd.telephones.length) score += 2;
  if (HOTEL_IDENTITY.test(host)) score += 2;
  if (HOTEL_IDENTITY.test(joinedText)) score += Math.min(5, countSignals(joinedText, HOTEL_IDENTITY));
  if (HOTEL_OPERATIONS.test(joinedText)) score += Math.min(5, countSignals(joinedText, HOTEL_OPERATIONS));
  if (HOTEL_DETAIL.test(joinedText)) score += Math.min(4, countSignals(joinedText, HOTEL_DETAIL));
  if (NON_HOTEL_NOISE.test(joinedText) && !jsonLd.hotelNames.length) score -= 3;

  return score;
}

export async function verifyHotelWebsite(inputUrl: string): Promise<HotelWebsiteVerification> {
  let startUrl: URL;
  try {
    startUrl = normalizeInputUrl(inputUrl);
  } catch {
    return { ok: false, normalizedUrl: inputUrl, reason: "Enter a valid website URL." };
  }

  if (!/^https?:$/i.test(startUrl.protocol)) {
    return { ok: false, normalizedUrl: startUrl.href, reason: "Only http and https links are supported." };
  }

  if (BLOCKED_MARKETPLACE_HOSTS.test(startUrl.hostname)) {
    return {
      ok: false,
      normalizedUrl: startUrl.href,
      reason: "Paste the hotel's official property website, not a booking marketplace page.",
    };
  }

  const rootUrl = new URL("/", startUrl.origin).href;
  const urls = Array.from(new Set([startUrl.href, rootUrl]));
  const pages = (await Promise.all(urls.map(fetchVerifyPage))).filter((page): page is VerificationPage => Boolean(page));

  if (!pages.length) {
    return {
      ok: false,
      normalizedUrl: startUrl.href,
      reason: "That website could not be opened as a public HTML page.",
    };
  }

  const score = scoreVerification(startUrl, pages);
  if (score < 7) {
    return {
      ok: false,
      normalizedUrl: startUrl.href,
      reason: "That link does not look like a hotel website. Paste the hotel's official website.",
    };
  }

  return { ok: true, normalizedUrl: startUrl.href };
}
