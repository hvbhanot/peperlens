import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaChatMessages } from "@/lib/ollama";
import { levelById } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Conversational Q&A about a paper. The client sends the extracted paper text
// as `context` plus the running message history; the key is decrypted here.
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
    " You are a research assistant answering questions about the paper below. Ground every answer in the paper; if something isn't covered, say so plainly. Use markdown.\n\n=== PAPER TEXT ===\n" +
    context.slice(0, 12000);

  // Keep only the last several turns to bound the prompt size.
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

  try {
    const content = await ollamaChatMessages({
      host: user.ollamaHost,
      apiKey,
      model,
      messages: [{ role: "system", content: system }, ...trimmed],
      maxTokens: 1200,
    });
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: `Ollama request failed: ${String(e.message || e).slice(0, 300)}` },
      { status: 502 }
    );
  }
}
