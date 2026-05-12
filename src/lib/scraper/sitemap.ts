const USER_AGENT = "HotelIngestMVP/0.1 (+research; contact: local)";

/** Collect same-origin page URLs from sitemap.xml (and one-level nested sitemap index). */
export async function discoverSitemapUrls(origin: string, maxUrls: number): Promise<string[]> {
  const base = new URL("/", origin).origin;
  const out: string[] = [];
  const seen = new Set<string>();

  async function fetchText(path: string): Promise<string | null> {
    try {
      const u = new URL(path, base).href;
      const res = await fetch(u, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  function pushUrl(loc: string) {
    try {
      const abs = new URL(loc, base).href;
      if (!abs.startsWith(base)) return;
      if (!/^https?:\/\//i.test(abs)) return;
      if (/\.(pdf|zip|xml|jpg|jpeg|png|gif|webp|svg|css|js)(\?|$)/i.test(abs)) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      out.push(abs);
    } catch {
      /* skip */
    }
  }

  const primary = await fetchText("/sitemap.xml");
  if (primary) {
    parseSitemapXml(primary, pushUrl);
  }

  if (out.length < maxUrls) {
    const idx = await fetchText("/sitemap_index.xml");
    if (idx) {
      const nested = [...idx.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of nested) {
        if (out.length >= maxUrls) break;
        if (!/sitemap.*\.xml$/i.test(loc)) continue;
        try {
          const nestedUrl = new URL(loc).href;
          const t = await fetch(nestedUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(10000),
          }).then((r) => (r.ok ? r.text() : null));
          if (t) parseSitemapXml(t, pushUrl);
        } catch {
          /* skip */
        }
      }
    }
  }

  return out.slice(0, maxUrls);
}

function parseSitemapXml(xml: string, onLoc: (loc: string) => void): void {
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    onLoc(m[1].trim());
  }
}
