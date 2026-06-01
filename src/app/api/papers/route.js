import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_PAPERS = 5;

// List the current user's saved papers (metadata only — no PDF bytes).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const papers = await prisma.paper.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, fileName: true, size: true, pages: true, level: true, createdAt: true },
  });

  return NextResponse.json({ papers, max: MAX_PAPERS });
}

// Upload a new PDF (multipart/form-data). Enforces the 5-paper-per-user cap.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await prisma.paper.count({ where: { userId: user.id } });
  if (count >= MAX_PAPERS) {
    return NextResponse.json(
      { error: `You can save at most ${MAX_PAPERS} papers. Delete one to add another.` },
      { status: 409 }
    );
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 415 });
  }

  const maxMb = Number(process.env.MAX_PDF_MB || 8);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `PDF exceeds the ${maxMb} MB limit.` }, { status: 413 });
  }

  const title = String(form.get("title") || file.name || "Untitled").slice(0, 200);
  const pages = Number(form.get("pages") || 0) || 0;
  const level = form.get("level") ? String(form.get("level")) : null;

  const paper = await prisma.paper.create({
    data: {
      userId: user.id,
      title,
      fileName: String(file.name || "paper.pdf").slice(0, 200),
      data: buf,
      size: buf.length,
      pages,
      level,
    },
    select: { id: true, title: true, fileName: true, size: true, pages: true, level: true, createdAt: true },
  });

  return NextResponse.json({ paper }, { status: 201 });
}
