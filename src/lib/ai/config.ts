export const AI_PROVIDERS = ["anthropic", "openai-compatible"] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AIEffort = (typeof AI_EFFORTS)[number];

export type AIConfig = {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  baseUrl: string | undefined;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Niveau d'effort (fournisseur anthropic uniquement). */
  effort: AIEffort;
  /**
   * openai-compatible uniquement : envoie `reasoning: { enabled: false }`
   * (format OpenRouter) pour couper la réflexion des modèles qui en ont une.
   */
  disableReasoning: boolean;
};

export type AIConfigResult =
  | { ok: true; config: AIConfig }
  | { ok: false; reason: string };

const DEFAULT_MODELS: Partial<Record<AIProviderName, string>> = {
  anthropic: "claude-opus-5-5",
};

function readInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Nombre maximal d'API : AI_* (principale) puis AI_2_* … AI_5_* (secours). */
export const MAX_AI_SLOTS = 5;

export const slotPrefix = (slot: number) => (slot === 1 ? "AI_" : `AI_${slot}_`);

/**
 * Lit la configuration du fournisseur d'IA depuis l'environnement serveur.
 * Aucune de ces variables ne doit être préfixée par NEXT_PUBLIC_.
 *
 * Avec un préfixe de secours (AI_2_…), chaque variable absente reprend la
 * valeur de l'API principale, sauf la clé ; si le fournisseur change, le
 * modèle et l'adresse ne sont pas repris.
 */
export function readAIConfig(env: Record<string, string | undefined> = process.env, prefix = "AI_"): AIConfigResult {
  const own = (name: string) => env[`${prefix}${name}`]?.trim() || undefined;
  const inherited = (name: string) => own(name) ?? (env[`AI_${name}`]?.trim() || undefined);
  const switchesProvider = prefix !== "AI_" && own("PROVIDER") !== undefined;
  const identity = (name: string) => (switchesProvider ? own(name) : inherited(name));

  const provider = (inherited("PROVIDER") ?? "anthropic") as AIProviderName;
  if (!AI_PROVIDERS.includes(provider)) {
    return { ok: false, reason: `${prefix}PROVIDER inconnu : « ${provider} ».` };
  }

  const apiKey = own("API_KEY");
  if (!apiKey) return { ok: false, reason: `${prefix}API_KEY n'est pas définie.` };

  const model = identity("MODEL") || DEFAULT_MODELS[provider];
  if (!model) return { ok: false, reason: `${prefix}MODEL n'est pas définie.` };

  const baseUrl = identity("BASE_URL");
  if (provider === "openai-compatible" && !baseUrl) {
    return { ok: false, reason: `${prefix}BASE_URL est requise pour le fournisseur openai-compatible.` };
  }

  const effortValue = (inherited("EFFORT") ?? "low") as AIEffort;
  const effort = AI_EFFORTS.includes(effortValue) ? effortValue : "low";

  return {
    ok: true,
    config: {
      provider,
      apiKey,
      model,
      baseUrl,
      maxOutputTokens: readInt(inherited("MAX_OUTPUT_TOKENS"), 4096, 256, 32_000),
      timeoutMs: readInt(inherited("TIMEOUT_MS"), 60_000, 5_000, 300_000),
      effort,
      disableReasoning: inherited("DISABLE_REASONING")?.toLowerCase() === "true",
    },
  };
}

export type AISlot = {
  /** Identifiant stable : « env-2 » (variables AI_2_*) ou « db-<uuid> » (ajoutée depuis /admin). */
  id: string;
  /** env : variables du serveur, non modifiables depuis l'admin ; db : table ai_providers. */
  source: "env" | "db";
  /** 1 = API principale, 2… = secours, essayées dans l'ordre. */
  slot: number;
  /** Préfixe des variables (API de source env), sinon chaîne vide. */
  prefix: string;
  /** Nom affiché (AI_n_LABEL, sinon déduit du fournisseur). */
  label: string;
  result: AIConfigResult;
};

const KNOWN_HOSTS: [RegExp, string][] = [
  [/openrouter\.ai/, "OpenRouter"],
  [/api\.openai\.com/, "OpenAI"],
  [/api\.mistral\.ai/, "Mistral"],
  [/api\.groq\.com/, "Groq"],
  [/api\.deepseek\.com/, "DeepSeek"],
  [/generativelanguage\.googleapis\.com/, "Google Gemini"],
  [/api\.together\.(xyz|ai)/, "Together"],
  [/localhost|127\.0\.0\.1/, "Serveur local"],
];

export function providerLabel(config: Pick<AIConfig, "provider" | "baseUrl">): string {
  if (config.provider === "anthropic") return "Anthropic";
  const url = config.baseUrl ?? "";
  for (const [pattern, label] of KNOWN_HOSTS) if (pattern.test(url)) return label;
  try {
    return new URL(url).hostname;
  } catch {
    return "API compatible OpenAI";
  }
}

/**
 * Chaîne des API déclarées : la principale (toujours présente, même mal
 * configurée) puis chaque emplacement de secours dont une variable existe.
 */
export function readAIChain(env: Record<string, string | undefined> = process.env): AISlot[] {
  const slots: AISlot[] = [];
  for (let slot = 1; slot <= MAX_AI_SLOTS; slot++) {
    const prefix = slotPrefix(slot);
    const declared = slot === 1 || ["PROVIDER", "API_KEY", "MODEL", "BASE_URL"].some((n) => env[`${prefix}${n}`]?.trim());
    if (!declared) continue;
    const result = readAIConfig(env, prefix);
    const custom = env[`${prefix}LABEL`]?.trim();
    slots.push({
      id: `env-${slot}`,
      source: "env",
      slot,
      prefix,
      label: custom || (result.ok ? providerLabel(result.config) : `API ${slot}`),
      result,
    });
  }
  return slots;
}
