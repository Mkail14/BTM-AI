import "server-only";
import type { AIProvider } from "@/lib/ai/types";

/** Appel court et non diffusé (tâches de fond : mémoire, leçons) ; renvoie tout le texte. */
export async function completeText(
  provider: AIProvider,
  {
    system,
    content,
    maxOutputTokens = 1000,
    timeoutMs = 30_000,
    model,
    deep,
  }: {
    system: string;
    content: string;
    maxOutputTokens?: number;
    timeoutMs?: number;
    /** Autre modèle Gemini pour cette tâche (ignoré par les autres fournisseurs). */
    model?: string;
    /** Réflexion approfondie avant de répondre. */
    deep?: boolean;
  },
): Promise<string> {
  let output = "";
  for await (const chunk of provider.stream({
    system,
    messages: [{ role: "user", content }],
    maxOutputTokens,
    signal: AbortSignal.timeout(timeoutMs),
    ...(model ? { model } : {}),
    ...(deep ? { deep } : {}),
  })) {
    if (chunk.type === "text") output += chunk.text;
  }
  return output;
}
