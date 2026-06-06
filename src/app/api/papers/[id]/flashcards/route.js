import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaChat } from "@/lib/ollama";
import { buildPrompt, levelById } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

async function assertOwned(user, paperId) {
  const owned = await prisma.paper.findFirst({ where: { id: paperId, userId: user.id }, select: { id: true } });
  return Boolean(owned);
}

// Parse a markdown "### Q" / "> A" flashcard list into rows. Tolerant of
// extra whitespace, missing "> " prefix on answers, and `Q:` / `A:` shorthand.
function parseFlashcards(md) {
  const lines = md.split("\n");
  const cards = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) {
      if (current) cards.push(current);
      current = { question: line.replace(/^###\s+/, "").trim(), answer: "" };
    } else if (current) {
      const m = line.match(/^>\s*(.*)$/);
      if (m) {
        current.answer = (current.answer ? current.answer + " " : "") + m[1].trim();
      } else if (line.trim()) {
        current.answer = (current.answer ? current.answer + " " : "") + line.trim();
      }
    }
  }
  if (current) cards.push(current);
  return cards.filter((c) => c.question && c.answer).slice(0, 40);
}

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cards = await prisma.flashcard.findMany({
    where: { paperId: params.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, answer: true, mastery: true, lastSeen: true, createdAt: true },
  });
  return NextResponse.json({ cards });
}

// Generate (or regenerate) flashcards for a paper and persist them.
export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.ollamaKeyEnc) return NextResponse.json({ error: "No Ollama API key set." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const paper = await prisma.paper.findFirst({
    where: { id: params.id, userId: user.id },
    select: { textCache: true, title: true },
  });
  if (!paper?.textCache) return NextResponse.json({ error: "Paper text not cached yet — open the paper first." }, { status: 400 });

  let apiKey;
  try { apiKey = decrypt(user.ollamaKeyEnc); } catch { return NextResponse.json({ error: "Stored key could not be decrypted." }, { status: 500 }); }

  const lvl = levelById(body.level || "undergrad");
  const count = Math.min(24, Math.max(4, Number(body.count) || 12));
  const prompt = buildPrompt("flashcards", body.level || "undergrad", paper.textCache, paper.title, { count });

  let md;
  try {
    md = await ollamaChat({
      host: user.ollamaHost, apiKey, model: body.model || user.ollamaModel,
      system: prompt.system, user: prompt.user, maxTokens: prompt.max, temperature: 0.3,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }

  const cards = parseFlashcards(md);
  if (!cards.length) return NextResponse.json({ error: "Model did not return any flashcards.", raw: md }, { status: 502 });

  // Replace any existing cards atomically.
  await prisma.$transaction([
    prisma.flashcard.deleteMany({ where: { paperId: params.id } }),
    prisma.flashcard.createMany({
      data: cards.map((c) => ({ paperId: params.id, question: c.question.slice(0, 400), answer: c.answer.slice(0, 1000) })),
    }),
  ]);

  const all = await prisma.flashcard.findMany({
    where: { paperId: params.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, answer: true, mastery: true, lastSeen: true, createdAt: true },
  });
  return NextResponse.json({ cards: all });
}

// Update one card's mastery (used by the spaced-repetition trainer).
export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertOwned(user, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const mastery = Number.isFinite(body.mastery) ? Math.max(0, Math.min(1, body.mastery)) : null;
  if (mastery === null) return NextResponse.json({ error: "Bad mastery." }, { status: 400 });

  await prisma.flashcard.update({
    where: { id: body.id },
    data: { mastery, lastSeen: new Date() },
  });
  return NextResponse.json({ ok: true });
}
