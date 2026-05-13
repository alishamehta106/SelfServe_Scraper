import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildDemoScrapedPayload } from "@/lib/demo-hotel";
import { detectGaps } from "@/lib/gap-detection";
import { scrapeHotelWebsite } from "@/lib/scraper/crawl";
import { verifyHotelWebsite } from "@/lib/scraper/verifyHotelWebsite";

export const maxDuration = 120;

function publicScrapeError(message: string): string {
  if (/No crawlable HTML pages were retrieved/i.test(message)) {
    return "The site looks like a hotel website, but its public pages could not be opened by the scraper. The site may block automated access, disallow crawling in robots.txt, require browser verification, or serve the content in a way the crawler cannot read.";
  }
  return message;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url =
    typeof body === "object" && body !== null && "url" in body
      ? String((body as { url?: unknown }).url ?? "").trim()
      : "";
  const useDemo =
    typeof body === "object" &&
    body !== null &&
    "demo" in body &&
    (body as { demo?: unknown }).demo === true;

  if (!url && !useDemo) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let verifiedUrl = url;
  if (!useDemo) {
    const verification = await verifyHotelWebsite(url);
    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.reason ?? "That link does not look like a hotel website." },
        { status: 422 },
      );
    }
    verifiedUrl = verification.normalizedUrl;
  }

  let scraped;
  try {
    scraped = useDemo ? buildDemoScrapedPayload() : await scrapeHotelWebsite(verifiedUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scrape failed";
    return NextResponse.json({ error: publicScrapeError(msg) }, { status: 422 });
  }

  const { gapReport, missingFields } = detectGaps(
    scraped.structured,
    scraped.fieldConfidence,
  );

  const reviewToken = randomBytes(24).toString("hex");

  const operatorToken = randomBytes(24).toString("hex");

  const hotel = await prisma.hotel.create({
    data: {
      websiteUrl: scraped.structured.website || verifiedUrl,
      reviewToken,
      operatorToken,
      scrapedData: scraped as object,
      gapReport: gapReport as object,
      missingFields: missingFields as object,
      status: "pending_review",
      uploadedFiles: [],
    },
  });

  return NextResponse.json({
    hotelId: hotel.id,
    token: reviewToken,
    reviewPath: `/review/${hotel.id}/${reviewToken}`,
    operatorPath: `/operator/${hotel.id}/${hotel.operatorToken}`,
    missingFieldCount: missingFields.length,
  });
}
