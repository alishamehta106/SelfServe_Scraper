import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import type { GapReport, HotelStructured, ScrapedPayload } from "@/lib/schema/hotel";

import ReviewForm from "./ReviewForm";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ hotelId: string; token: string }>;
}) {
  const { hotelId, token } = await params;
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel || hotel.reviewToken !== token) {
    notFound();
  }

  const scraped = hotel.scrapedData as unknown as ScrapedPayload;
  const initialStructured: HotelStructured =
    hotel.status === "completed" && hotel.normalizedData
      ? (hotel.normalizedData as unknown as HotelStructured)
      : scraped.structured;

  return (
    <ReviewForm
      hotelId={hotel.id}
      token={token}
      websiteUrl={hotel.websiteUrl}
      initialStructured={initialStructured}
      gapReport={hotel.gapReport as unknown as GapReport}
      initialStatus={hotel.status}
    />
  );
}
