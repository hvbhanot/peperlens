import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

async function assertOwned(user, paperId) {
  const owned = await prisma.paper.findFirst({ where: { id: paperId, userId: user.id }, select: { id: true } });
  return Boolean(owned);
}

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.note.findMany({
    where: { paperId: params.id },
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
    select: { id: true, body: true, page: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ notes });
}

export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim();
  if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
  const page = Number.isFinite(body.page) ? Math.max(0, Math.trunc(body.page)) : null;

  const note = await prisma.note.create({
    data: { paperId: params.id, body: text.slice(0, 4000), page },
    select: { id: true, body: true, page: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ note }, { status: 201 });
}

export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data = {};
  if (typeof body.body === "string") data.body = body.body.slice(0, 4000);
  if (body.page === null || Number.isFinite(body.page)) data.page = Number.isFinite(body.page) ? Math.max(0, Math.trunc(body.page)) : null;

  const note = await prisma.note.update({
    where: { id: body.id },
    data,
    select: { id: true, body: true, page: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ note });
}

export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.note.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
