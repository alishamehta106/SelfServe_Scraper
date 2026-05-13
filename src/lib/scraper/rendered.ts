import * as cheerio from "cheerio";
import type { Browser, BrowserContext } from "playwright";

const RENDER_TIMEOUT_MS = 15000;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({
        headless: true,
      }),
    );
  }
  return browserPromise;
}

export async function newRenderContext(userAgent: string): Promise<BrowserContext | null> {
  try {
    const browser = await getBrowser();
    return await browser.newContext({
      userAgent,
      viewport: { width: 1365, height: 900 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });
  } catch {
    browserPromise = null;
    return null;
  }
}

async function revealCommonNavigation(context: BrowserContext, url: string) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);

    const clickable = page
      .locator(
        [
          'button[aria-expanded="false"]',
          '[role="button"][aria-expanded="false"]',
          'button:has-text("Menu")',
          'button:has-text("Dining")',
          'button:has-text("Rooms")',
          'button:has-text("Amenities")',
          'button:has-text("More")',
        ].join(","),
      )
      .first();

    if (await clickable.isVisible().catch(() => false)) {
      await clickable.click({ timeout: 1500 }).catch(() => undefined);
      await page.waitForTimeout(350);
    }

    const html = await page.content();
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    return { html, title };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function fetchRenderedHtml(
  context: BrowserContext | null,
  url: string,
): Promise<{ html: string; title: string } | null> {
  if (!context) return null;
  return revealCommonNavigation(context, url);
}

export async function closeRenderedBrowser() {
  const browser = await browserPromise?.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}
