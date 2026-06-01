import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// Metadata for one paper (no PDF bytes).
export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paper = await prisma.paper.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, title: true, fileName: true, size: true, pages: true, level: true, createdAt: true },
  });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ paper });
}

// Update mutable metadata (currently just the comprehension level).
export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.paper.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data = {};
  if (typeof body.level === "string") data.level = body.level;
  if (typeof body.title === "string") data.title = body.title.slice(0, 200);

  await prisma.paper.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.paper.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.paper.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
