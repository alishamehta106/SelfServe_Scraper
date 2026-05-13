import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { GapReport, HotelStructured, ScrapedPayload } from "@/lib/schema/hotel";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel || hotel.operatorToken !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const scraped = hotel.scrapedData as unknown as ScrapedPayload;
  const structured: HotelStructured =
    hotel.status === "completed" && hotel.normalizedData
      ? (hotel.normalizedData as unknown as HotelStructured)
      : scraped.structured;

  return NextResponse.json({
    status: hotel.status,
    structured,
    gapReport: hotel.gapReport as unknown as GapReport,
  });
}
