import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaStream } from "@/lib/ollama";
import { levelById } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

// Streamed conversational Q&A about a paper. The client sends the extracted
// paper text as `context` plus the running message history.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ollamaKeyEnc) {
    return NextResponse.json({ error: "No Ollama API key set. Add one in Settings." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : [];
  const context = typeof body.context === "string" ? body.context : "";
  if (history.length === 0) {
    return NextResponse.json({ error: "No message to send." }, { status: 400 });
  }

  const lvl = levelById(body.level);
  const system =
    lvl.sys +
    " You are a research assistant answering questions about the paper below. Ground every answer in the paper; if something isn't covered, say so plainly. Use markdown, and LaTeX ($...$ or $$...$$) for any math.\n\n=== PAPER TEXT ===\n" +
    context.slice(0, 12000);

  const trimmed = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : user.ollamaModel;

  let apiKey;
  try {
    apiKey = decrypt(user.ollamaKeyEnc);
  } catch {
    return NextResponse.json({ error: "Stored key could not be decrypted. Re-save it in Settings." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const it = await ollamaStream({
          host: user.ollamaHost,
          apiKey,
          model,
          messages: [{ role: "system", content: system }, ...trimmed],
          maxTokens: 1200,
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
