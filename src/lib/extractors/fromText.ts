import type { HotelStructured } from "@/lib/schema/hotel";
import type { JsonLdHints } from "@/lib/scraper/jsonld";

import { extractImageAssets } from "@/lib/extractors/imageDom";

const KEYWORDS = {
  pool: /\b(pool|swimming)\b/i,
  gym: /\b(gym|fitness\s*center|workout)\b/i,
  wifi: /\b(wi-?fi|wireless|internet|complimentary\s+internet)\b/i,
  parking: /\b(parking|valet|self-?park)\b/i,
  spa: /\b(spa|sauna|steam)\b/i,
};

const NEGATIVE = /\b(no\s+(pool|gym|spa)|non-?smoking|no\s+pets|pets\s+not\s+allowed)\b/i;

function amenityScore(text: string, positive: RegExp): number {
  const t = text.toLowerCase();
  if (!positive.test(t)) return 0;
  let score = 0.55;
  if (NEGATIVE.test(t)) score -= 0.15;
  const matches = t.match(positive);
  if (matches && matches.length > 1) score = Math.min(0.95, score + 0.15);
  return Math.min(0.95, Math.max(0, score));
}

const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractPhones(text: string): { value: string; conf: number } {
  const m = text.match(PHONE_RE);
  if (!m?.length) return { value: "", conf: 0 };
  const best = m.sort(
    (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length,
  )[0];
  const digits = best.replace(/\D/g, "");
  const conf = digits.length >= 10 ? 0.75 : 0.4;
  return { value: best.trim(), conf };
}

function extractEmails(text: string): { value: string; conf: number } {
  const m = text.match(EMAIL_RE);
  if (!m?.length) return { value: "", conf: 0 };
  return { value: m[0], conf: 0.8 };
}

const ADDRESS_HINT =
  /\b(\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b[^.\n]{0,80})/gi;

function extractAddress(text: string): { value: string; conf: number } {
  ADDRESS_HINT.lastIndex = 0;
  const m = ADDRESS_HINT.exec(text);
  if (!m) return { value: "", conf: 0 };
  return { value: m[1].replace(/\s+/g, " ").trim(), conf: 0.45 };
}

const TIME_RANGE =
  /\b(check[-\s]?in|arrival)\b[^.\n]{0,40}\b(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?))\b/gi;
const CHECK_OUT =
  /\b(check[-\s]?out|departure)\b[^.\n]{0,40}\b(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?))\b/gi;

function firstMatchGroup(re: RegExp, text: string, group = 2): { value: string; conf: number } {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m?.[group]) return { value: "", conf: 0 };
  return { value: String(m[group]).trim(), conf: 0.55 };
}

function extractPolicyBlock(text: string, label: RegExp): { value: string; conf: number } {
  const idx = text.search(label);
  if (idx === -1) return { value: "", conf: 0 };
  const slice = text.slice(idx, idx + 400);
  const sentence = slice.split(/\n\n|\.(?:\s|$)/)[0] ?? slice;
  const cleaned = sentence.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return { value: "", conf: 0 };
  return { value: cleaned.slice(0, 500), conf: 0.5 };
}

const ROOM_LINE = /^(?:•|-|\*|\d+\.)\s*(.{8,80})$/gm;
const SUITE_WORDS =
  /\b(standard|deluxe|suite|king|queen|twin|double|ocean\s*view|city\s*view|room|studio)\b/i;

function extractRoomTypes(text: string): { list: string[]; conf: number } {
  const lines = text.split(/\n/);
  const out = new Set<string>();
  for (const line of lines) {
    const t = line.trim();
    if (SUITE_WORDS.test(t) && t.length > 5 && t.length < 120) {
      out.add(t);
    }
  }
  let m: RegExpExecArray | null;
  const re = new RegExp(ROOM_LINE);
  while ((m = re.exec(text)) !== null) {
    const v = m[1].trim();
    if (SUITE_WORDS.test(v)) out.add(v);
  }
  const list = [...out].slice(0, 20);
  const conf = list.length ? 0.5 : 0;
  return { list, conf };
}

const SERVICE_WORDS: Array<[string, RegExp]> = [
  ["Concierge", /\bconcierge\b/i],
  ["Room service", /\broom\s*service\b/i],
  ["Laundry", /\blaundry\b/i],
  ["Shuttle", /\bshuttle\b/i],
  ["Business center", /\bbusiness\s*center\b/i],
  ["Airport transfer", /\bairport\s*(transfer|shuttle)\b/i],
];

