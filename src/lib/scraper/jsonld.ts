import * as cheerio from "cheerio";

export type JsonLdHints = {
  hotelNames: string[];
  telephones: string[];
  emails: string[];
  streetAddresses: string[];
  restaurants: Array<{ name: string; hours: string; menu_items: string[] }>;
  sameAs: string[];
};

const HOTEL_TYPES = new Set([
  "Hotel",
  "Motel",
  "LodgingBusiness",
  "Resort",
  "BedAndBreakfast",
  "Hostel",
]);

const FOOD_TYPES = new Set(["Restaurant", "FoodEstablishment", "BarOrPub", "CafeOrCoffeeShop"]);

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function flattenLd(input: unknown): unknown[] {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) return input.flatMap(flattenLd);
  if (typeof input === "object" && input !== null && "@graph" in input) {
    const g = (input as { "@graph": unknown })["@graph"];
    return flattenLd(g);
  }
  return [input];
}

function readHours(node: Record<string, unknown>): string {
  const oh = node.openingHoursSpecification ?? node.openingHours;
  if (typeof oh === "string") return oh;
  if (Array.isArray(oh)) {
    return oh
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return [o.dayOfWeek, o.opens, o.closes].map((v) => String(v ?? "")).filter(Boolean).join(" ");
        }
        return "";
      })
      .filter(Boolean)
      .join(" | ");
  }
  return "";
}

function readAddress(node: Record<string, unknown>): string {
  const a = node.address;
  if (typeof a === "string") return a;
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    return [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode, o.addressCountry]
      .map((x) => (typeof x === "string" ? x : ""))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function isGenericVenueName(name: string): boolean {
  return /^(restaurant|dining|bar|café|cafe|food|our kitchen|room service)$/i.test(name.trim());
}

function dedupeRestaurants(
  rows: Array<{ name: string; hours: string; menu_items: string[] }>,
): Array<{ name: string; hours: string; menu_items: string[] }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; hours: string; menu_items: string[] }> = [];
  for (const r of rows) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 12);
}

/** Aggregate JSON-LD from all HTML documents (Hotel + Restaurant nodes). */
export function extractJsonLdHints(htmlPages: Array<{ url: string; html: string }>): JsonLdHints {
  const hotelNames = new Set<string>();
  const telephones = new Set<string>();
  const emails = new Set<string>();
  const streetAddresses = new Set<string>();
  const restaurants: Array<{ name: string; hours: string; menu_items: string[] }> = [];
  const sameAs = new Set<string>();

  for (const { html } of htmlPages) {
    const $ = cheerio.load(html);
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).html();
      if (!raw?.trim()) return;
      let doc: unknown;
      try {
        doc = JSON.parse(raw.trim());
      } catch {
        return;
      }
      const roots = Array.isArray(doc) ? doc : [doc];
      for (const root of roots) {
        const nodes = flattenLd(root);
        for (const n of nodes) {
          if (!n || typeof n !== "object") continue;
          const node = n as Record<string, unknown>;
          const types = asArray(node["@type"]).flatMap((t) => (typeof t === "string" ? [t] : []));
          const isHotel = types.some((t) => HOTEL_TYPES.has(t));
          const isFood = types.some((t) => FOOD_TYPES.has(t));

          if (isHotel) {
            if (typeof node.name === "string" && node.name.trim()) {
              hotelNames.add(node.name.trim());
            }
            asArray(node.telephone)
              .filter((x): x is string => typeof x === "string")
              .forEach((t) => telephones.add(t.trim()));
            asArray(node.email)
              .filter((x): x is string => typeof x === "string")
              .forEach((m) => emails.add(m.trim()));
            const addr = readAddress(node);
            if (addr) streetAddresses.add(addr);
            const sa = node.sameAs;
            if (typeof sa === "string") sameAs.add(sa);
            if (Array.isArray(sa)) sa.forEach((u) => typeof u === "string" && sameAs.add(u));
          }

          if (isFood) {
            const name = typeof node.name === "string" ? node.name.trim() : "";
            if (!name || isGenericVenueName(name)) continue;
            const hours = readHours(node);
            const menu: string[] = [];
            const hm = node.hasMenu;
            if (typeof hm === "string") menu.push(hm);
            if (hm && typeof hm === "object" && !Array.isArray(hm)) {
              const o = hm as Record<string, unknown>;
              if (typeof o.name === "string") menu.push(o.name);
            }
            if (Array.isArray(hm)) {
              for (const item of hm) {
                if (typeof item === "string") menu.push(item);
                else if (item && typeof item === "object" && typeof (item as { name?: string }).name === "string") {
                  menu.push((item as { name: string }).name);
                }
              }
            }
            restaurants.push({ name, hours, menu_items: menu.slice(0, 12) });
          }
        }
      }
    });
  }

  return {
    hotelNames: [...hotelNames],
    telephones: [...telephones],
    emails: [...emails],
    streetAddresses: [...streetAddresses],
    restaurants: dedupeRestaurants(restaurants),
    sameAs: [...sameAs],
  };
}
