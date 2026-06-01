import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { ollamaChat, CLOUD_MODELS } from "@/lib/ollama";
import { buildPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Server-side Ollama proxy. The client sends the analysis type, level and the
// extracted paper text; the user's API key is decrypted here and never reaches
// the browser.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.ollamaKeyEnc) {
    return NextResponse.json(
      { error: "No Ollama API key set. Add one in Settings." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { which, level, text, fileName } = body;

  if (!which || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing analysis type or paper text." }, { status: 400 });
  }

  let prompt;
  try {
    prompt = buildPrompt(which, level, text, fileName);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }

  // Allow the client to request a specific model, else fall back to the saved one.
  const model =
    typeof body.model === "string" && CLOUD_MODELS.some((m) => m.id === body.model)
      ? body.model
      : user.ollamaModel;

  let apiKey;
  try {
    apiKey = decrypt(user.ollamaKeyEnc);
  } catch {
    return NextResponse.json(
      { error: "Stored key could not be decrypted. Re-save it in Settings." },
      { status: 500 }
    );
  }

  try {
    const content = await ollamaChat({
      host: user.ollamaHost,
      apiKey,
      model,
      system: prompt.system,
      user: prompt.user,
      maxTokens: prompt.max,
    });
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: `Ollama request failed: ${String(e.message || e).slice(0, 300)}` },
      { status: 502 }
    );
  }
}
