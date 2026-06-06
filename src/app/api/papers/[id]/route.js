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
    select: {
      id: true, title: true, fileName: true, size: true, pages: true, level: true,
      tags: true, field: true, method: true, year: true, createdAt: true, updatedAt: true,
    },
  });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ paper });
}

// Update mutable metadata (level / title / tags / cached fields).
export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.paper.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data = {};
  if (typeof body.level === "string") data.level = body.level;
  if (typeof body.title === "string") data.title = body.title.slice(0, 200);
  if (Array.isArray(body.tags)) data.tags = body.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12);
  if (typeof body.field === "string") data.field = body.field.slice(0, 80) || null;
  if (typeof body.method === "string") data.method = body.method.slice(0, 80) || null;
  if (body.year === null || typeof body.year === "number") data.year = Number.isFinite(body.year) ? Math.trunc(body.year) : null;
  if (typeof body.textCache === "string") data.textCache = body.textCache.slice(0, 200_000);

  const updated = await prisma.paper.update({
    where: { id: params.id },
    data,
    select: { id: true, tags: true, field: true, method: true, year: true, level: true, title: true },
  });
  return NextResponse.json({ paper: updated });
}

export async function DELETE(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.paper.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.paper.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
