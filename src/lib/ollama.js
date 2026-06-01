import { Ollama } from "ollama";

// Cloud models available on Ollama Cloud (Pro). Shared with the client so the
// model dropdown and the server stay in sync.
export const CLOUD_MODELS = [
  { id: "gpt-oss:120b-cloud", label: "gpt-oss (120B)" },
  { id: "kimi-k2:1t-cloud", label: "Kimi K2 (1T)" },
  { id: "deepseek-v3.1:671b-cloud", label: "DeepSeek V3.1 (671B)" },
  { id: "qwen3-coder:480b-cloud", label: "Qwen3-Coder (480B)" },
];

export const DEFAULT_MODEL = CLOUD_MODELS[0].id;
export const DEFAULT_HOST = "https://ollama.com";

// Non-streaming chat via the official Ollama JS SDK. The API key is passed as a
// Bearer header (Ollama Cloud auth) and is never persisted by this function.
export async function ollamaChat({ host, apiKey, model, system, user, maxTokens = 1400 }) {
  if (!apiKey) throw new Error("Missing Ollama API key.");

  const client = new Ollama({
    host: host || DEFAULT_HOST,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const res = await client.chat({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    options: {
      temperature: 0.3,
      num_predict: maxTokens,
    },
  });

  return res?.message?.content ?? "";
}
