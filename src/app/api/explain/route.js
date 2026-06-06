import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaStream } from "@/lib/ollama";
import { buildPrompt } from "@/lib/prompts";
import { getCachedAnalysis, saveAnalysis } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

// Server-side Ollama proxy, streamed. The client sends the analysis type, level
// and extracted paper text; the user's API key is decrypted here and streamed
// back as plain-text deltas. Pre-stream failures are returned as JSON.
//
// If `cache=1` is passed and the same `(which, opts)` analysis has been
// generated before for this paper, the cached body is returned immediately
// without spending tokens. The result is then re-saved on a fresh generation.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ollamaKeyEnc) {
    return NextResponse.json({ error: "No Ollama API key set. Add one in Settings." }, { status: 400 });
  }

  const url = new URL(req.url);
  const wantCache = url.searchParams.get("cache") === "1";
  const paperId = url.searchParams.get("paperId") || null;

  const body = await req.json().catch(() => ({}));
  const { which, level, text, fileName } = body;
  if (!which || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing analysis type or paper text." }, { status: 400 });
  }

  let prompt;
  try {
    const opts = {
      request: body.request,
      mode: body.mode,
      difficulty: body.difficulty,
      count: body.count,
    };
    prompt = buildPrompt(which, level, text, fileName, opts);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : user.ollamaModel;

  // JSON-only analyses (auto_tag) are not streamed and not cached.
  const isJson = prompt.json === true;

  // Cache lookup.
  if (wantCache && paperId && !isJson) {
    const cached = await getCachedAnalysis(paperId, which, {
      request: body.request, mode: body.mode, difficulty: body.difficulty, count: body.count,
    });
    if (cached) {
      return new Response(cached, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-PaperLens-Cache": "hit" },
      });
    }
  }

  let apiKey;
  try {
    apiKey = decrypt(user.ollamaKeyEnc);
  } catch {
    return NextResponse.json({ error: "Stored key could not be decrypted. Re-save it in Settings." }, { status: 500 });
  }

  // JSON path: call once, parse, persist nothing.
  if (isJson) {
    try {
      const { ollamaChat } = await import("@/lib/ollama");
      const raw = await ollamaChat({
        host: user.ollamaHost, apiKey, model,
        system: prompt.system, user: prompt.user, maxTokens: prompt.max, temperature: 0.1,
      });
      const trimmed = raw.trim();
      // Try to extract a JSON object even if the model wrapped it in prose.
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
      let parsed = null;
      try { parsed = JSON.parse(slice); } catch { parsed = { raw: trimmed }; }
      return NextResponse.json(parsed);
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
    }
  }

  const messages = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  const encoder = new TextEncoder();
  let accumulated = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const it = await ollamaStream({ host: user.ollamaHost, apiKey, model, messages, maxTokens: prompt.max });
        for await (const part of it) {
          const t = part?.message?.content || "";
          if (t) {
            accumulated += t;
            controller.enqueue(encoder.encode(t));
          }
        }
        // Persist to cache once generation is complete.
        if (wantCache && paperId && accumulated) {
          try {
            await saveAnalysis(paperId, which, {
              request: body.request, mode: body.mode, difficulty: body.difficulty, count: body.count,
            }, accumulated);
          } catch {/* cache write failure is non-fatal */}
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
