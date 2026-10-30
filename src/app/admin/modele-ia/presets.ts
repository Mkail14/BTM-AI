import type { AIProviderName } from "@/lib/ai/config";

/** Fournisseurs proposés à l'ajout d'une API ; « Autre » laisse saisir l'adresse. */
export type ApiPreset = {
  id: string;
  label: string;
  provider: AIProviderName;
  baseUrl: string;
  modelPlaceholder: string;
  keyUrl?: string;
  /** Proposés en premier quand la clé y donne accès (vérifiés le 29/10/2026). */
  suggested?: string[];
  /** Début des clés de ce fournisseur : la clé collée suffit à le reconnaître. */
  keyPrefixes?: string[];
};

export const API_PRESETS: ApiPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "google/gemma-4-31b-it:free",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyPrefixes: ["sk-or-"],
    suggested: ["anthropic/claude-haiku-5.5", "openai/gpt-5.6-luna", "google/gemini-3.5-flash-lite", "google/gemma-4-31b-it:free"],
  },
  {
    id: "groq",
    label: "Groq",
    provider: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    keyPrefixes: ["gsk_"],
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
    modelPlaceholder: "gpt-5.4-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    // Les anciennes clés « sk-… » ressemblent à celles de DeepSeek : non reconnues.
    keyPrefixes: ["sk-proj-", "sk-svcacct-"],
    suggested: ["gpt-5.4-mini", "gpt-5.5", "gpt-4.1-mini"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    provider: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelPlaceholder: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    // « AIza… » : anciennes clés ; « AQ. » : nouveau format de Google AI Studio.
    keyPrefixes: ["AIza", "AQ."],
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
    keyPrefixes: ["sk-ant-"],
    suggested: ["claude-haiku-5-5", "claude-sonnet-5-5"],
  },
  {
    id: "other",
    label: "Autre (compatible OpenAI)",
    provider: "openai-compatible",
    baseUrl: "",
    modelPlaceholder: "nom-du-modele",
  },
];

/** Fournisseur reconnu au début de la clé, sinon undefined. */
export function detectPreset(apiKey: string): ApiPreset | undefined {
  const key = apiKey.trim();
  return API_PRESETS.find((p) => p.keyPrefixes?.some((prefix) => key.startsWith(prefix)));
}

export const API_LIMITS = { label: 60, model: 200, baseUrl: 300, apiKey: 500 } as const;
