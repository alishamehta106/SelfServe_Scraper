import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel || hotel.reviewToken !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safe = path.basename(decodeURIComponent(filename));
  const diskPath = path.join(process.cwd(), "data", "uploads", id, safe);
  try {
    const buf = await readFile(diskPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentTypeFor(safe),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }
}
