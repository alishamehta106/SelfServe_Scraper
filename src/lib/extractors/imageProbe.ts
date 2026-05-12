/**
 * Optional server-side image probe (dimensions/format) via sharp.
 * Does not perform OCR or scene understanding — that requires a vision API.
 */

export type ImageProbeResult = {
  url: string;
  format?: string;
  width?: number;
  height?: number;
  bytes: number;
  error?: string;
};

const MAX_BYTES = 2_500_000;
const FETCH_MS = 8000;

export async function probeImages(urls: string[], limit: number): Promise<ImageProbeResult[]> {
  const slice = urls.slice(0, limit);
  const results: ImageProbeResult[] = [];

  let sharpMod: typeof import("sharp") | null = null;
  try {
    sharpMod = (await import("sharp")).default;
  } catch {
    return slice.map((url) => ({
      url,
      bytes: 0,
      error: "sharp_not_available",
    }));
  }

  for (const url of slice) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "HotelIngestMVP/0.1" },
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (!res.ok) {
        results.push({ url, bytes: 0, error: `http_${res.status}` });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        results.push({ url, bytes: buf.length, error: "too_large" });
        continue;
      }
      const meta = await sharpMod(buf).metadata();
      results.push({
        url,
        bytes: buf.length,
        format: meta.format,
        width: meta.width,
        height: meta.height,
      });
    } catch (e) {
      results.push({
        url,
        bytes: 0,
        error: e instanceof Error ? e.message : "fetch_failed",
      });
    }
  }

  return results;
}
