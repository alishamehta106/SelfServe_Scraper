import type { HotelStructured } from "@/lib/schema/hotel";
import type { JsonLdHints } from "@/lib/scraper/jsonld";

import * as cheerio from "cheerio";

import { extractImageAssets } from "@/lib/extractors/imageDom";
import { isPlausibleAddress, isPlausiblePhone } from "@/lib/field-validation";

const KEYWORDS = {
  pool: /\b(pool|swimming)\b/i,
  gym: /\b(gym|fitness\s*center|workout)\b/i,
  wifi: /\b(wi-?fi|wireless|internet|complimentary\s+internet)\b/i,
  parking: /\b(parking|valet|self-?park)\b/i,
  spa: /\b(spa|sauna|steam)\b/i,
  breakfast: /\b(breakfast|continental breakfast|morning buffet)\b/i,
  accessible_rooms: /\b(accessible room|ada|wheelchair|mobility accessible)\b/i,
  ev_charging: /\b(ev charging|electric vehicle|car charging|charging station)\b/i,
  meeting_space: /\b(meeting room|event space|conference|banquet|wedding venue)\b/i,
};

const NEGATIVE_BY_AMENITY: Record<keyof typeof KEYWORDS, RegExp> = {
  pool: /\b(no\s+(pool|swimming\s+pool)|pool\s+(is\s+)?not\s+available)\b/i,
  gym: /\b(no\s+(gym|fitness\s*center)|fitness\s*center\s+(is\s+)?not\s+available)\b/i,
  wifi: /\b(no\s+(wi-?fi|wireless|internet)|wi-?fi\s+(is\s+)?not\s+available)\b/i,
  parking: /\b(no\s+parking|parking\s+(is\s+)?not\s+available)\b/i,
  spa: /\b(no\s+spa|spa\s+(is\s+)?not\s+available)\b/i,
  breakfast: /\b(no\s+breakfast|breakfast\s+(is\s+)?not\s+available)\b/i,
  accessible_rooms: /\b(no\s+accessible rooms?|not\s+wheelchair\s+accessible)\b/i,
  ev_charging: /\b(no\s+(ev|electric vehicle)\s+charging|ev charging\s+(is\s+)?not\s+available)\b/i,
  meeting_space: /\b(no\s+(meeting|event|conference)\s+(rooms?|space))\b/i,
};

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))].length;
}

function imageKey(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    url.search = "";
    return url.href.toLowerCase();
  } catch {
    return href.toLowerCase();
  }
}

function amenityScore(text: string, key: keyof typeof KEYWORDS): number {
  const t = text.toLowerCase();
  const positive = KEYWORDS[key];
  if (!positive.test(t)) return 0;
  let score = 0.55;
  if (NEGATIVE_BY_AMENITY[key].test(t)) score -= 0.25;
  const matches = countMatches(t, positive);
  if (matches > 1) score = Math.min(0.95, score + 0.15);
  if (matches > 3) score = Math.min(0.95, score + 0.1);
  return Math.min(0.95, Math.max(0, score));
}

const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractPhones(text: string): { value: string; conf: number } {
  const candidates = extractPhoneCandidates(text).map((entry) => entry.value);
  if (!candidates.length) return { value: "", conf: 0 };
  const best = candidates[0];
  const conf = /[().\s-]/.test(best) ? 0.82 : 0.72;
  return { value: best.trim(), conf };
}

function extractPhoneCandidates(text: string): Array<{ label: string; value: string; note: string }> {
  const seen = new Set<string>();
  return [...text.matchAll(PHONE_RE)]
    .map((m) => m[0].trim())
    .filter(isPlausiblePhone)
    .filter((value) => {
      const key = value.replace(/\D/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((value, index) => ({
      label: index === 0 ? "Primary phone" : `Additional phone ${index + 1}`,
      value,
      note: "",
    }));
}

function isBadEmailCandidate(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes("example.") ||
    v.includes("domain.") ||
    v.includes("yourname") ||
    v.includes("name@") ||
    v.includes("email@") ||
    v.includes("user@") ||
    v.includes("test@") ||
    v.endsWith(".png") ||
    v.endsWith(".jpg") ||
    v.endsWith(".jpeg") ||
    v.endsWith(".webp")
  );
}

function extractEmails(text: string): { value: string; conf: number } {
  const candidates = [...text.matchAll(EMAIL_RE)]
    .map((m) => m[0].trim().replace(/[),.;:]+$/, ""))
    .filter((email) => !isBadEmailCandidate(email));
  if (!candidates.length) return { value: "", conf: 0 };
  const preferred = candidates.find((email) =>
    /^(info|frontdesk|reservations?|booking|stay|hello|contact|sales|concierge)@/i.test(email),
  );
  return { value: preferred ?? candidates[0], conf: preferred ? 0.86 : 0.72 };
}

function cleanLdEmail(email: string): string {
  const cleaned = email.trim().replace(/^mailto:/i, "").replace(/[),.;:]+$/, "");
  return isBadEmailCandidate(cleaned) ? "" : cleaned;
}

