import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildProvenance, mergeStaffOverrides } from "@/lib/normalize";
import { hotelStructuredSchema, type ScrapedPayload } from "@/lib/schema/hotel";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token?: unknown }).token ?? "")
      : "";
  const structuredUnknown =
    typeof body === "object" && body !== null && "structured" in body
      ? (body as { structured?: unknown }).structured
      : undefined;

  if (!token || structuredUnknown === undefined) {
    return NextResponse.json({ error: "Missing token or structured" }, { status: 400 });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel || hotel.reviewToken !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (hotel.status === "completed") {
    return NextResponse.json({ error: "Review already submitted" }, { status: 409 });
  }

  const parsed = hotelStructuredSchema.safeParse(structuredUnknown);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const scrapedPayload = hotel.scrapedData as unknown as ScrapedPayload;
  const scrapedStructured = scrapedPayload.structured;

  const merged = mergeStaffOverrides(scrapedStructured, parsed.data);
  const provenance = buildProvenance(scrapedStructured, merged);

  await prisma.hotel.update({
    where: { id },
    data: {
      normalizedData: merged as object,
      provenance: provenance as object,
      status: "completed",
    },
  });

  return NextResponse.json({ ok: true, hotelId: id });
}
