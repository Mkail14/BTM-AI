import "server-only";
import type { AIProvider } from "./types";

/** Appel court et non diffusé (tâches de fond : mémoire, leçons) ; renvoie tout le texte. */
export async function completeText(
  provider: AIProvider,
  { system, content, maxOutputTokens = 1000, timeoutMs = 30_000 }: { system: string; content: string; maxOutputTokens?: number; timeoutMs?: number },
): Promise<string> {
  let output = "";
  for await (const chunk of provider.stream({
    system,
    messages: [{ role: "user", content }],
    maxOutputTokens,
    signal: AbortSignal.timeout(timeoutMs),
  })) {
    if (chunk.type === "text") output += chunk.text;
  }
  return output;
}