function extractServices(text: string): { list: string[]; conf: number } {
  const list: string[] = [];
  for (const [label, re] of SERVICE_WORDS) {
    if (re.test(text)) list.push(label);
  }
  return { list, conf: list.length ? 0.55 : 0 };
}

const GENERIC_RESTAURANT = /^(restaurant|dining|our\s+dining|food\s*&\s*beverage|f\s*&\s*b|the\s+restaurant)$/i;

function isWeakRestaurantRow(
  row: { restaurant_name: string; hours: string; menu_items: string[] },
  pageTitles: string[],
): boolean {
  const n = row.restaurant_name.trim();
  if (!n) return true;
  if (GENERIC_RESTAURANT.test(n)) return true;
  const lower = n.toLowerCase();
  for (const t of pageTitles) {
    const tl = t.trim().toLowerCase();
    if (tl && lower === tl) {
      const hasSignal = Boolean(row.hours.trim() || row.menu_items.length);
      if (!hasSignal) return true;
    }
  }
  if (n.length < 3) return true;
  return false;
}

const RESTAURANT_SECTION = /\b(restaurant|dining|bistro|grill|café|cafe)\b[^]{0,1600}/gi;

function extractDiningHeuristic(
  text: string,
  pageTitles: string[],
): HotelStructured["dining"] {
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(RESTAURANT_SECTION);
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[0]);
  }
  if (!blocks.length) return [];
  const dining: HotelStructured["dining"] = [];
  for (const block of blocks.slice(0, 6)) {
    const nameMatch = block.match(
      /\b([A-Z][\w\s&']{1,48})\s+(?:Restaurant|Grill|Bistro|Café|Cafe|Bar)\b/,
    );
    const hoursMatch = block.match(
      /\b(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|open\s+daily[^.\n]{0,60}|breakfast|lunch|dinner)\b/i,
    );
    const menuItems = [...block.matchAll(/\b(?:signature|chef|dish|menu)\b[^.\n]{0,80}/gi)]
      .map((x) => x[0].trim())
      .slice(0, 10);
    const row = {
      restaurant_name: nameMatch ? nameMatch[1].trim() : "",
      hours: hoursMatch ? hoursMatch[1].trim() : "",
      menu_items: menuItems,
    };
    if (!isWeakRestaurantRow(row, pageTitles)) {
      dining.push(row);
    }
  }
  return dedupeDining(dining);
}

function dedupeDining(rows: HotelStructured["dining"]): HotelStructured["dining"] {
  const seen = new Set<string>();
  const out: HotelStructured["dining"] = [];
  for (const r of rows) {
    const k = r.restaurant_name.toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 12);
}

function mergeDining(
  jsonLd: JsonLdHints["restaurants"],
  heuristic: HotelStructured["dining"],
): HotelStructured["dining"] {
  const fromLd: HotelStructured["dining"] = jsonLd.map((r) => ({
    restaurant_name: r.name,
    hours: r.hours,
    menu_items: r.menu_items ?? [],
  }));
  return dedupeDining([...fromLd, ...heuristic]);
}

function pickHotelName(
  jsonLd: JsonLdHints,
  bestDocumentTitle: string,
  ogTitles: string[],
  ogSiteNames: string[],
): { name: string; conf: number } {
  if (jsonLd.hotelNames[0]) {
    return { name: jsonLd.hotelNames[0], conf: 0.92 };
  }
  const site = mostCommon(ogSiteNames);
  if (site) return { name: site, conf: 0.78 };
  const og = mostCommon(ogTitles.filter((t) => t && !isGenericPageTitle(t)));
  if (og) return { name: cleanTitle(og), conf: 0.62 };
  if (bestDocumentTitle) {
    return { name: cleanTitle(bestDocumentTitle), conf: 0.48 };
  }
  return { name: "", conf: 0 };
}

function isGenericPageTitle(t: string): boolean {
  return /^(home|welcome|official\s+site)$/i.test(t.trim());
}

function cleanTitle(t: string): string {
  const s = t.split(/\s*[|\-–]\s*/).map((x) => x.trim());
  if (s.length >= 2) {
    const longest = s.reduce((a, b) => (b.length > a.length ? b : a));
    if (longest.length > 4) return longest;
  }
  return s[0] ?? t;
}

function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const x of arr) {
    const k = x.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [k, v] of counts) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

export type ExtractPageMeta = {
  bestDocumentTitle: string;
  ogTitles: string[];
  ogSiteNames: string[];
  jsonLd: JsonLdHints;
};

