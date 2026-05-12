import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { detectGaps } from "@/lib/gap-detection";
import { scrapeHotelWebsite } from "@/lib/scraper/crawl";

export const maxDuration = 120;

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
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let scraped;
  try {
    scraped = await scrapeHotelWebsite(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scrape failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const { gapReport, missingFields } = detectGaps(
    scraped.structured,
    scraped.fieldConfidence,
  );

  const reviewToken = randomBytes(24).toString("hex");

  const operatorToken = randomBytes(24).toString("hex");

  const hotel = await prisma.hotel.create({
    data: {
      websiteUrl: url,
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
