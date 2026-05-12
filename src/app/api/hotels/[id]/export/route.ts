import { NextResponse } from "next/server";

import { buildReadableExport, exportToLongFormCsv } from "@/lib/export-report";
import { prisma } from "@/lib/db";
import { isOperatorToken } from "@/lib/hotel-tokens";
import type { GapReport, HotelStructured, ProvenanceEntry, ScrapedPayload } from "@/lib/schema/hotel";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel || !isOperatorToken(hotel, token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const scrapedPayload = hotel.scrapedData as unknown as ScrapedPayload;
  const data = (hotel.normalizedData as unknown as HotelStructured | null) ?? scrapedPayload.structured;
  const gapReport = hotel.gapReport as unknown as GapReport;
  const provenance = hotel.provenance as Record<string, ProvenanceEntry<unknown>> | null;

  const readable = buildReadableExport({
    hotelId: hotel.id,
    websiteUrl: hotel.websiteUrl,
    status: hotel.status,
    reviewToken: hotel.reviewToken,
    operatorToken: hotel.operatorToken,
    data,
    gapReport,
    provenance,
  });

  if (format === "csv") {
    const csv = exportToLongFormCsv(readable, gapReport);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hotel-${id}-report.csv"`,
      },
    });
  }

  const payload = {
    ...readable,
    scrape_gap_reference: Object.fromEntries(
      Object.entries(gapReport).map(([path, report]) => [
        path,
        report.note ? { status: report.status, note: report.note } : { status: report.status },
      ]),
    ),
    canonical_hotel: data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hotel-${id}-report.json"`,
    },
  });
}
