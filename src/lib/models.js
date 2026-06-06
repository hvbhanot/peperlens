// Cloud models available on Ollama Cloud (Pro). Safe to import on the client —
// the list is static and contains no secrets.

export const CLOUD_MODELS = [
  { id: "gpt-oss:120b-cloud", label: "gpt-oss (120B)" },
  { id: "kimi-k2:1t-cloud", label: "Kimi K2 (1T)" },
  { id: "deepseek-v3.1:671b-cloud", label: "DeepSeek V3.1 (671B)" },
  { id: "qwen3-coder:480b-cloud", label: "Qwen3-Coder (480B)" },
  { id: "llama3.3:70b-cloud", label: "Llama 3.3 (70B)" },
  { id: "gemini-2.5-flash-cloud", label: "Gemini 2.5 Flash" },
];

export const DEFAULT_MODEL = CLOUD_MODELS[0].id;
export const DEFAULT_HOST = "https://ollama.com";
