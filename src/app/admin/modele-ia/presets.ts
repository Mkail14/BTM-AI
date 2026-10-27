import type { AIProviderName } from "@/lib/ai/config";

/** Fournisseurs proposés à l'ajout d'une API ; « Autre » laisse saisir l'adresse. */
export type ApiPreset = {
  id: string;
  label: string;
  provider: AIProviderName;
  baseUrl: string;
  modelPlaceholder: string;
  keyUrl?: string;
};

export const API_PRESETS: ApiPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "meta-llama/llama-3.3-70b-instruct:free",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "groq",
    label: "Groq",
    provider: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    provider: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    modelPlaceholder: "mistral-large-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4.1-mini",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    provider: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelPlaceholder: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    modelPlaceholder: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    provider: "anthropic",
    baseUrl: "",
    modelPlaceholder: "claude-haiku-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "other",
    label: "Autre (compatible OpenAI)",
    provider: "openai-compatible",
    baseUrl: "",
    modelPlaceholder: "nom-du-modele",
  },
];

export const API_LIMITS = { label: 60, model: 200, baseUrl: 300, apiKey: 500 } as const;
