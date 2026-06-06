import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaChat } from "@/lib/ollama";
import { buildPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generate (or re-generate) AI tags + field/method/year for a paper.
export async function POST(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ollamaKeyEnc) return NextResponse.json({ error: "No Ollama API key set." }, { status: 400 });

  const paper = await prisma.paper.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, textCache: true, title: true },
  });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!paper.textCache) return NextResponse.json({ error: "Paper text not cached yet." }, { status: 400 });

  let apiKey;
  try { apiKey = decrypt(user.ollamaKeyEnc); } catch { return NextResponse.json({ error: "Stored key could not be decrypted." }, { status: 500 }); }

  const prompt = buildPrompt("auto_tag", "grad", paper.textCache, paper.title);
  let raw;
  try {
    raw = await ollamaChat({
      host: user.ollamaHost, apiKey, model: user.ollamaModel,
      system: prompt.system, user: prompt.user, maxTokens: prompt.max, temperature: 0.1,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }

  // Robust JSON parse: strip fences, find first {...} block.
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  let parsed = { tags: [], field: null, method: null, year: null };
  try { parsed = JSON.parse(slice); } catch {/* keep defaults */}
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8) : [];
  const field = typeof parsed.field === "string" ? parsed.field.slice(0, 80) : null;
  const method = typeof parsed.method === "string" ? parsed.method.slice(0, 80) : null;
  const year = Number.isFinite(parsed.year) ? Math.trunc(parsed.year) : null;

  const updated = await prisma.paper.update({
    where: { id: paper.id },
    data: { tags, field, method, year },
    select: { id: true, tags: true, field: true, method: true, year: true },
  });
  return NextResponse.json({ paper: updated });
}
