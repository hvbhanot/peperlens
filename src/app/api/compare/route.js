import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaStream } from "@/lib/ollama";
import { levelById } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ollamaKeyEnc) return NextResponse.json({ error: "No Ollama API key set." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 4) : [];
  const focus = String(body.focus || "").trim();
  if (ids.length < 2) return NextResponse.json({ error: "Pick at least 2 papers to compare." }, { status: 400 });

  const papers = await prisma.paper.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true, title: true, textCache: true, field: true, method: true, year: true },
  });
  if (papers.length !== ids.length) return NextResponse.json({ error: "One or more papers not found." }, { status: 404 });

  const lvl = levelById(body.level);
  const focusLine = focus ? `\n\nFocus the comparison specifically on: "${focus}".` : "";
  const blocks = papers.map((p, i) => `### Paper ${i + 1}: ${p.title}\n${(p.textCache || "").slice(0, 4500)}`).join("\n\n---\n\n");
  const system = lvl.sys + ` You compare multiple research papers. Use a markdown table when comparing specific attributes. Be concrete; do not invent numbers.${focusLine}`;
  const userPrompt = `Compare the papers below. Structure the response as:
## Summary
One paragraph situating the papers relative to each other.

## Side-by-side
A markdown table with these columns: Paper | Year | Problem | Method | Headline Result | Strength | Weakness

## How they relate
Bullets on shared assumptions, dependencies, and disagreements.

## Takeaway
2–3 sentences: which paper to read first and why.

PAPERS:

${blocks}`;

  let apiKey;
  try { apiKey = decrypt(user.ollamaKeyEnc); } catch { return NextResponse.json({ error: "Stored key could not be decrypted." }, { status: 500 }); }

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : user.ollamaModel;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const it = await ollamaStream({
          host: user.ollamaHost, apiKey, model,
          messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
          maxTokens: 1800,
        });
        for await (const part of it) {
          const t = part?.message?.content || "";
          if (t) controller.enqueue(encoder.encode(t));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n⚠️ Ollama request failed: ${String(e.message || e).slice(0, 300)}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