const ADDRESS_HINT =
  /\b(\d{1,6}\s+[\w.' -]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|terrace|ter|circle|cir)\b[^\n]{0,100}?\b\d{5}(?:-\d{4})?\b)/gi;

function extractAddress(text: string): { value: string; conf: number } {
  const candidates = extractAddressCandidates(text);
  if (!candidates.length) return { value: "", conf: 0 };
  return { value: candidates[0].value, conf: 0.68 };
}

function extractAddressCandidates(text: string): Array<{ label: string; value: string; note: string }> {
  ADDRESS_HINT.lastIndex = 0;
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string; note: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = ADDRESS_HINT.exec(text)) !== null) {
    const value = m[1].replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
    const key = value.toLowerCase();
    if (!isPlausibleAddress(value) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: out.length === 0 ? "Primary address" : `Additional address ${out.length + 1}`,
      value,
      note: "",
    });
    if (out.length >= 5) break;
  }
  return out;
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

const SECTION_STOP =
  /\b(check[-\s]?in|check[-\s]?out|arrival|departure|amenit|room|dining|restaurant|parking|accessibility|privacy|terms|faq|contact|location|gallery|newsletter)\b/i;
const PET_POLICY_SIGNAL =
  /\b(pet policy|pets? allowed|dogs? allowed|cats? allowed|service animals?|fee|deposit|\$\s?\d|per stay|per night|weight|lbs?\.?|pounds?|maximum|max|limit|restrictions?|not allowed|prohibited|non-refundable|cleaning fee)\b/i;
const PET_MARKETING_ONLY =
  /\b(pet-friendly|pet friendly)\b/i;
const POLICY_QUESTION =
  /^\s*(?:are|do|does|what|when|where|which|who|how|can|is|in)\b[^.!?]{0,180}\?\s*$/i;

