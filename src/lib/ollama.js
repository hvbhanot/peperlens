import { Ollama } from "ollama";
import { CLOUD_MODELS, DEFAULT_MODEL, DEFAULT_HOST } from "@/lib/models";

export { CLOUD_MODELS, DEFAULT_MODEL, DEFAULT_HOST };

function makeClient(host, apiKey) {
  return new Ollama({
    host: host || DEFAULT_HOST,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// Non-streaming chat via the official Ollama JS SDK. The API key is passed as a
// Bearer header (Ollama Cloud auth) and is never persisted by this function.
export async function ollamaChat({ host, apiKey, model, system, user, maxTokens = 1400, temperature = 0.3 }) {
  if (!apiKey) throw new Error("Missing Ollama API key.");

  const client = makeClient(host, apiKey);
  const res = await client.chat({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    options: { temperature, num_predict: maxTokens },
  });

  return res?.message?.content ?? "";
}

// Streaming chat. Returns an async iterator of response parts; each part has
// part.message.content. Caller pipes the deltas to an HTTP ReadableStream.
export async function ollamaStream({ host, apiKey, model, messages, maxTokens = 1400, temperature = 0.3 }) {
  if (!apiKey) throw new Error("Missing Ollama API key.");
  const client = makeClient(host, apiKey);
  return client.chat({
    model,
    messages,
    stream: true,
    options: { temperature, num_predict: maxTokens },
  });
}

// Multi-turn chat: caller supplies the full messages array (system + history).
export async function ollamaChatMessages({ host, apiKey, model, messages, maxTokens = 1200, temperature = 0.4 }) {
  if (!apiKey) throw new Error("Missing Ollama API key.");

  const client = makeClient(host, apiKey);
  const res = await client.chat({
    model,
    messages,
    stream: false,
    options: { temperature, num_predict: maxTokens },
  });

  return res?.message?.content ?? "";
}

// Generate vector embeddings for a piece of text. We use the Ollama embeddings
// endpoint. The vector is returned as a plain JS array of numbers.
export async function ollamaEmbed({ host, apiKey, model, prompt }) {
  if (!apiKey) throw new Error("Missing Ollama API key.");
  const client = makeClient(host, apiKey);
  const res = await client.embeddings({ model, prompt });
  return res?.embedding || [];
}

// Lightweight cosine similarity (vectors need not be normalized).
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