export function extractFromAggregated(
  fullText: string,
  htmlByUrl: Array<{ url: string; html: string }>,
  baseWebsite: string,
  pageMeta: ExtractPageMeta,
): { structured: HotelStructured; fieldConfidence: Record<string, number> } {
  const { bestDocumentTitle, ogTitles, ogSiteNames, jsonLd } = pageMeta;
  const pageTitles = [
    bestDocumentTitle,
    ...ogTitles,
    ...ogSiteNames,
    ...jsonLd.hotelNames,
  ].filter(Boolean);

  const structured = structuredBase(baseWebsite, "");
  const fc: Record<string, number> = {};

  const picked = pickHotelName(jsonLd, bestDocumentTitle, ogTitles, ogSiteNames);
  structured.hotel_name = picked.name;
  fc["hotel_name"] = picked.conf;

  const phone = extractPhones(fullText);
  const ldPhone = jsonLd.telephones[0] ?? "";
  structured.contact.phone = ldPhone || phone.value;
  fc["contact.phone"] = ldPhone ? 0.9 : phone.conf;

  const email = extractEmails(fullText);
  const ldEmail = jsonLd.emails[0] ?? "";
  structured.contact.email = ldEmail || email.value;
  fc["contact.email"] = ldEmail ? 0.9 : email.conf;

  const addr = extractAddress(fullText);
  const ldAddr = jsonLd.streetAddresses[0] ?? "";
  structured.contact.address = ldAddr || addr.value;
  fc["contact.address"] = ldAddr ? 0.88 : addr.conf;

  const ci = firstMatchGroup(new RegExp(TIME_RANGE), fullText);
  structured.policies.check_in = ci.value;
  fc["policies.check_in"] = ci.conf;

  const co = firstMatchGroup(new RegExp(CHECK_OUT), fullText);
  structured.policies.check_out = co.value;
  fc["policies.check_out"] = co.conf;

  const pet = extractPolicyBlock(fullText, /\bpet(s)?\b|\banimal\b/i);
  structured.policies.pet_policy = pet.value;
  fc["policies.pet_policy"] = pet.conf;

  const cancel = extractPolicyBlock(fullText, /\bcancel(lation)?\b/i);
  structured.policies.cancellation_policy = cancel.value;
  fc["policies.cancellation_policy"] = cancel.conf;

  const smoke = extractPolicyBlock(fullText, /\bsmok(ing|e-free|ing-free)\b/i);
  structured.policies.smoking_policy = smoke.value;
  fc["policies.smoking_policy"] = smoke.conf;

  for (const key of Object.keys(KEYWORDS) as Array<keyof typeof KEYWORDS>) {
    const score = amenityScore(fullText, KEYWORDS[key]);
    structured.amenities[key] = score >= 0.55;
    fc[`amenities.${key}`] = score;
  }

  const rooms = extractRoomTypes(fullText);
  structured.room_types = rooms.list;
  fc["room_types"] = rooms.conf;

  const svc = extractServices(fullText);
  structured.services = svc.list;
  fc["services"] = svc.conf;

  const heurDining = extractDiningHeuristic(fullText, pageTitles);
  structured.dining = mergeDining(jsonLd.restaurants, heurDining);
  fc["dining"] = structured.dining.length ? (jsonLd.restaurants.length ? 0.88 : 0.55) : 0;

  const assets: Array<{ url: string; alt: string; caption: string }> = [];
  const urls = new Set<string>();
  for (const { url, html } of htmlByUrl) {
    for (const a of extractImageAssets(html, url)) {
      if (urls.has(a.url)) continue;
      urls.add(a.url);
      assets.push(a);
    }
  }
  structured.images = assets.map((a) => a.url);
  structured.metadata.image_details = assets.slice(0, 60);
  fc["images"] = structured.images.length ? 0.65 : 0;

  return { structured, fieldConfidence: fc };
}

function structuredBase(website: string, title: string): HotelStructured {
  const ts = new Date().toISOString();
  return {
    hotel_name: title || "",
    website,
    contact: { phone: "", email: "", address: "" },
    amenities: { pool: false, gym: false, wifi: false, parking: false, spa: false },
    dining: [],
    services: [],
    policies: {
      check_in: "",
      check_out: "",
      pet_policy: "",
      cancellation_policy: "",
      smoking_policy: "",
    },
    room_types: [],
    images: [],
    metadata: {
      scrape_timestamp: ts,
      source_pages: [],
      image_details: [],
    },
  };
}

export function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