function cleanPolicyCandidate(lines: string[]): string {
  return lines
    .flatMap((line) => line.split(/(?<=[?.!])\s+/))
    .filter((line) => !POLICY_QUESTION.test(line))
    .join(" ")
    .replace(/^\s*(?:pet policy|cancellation policy|smoking policy)\s*[:\-]\s*/i, "")
    .replace(/\b(?:are pets allowed|do you allow pets|what is your pet policy|what is the pet policy|what is your cancellation policy|what is the cancellation policy|what is your smoking policy|what is the smoking policy|are there restrictions for weight, height or types)\?\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function extractPolicyBlock(
  text: string,
  label: RegExp,
  requiredSignal: RegExp,
): { value: string; conf: number } {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    if (!label.test(lines[i])) continue;

    const chunk: string[] = [lines[i]];
    for (let j = i + 1; j < lines.length && chunk.join(" ").length < 520; j += 1) {
      const line = lines[j];
      if (SECTION_STOP.test(line) && !label.test(line)) break;
      if (line.length < 3) break;
      chunk.push(line);
      if (/[.!?]$/.test(line) && chunk.join(" ").length > 80) break;
    }

    const cleaned = cleanPolicyCandidate(chunk).slice(0, 500);
    if (cleaned.length < 18) continue;
    if (!requiredSignal.test(cleaned)) continue;
    return { value: cleaned, conf: chunk.length > 1 ? 0.62 : 0.48 };
  }

  return { value: "", conf: 0 };
}

function extractPetPolicyBlock(text: string): { value: string; conf: number } {
  const candidate = extractPolicyBlock(text, /\bpet(s)?\b|\bdog(s)?\b|\bcat(s)?\b|\banimal(s)?\b/i, PET_POLICY_SIGNAL);
  if (!candidate.value) return candidate;

  const hasPolicyDetail = PET_POLICY_SIGNAL.test(candidate.value);
  const marketingOnly =
    PET_MARKETING_ONLY.test(candidate.value) &&
    !/\b(pet policy|pets? allowed|dogs? allowed|cats? allowed|service animals?|fee|deposit|\$\s?\d|weight|lbs?\.?|pounds?|maximum|max|limit|restrictions?|not allowed|prohibited)\b/i.test(
      candidate.value,
    );

  if (!hasPolicyDetail || marketingOnly) return { value: "", conf: 0 };
  return candidate;
}

const ROOM_LINE = /^(?:•|-|\*|\d+\.)\s*(.{8,80})$/gm;
const SUITE_WORDS =
  /\b(standard|deluxe|suite|king|queen|twin|double|ocean\s*view|city\s*view|room|studio)\b/i;
const ROOM_NOISE =
  /\b(link to larger image|image|photo|gallery|view all|book now|reserve|check availability|amenities|policy|dining|restaurant|parking|address|phone|email|calendar|journal|press|article|decor|décor|fitness|telephone|workspace|pet|feeder|coffee|bottled water|bicycles?|hydrow|tonal|market street|complimentary|on-site|in-room|audible|messages|located|larger|guest room)\b/i;
const ROOM_NAME_PATTERN =
  /\b(?:classic|premier|deluxe|standard|superior|executive|accessible|ada|beacon hill|city view|studio|suite|king|queen|double|twin)\b/i;

function cleanRoomType(input: string): string {
  return input
    .replace(/\bItem\s*\d+\b/gi, " ")
    .replace(/\bLink to Larger Image\b/gi, " ")
    .replace(/^\s*Rooms?\s*&\s*Suites?\s*/i, "")
    .replace(/^\s*(?:Rooms?|Suites?|Accommodations?)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function isLikelyRoomType(input: string): boolean {
  const value = cleanRoomType(input);
  if (!SUITE_WORDS.test(value)) return false;
  if (!ROOM_NAME_PATTERN.test(value)) return false;
  if (ROOM_NOISE.test(value)) return false;
  if (/\||\d{3,}|[.!?]/.test(value)) return false;
  if (/^\s*[•*-]/.test(input)) return false;
  const words = value.split(/\s+/);
  if (value.length < 4 || value.length > 70) return false;
  if (words.length > 7) return false;
  if (/\b(with|including|includes?|located|larger|use of)\b/i.test(value)) return false;
  return true;
}

function extractRoomTypes(text: string): { list: string[]; conf: number } {
  const lines = text.split(/\n/);
  const out = new Set<string>();
  for (const line of lines) {
    const t = cleanRoomType(line);
    if (isLikelyRoomType(t)) {
      out.add(t);
    }
  }
  let m: RegExpExecArray | null;
  const re = new RegExp(ROOM_LINE);
  while ((m = re.exec(text)) !== null) {
    const v = cleanRoomType(m[1]);
    if (isLikelyRoomType(v)) out.add(v);
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
const DAY_MAP: Record<string, string> = {
  Mo: "Mon",
  Tu: "Tue",
  We: "Wed",
  Th: "Thu",
  Fr: "Fri",
  Sa: "Sat",
  Su: "Sun",
};

function isWeakRestaurantRow(
  row: { restaurant_name: string; hours: string; menu_items: string[] },
  pageTitles: string[],
): boolean {
  const n = row.restaurant_name.trim();
  if (!n) return true;
  if (GENERIC_RESTAURANT.test(n) && !row.hours.trim() && !row.menu_items.length) return true;
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

const DINING_START =
  /\b(restaurant|restaurants|dining|bistro|grill|café|cafe|bar|breakfast|lunch|dinner|menu)\b/i;
const DINING_STOP =
  /\b(pet policy|pets?|parking|valet|garage|check[-\s]?in|check[-\s]?out|cancellation|smoking|accessibility|rooms?|suites?|amenities|services|contact|location|gallery|faq)\b/i;
const MENU_PRICE_RE = /(?:[$€£]\s?\d{1,4}(?:[.,]\d{2})?|\b\d{1,4}(?:[.,]\d{2})?\s?(?:USD|EUR|GBP)\b)/i;
const MENU_NOISE =
  /\b(menu|download|pdf|view|order|reserve|reservation|hours?|open|closed|restaurant|dining)\b/i;
const MENU_HARD_REJECT =
  /\b(pet|pets|dog|cat|animal|parking|valet|vehicle|oversized|guest room|per stay|per night|fee|deposit|policy|restriction|check[-\s]?in|check[-\s]?out|cancellation|smoking)\b/i;
const FOOD_WORDS =
  /\b(toast|egg|omelet|pancake|waffle|salad|soup|sandwich|burger|steak|chicken|fish|salmon|pasta|pizza|taco|dessert|cake|coffee|tea|wine|beer|cocktail|breakfast|lunch|dinner|brunch|appetizer|entree|entrée|sides?)\b/i;
const DINING_HOURS_LINE =
  /\b(?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?(?:\s*,\s*\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)*/gi;

function normalizeDiningHours(input: string): string {
  return input
    .split(/\s*\|\s*/)
    .map((part) =>
      part
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (day) => DAY_MAP[day] ?? day)
        .replace(/\b(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\b/g, "$1:$2 - $3:$4")
        .replace(/,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function cleanMenuLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\b(add|substitute)\s+\$?\d+(?:\.\d{2})?\b/gi, "")
    .trim()
    .slice(0, 140);
}

function extractMenuItemsFromBlock(block: string): string[] {
  const out = new Set<string>();
  for (const raw of block.split(/\n|•|\u2022/)) {
    const line = cleanMenuLine(raw);
    if (line.length < 6 || line.length > 140) continue;
    if (!MENU_PRICE_RE.test(line)) continue;
    if (MENU_HARD_REJECT.test(line)) continue;
    if (!FOOD_WORDS.test(line) && !/[A-Z][A-Za-z '&()]+ - [$€£]/.test(line)) continue;
    if (MENU_NOISE.test(line) && line.length < 24) continue;
    out.add(line.replace(/\s[-–—]\s*/g, " - "));
  }
  for (const match of block.matchAll(/([A-Z][A-Za-z0-9 '&().,/+-]{3,70})\s+([-–—.]?\s*)?([$€£]\s?\d{1,4}(?:[.,]\d{2})?)/g)) {
    const line = cleanMenuLine(`${match[1]} - ${match[3]}`);
    if (MENU_HARD_REJECT.test(line)) continue;
    if (!FOOD_WORDS.test(line) && !/[A-Z][A-Za-z '&()]+ - [$€£]/.test(line)) continue;
    if (line.length >= 6) out.add(line);
  }
  return [...out].slice(0, 20);
}

function diningBlocksFromText(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!DINING_START.test(lines[i])) continue;
    const chunk = [lines[i]];
    for (let j = i + 1; j < lines.length && chunk.length < 24; j += 1) {
      const line = lines[j];
      if (DINING_STOP.test(line) && !DINING_START.test(line)) break;
      if (line.length > 260) break;
      chunk.push(line);
    }
    const block = chunk.join("\n");
    if (MENU_PRICE_RE.test(block) || /\b(open daily|breakfast|lunch|dinner|\d{1,2}:\d{2})\b/i.test(block)) {
      blocks.push(block);
    }
  }

  return blocks.slice(0, 10);
}

function extractDiningHeuristic(
  text: string,
  pageTitles: string[],
): HotelStructured["dining"] {
  const blocks = diningBlocksFromText(text);
  if (!blocks.length) return [];
  const dining: HotelStructured["dining"] = [];
  for (const block of blocks.slice(0, 6)) {
    const nameMatch = block.match(
      /\b([A-Z][\w\s&']{1,48})\s+(?:Restaurant|Grill|Bistro|Café|Cafe|Bar)\b/,
    );
    const hourLines = [...block.matchAll(DINING_HOURS_LINE)].map((match) => match[0]);
    const openDaily = block.match(/\bopen\s+daily[^.\n]{0,60}/i)?.[0] ?? "";
    const pricedMenuItems = extractMenuItemsFromBlock(block);
    const menuItems = pricedMenuItems.length
      ? pricedMenuItems
      : [...block.matchAll(/\b(?:signature|chef|dish|menu)\b[^.\n]{0,80}/gi)]
      .map((x) => x[0].trim())
      .slice(0, 10);
    const row = {
      restaurant_name: nameMatch ? nameMatch[1].trim() : pricedMenuItems.length ? "Dining" : "",
      hours: normalizeDiningHours(hourLines.length ? hourLines.join(" | ") : openDaily),
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
  const validLdPhone = isPlausiblePhone(ldPhone) ? ldPhone : "";
  structured.contact.phone = validLdPhone || phone.value;
  structured.contact.phones = [
    ...(validLdPhone
      ? [{ label: "Structured-data phone", value: validLdPhone, note: "" }]
      : []),
    ...extractPhoneCandidates(fullText),
  ].filter((entry, index, arr) => arr.findIndex((x) => x.value.replace(/\D/g, "") === entry.value.replace(/\D/g, "")) === index);
  fc["contact.phone"] = validLdPhone ? 0.9 : phone.conf;

  const email = extractEmails(fullText);
  const ldEmail = cleanLdEmail(jsonLd.emails[0] ?? "");
  structured.contact.email = ldEmail || email.value;
  fc["contact.email"] = ldEmail ? 0.9 : email.conf;

  const addr = extractAddress(fullText);
  const ldAddr = jsonLd.streetAddresses[0] ?? "";
  const validLdAddr = isPlausibleAddress(ldAddr) ? ldAddr : "";
  structured.contact.address = validLdAddr || addr.value;
  structured.contact.addresses = [
    ...(validLdAddr
      ? [{ label: "Structured-data address", value: validLdAddr, note: "" }]
      : []),
    ...extractAddressCandidates(fullText),
  ].filter((entry, index, arr) => arr.findIndex((x) => x.value.toLowerCase() === entry.value.toLowerCase()) === index);
  fc["contact.address"] = validLdAddr ? 0.88 : addr.conf;

  const ci = firstMatchGroup(new RegExp(TIME_RANGE), fullText);
  structured.policies.check_in = ci.value;
  fc["policies.check_in"] = ci.conf;

  const co = firstMatchGroup(new RegExp(CHECK_OUT), fullText);
  structured.policies.check_out = co.value;
  fc["policies.check_out"] = co.conf;

  const pet = extractPetPolicyBlock(fullText);
  structured.policies.pet_policy = pet.value;
  fc["policies.pet_policy"] = pet.conf;

  const cancel = extractPolicyBlock(
    fullText,
    /\bcancel(lation|led|ing)?\b|\brefund(s|able)?\b|\bdeposit\b/i,
    /\b(cancel|refund|deposit|non-refundable|deadline|hours|days|arrival)\b/i,
  );
  structured.policies.cancellation_policy = cancel.value;
  fc["policies.cancellation_policy"] = cancel.conf;

  const smoke = extractPolicyBlock(
    fullText,
    /\bsmok(ing|e-free|ing-free)\b|\bnon[-\s]?smoking\b/i,
    /\b(smoking|smoke-free|non-smoking|fee|prohibited|designated)\b/i,
  );
  structured.policies.smoking_policy = smoke.value;
  fc["policies.smoking_policy"] = smoke.conf;

  for (const key of Object.keys(KEYWORDS) as Array<keyof typeof KEYWORDS>) {
    const score = amenityScore(fullText, key);
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

  const assets: Array<{ url: string; alt: string; caption: string; category: string }> = [];
  const urls = new Set<string>();
  for (const { url, html } of htmlByUrl) {
    for (const a of extractImageAssets(html, url)) {
      const key = imageKey(a.url);
      if (urls.has(key)) continue;
      urls.add(key);
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
    contact: { phone: "", email: "", address: "", phones: [], addresses: [] },
    amenities: {
      pool: false,
      gym: false,
      wifi: false,
      parking: false,
      spa: false,
      breakfast: false,
      accessible_rooms: false,
      ev_charging: false,
      meeting_space: false,
    },
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
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  $("br, p, div, section, article, header, footer, nav, aside, main, li, tr, h1, h2, h3, h4").each(
    (_, el) => {
      $(el).append("\n");
    },
  );

  return $("body")
    .text()
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
