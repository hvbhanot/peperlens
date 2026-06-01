import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaStream } from "@/lib/ollama";
import { buildPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

// Server-side Ollama proxy, streamed. The client sends the analysis type, level
// and extracted paper text; the user's API key is decrypted here and streamed
// back as plain-text deltas. Pre-stream failures are returned as JSON.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ollamaKeyEnc) {
    return NextResponse.json({ error: "No Ollama API key set. Add one in Settings." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { which, level, text, fileName } = body;
  if (!which || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing analysis type or paper text." }, { status: 400 });
  }

  let prompt;
  try {
    prompt = buildPrompt(which, level, text, fileName, { request: body.request });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : user.ollamaModel;

  let apiKey;
  try {
    apiKey = decrypt(user.ollamaKeyEnc);
  } catch {
    return NextResponse.json({ error: "Stored key could not be decrypted. Re-save it in Settings." }, { status: 500 });
  }

  const messages = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const it = await ollamaStream({ host: user.ollamaHost, apiKey, model, messages, maxTokens: prompt.max });
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
