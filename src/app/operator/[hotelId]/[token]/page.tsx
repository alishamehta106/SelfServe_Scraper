import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import type { GapReport, HotelStructured, ScrapedPayload } from "@/lib/schema/hotel";

import OperatorDashboard from "./OperatorDashboard";

export default async function OperatorPage({
  params,
}: {
  params: Promise<{ hotelId: string; token: string }>;
}) {
  const { hotelId, token } = await params;
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel || hotel.operatorToken !== token) {
    notFound();
  }

  const scraped = hotel.scrapedData as unknown as ScrapedPayload;
  const structured: HotelStructured =
    hotel.status === "completed" && hotel.normalizedData
      ? (hotel.normalizedData as unknown as HotelStructured)
      : scraped.structured;

  return (
    <OperatorDashboard
      hotelId={hotel.id}
      operatorToken={token}
      websiteUrl={hotel.websiteUrl}
      status={hotel.status}
      structured={structured}
      gapReport={hotel.gapReport as unknown as GapReport}
      reviewToken={hotel.reviewToken}
    />
  );
}
