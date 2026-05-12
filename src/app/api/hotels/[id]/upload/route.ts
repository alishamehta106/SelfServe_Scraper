import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const maxDuration = 60;

function safeBasename(name: string): string {
  return path.basename(name).replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const file = form.get("file");

  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel || hotel.reviewToken !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 413 });
  }

  const stored = `${randomBytes(12).toString("hex")}-${safeBasename(file.name)}`;
  const dir = path.join(process.cwd(), "data", "uploads", id);
  await mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, stored);
  await writeFile(diskPath, buf);

  const uploads = (hotel.uploadedFiles as unknown[]) ?? [];
  const entry = {
    id: randomBytes(8).toString("hex"),
    storedName: stored,
    originalName: file.name,
    createdAt: new Date().toISOString(),
  };
  uploads.push(entry);

  await prisma.hotel.update({
    where: { id },
    data: { uploadedFiles: uploads as object },
  });

  const publicPath = `/api/hotels/${id}/files/${encodeURIComponent(stored)}?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ entry, url: publicPath });
}
