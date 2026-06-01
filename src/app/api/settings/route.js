import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { CLOUD_MODELS, DEFAULT_HOST } from "@/lib/ollama";

export const runtime = "nodejs";

// Returns settings WITHOUT the plaintext key — only whether one is set.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    hasKey: Boolean(user.ollamaKeyEnc),
    model: user.ollamaModel,
    host: user.ollamaHost,
    models: CLOUD_MODELS,
  });
}

export async function PUT(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data = {};

  // Only re-encrypt when a non-empty key is supplied; an empty string clears it.
  if (typeof body.apiKey === "string") {
    const k = body.apiKey.trim();
    if (k === "") {
      data.ollamaKeyEnc = null;
    } else {
      data.ollamaKeyEnc = encrypt(k);
    }
  }

  if (typeof body.model === "string") {
    if (!CLOUD_MODELS.some((m) => m.id === body.model)) {
      return NextResponse.json({ error: "Unknown model." }, { status: 400 });
    }
    data.ollamaModel = body.model;
  }

  if (typeof body.host === "string" && body.host.trim()) {
    try {
      // Validate it's a real URL before storing.
      // eslint-disable-next-line no-new
      new URL(body.host.trim());
      data.ollamaHost = body.host.trim();
    } catch {
      return NextResponse.json({ error: "Host must be a valid URL." }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({
    hasKey: Boolean(updated.ollamaKeyEnc),
    model: updated.ollamaModel,
    host: updated.ollamaHost || DEFAULT_HOST,
  });
}
