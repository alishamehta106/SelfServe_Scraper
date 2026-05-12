import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export type ImageAsset = {
  url: string;
  alt: string;
  caption: string;
};

function pickSrcFromImg($: cheerio.CheerioAPI, el: Element): string | null {
  const $el = $(el);
  const srcset = $el.attr("srcset");
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    if (first) return first;
  }
  const src = $el.attr("src") || $el.attr("data-src");
  if (!src) return null;
  return src;
}

function captionForImg($: cheerio.CheerioAPI, el: Element): string {
  const fig = $(el).closest("figure");
  if (fig.length) {
    const cap = fig.find("figcaption").first().text().trim();
    if (cap) return cap.slice(0, 400);
  }
  const prev = $(el).parent().prev("h1,h2,h3,h4,.wp-caption-text,.caption");
  if (prev.length) return prev.first().text().trim().slice(0, 200);
  return "";
}

function cleanImageText(input: string): string {
  return input
    .replace(/\bItem\s*\d+\b/gi, " ")
    .replace(/\bLink to Larger Image\b/gi, " ")
    .replace(/\b(image|photo)\s+\d+\s+of\s+\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;

function isLikelyPhotoUrl(href: string): boolean {
  return IMG_EXT.test(href) && !/\/(sprite|icon|logo-16)/i.test(href);
}

/** Extract decorative/content images with alt and caption context (no pixel decoding). */
export function extractImageAssets(html: string, pageUrl: string): ImageAsset[] {
  const $ = cheerio.load(html);
  const out: ImageAsset[] = [];
  const seen = new Set<string>();

  $('meta[property="og:image"],meta[name="twitter:image"]').each((_, el) => {
    const c = $(el).attr("content");
    if (!c) return;
    try {
      const u = new URL(c, pageUrl).href;
      if (!isLikelyPhotoUrl(u)) return;
      if (seen.has(u)) return;
      seen.add(u);
      out.push({ url: u, alt: "", caption: "" });
    } catch {
      /* skip */
    }
  });

  $("img[src],img[data-src]").each((_, el) => {
    const src = pickSrcFromImg($, el);
    if (!src) return;
    let abs: string;
    try {
      abs = new URL(src, pageUrl).href;
    } catch {
      return;
    }
    if (!isLikelyPhotoUrl(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    const alt = cleanImageText($(el).attr("alt") || "");
    const title = cleanImageText($(el).attr("title") || "");
    const caption = cleanImageText(captionForImg($, el) || title);
    out.push({ url: abs, alt, caption });
  });

  return out.slice(0, 80);
}
