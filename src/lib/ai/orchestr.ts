import type { ChatTurn } from "@/lib/chat/types";

/**
 * Orchestr AI (route /api/orchestr) : pas de quota ni de plafond par message.
 * Il ne reste que ce que la technique impose : la taille d'une requête chez
 * Vercel (4,5 Mo) et un budget de contexte pour que chaque réponse reste rapide.
 */
export const ORCHESTR_LIMITS = {
  bodyChars: 4_000_000,
  /** Historique transmis au modèle : les échanges les plus récents, jusqu'à ce total. */
  contextChars: 400_000,
} as const;

/**
 * Alternance stricte attendue par les modèles : messages consécutifs du même
 * côté réunis, début et fin côté patron, échanges les plus récents d'abord.
 */
export function toOrchestrTurns(messages: readonly ChatTurn[], budget: number = ORCHESTR_LIMITS.contextChars): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const last = turns.at(-1);
    if (last?.role === m.role) last.content += `\n\n${m.content}`;
    else turns.push({ ...m });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  while (turns.at(-1)?.role === "assistant") turns.pop();
  let total = 0;
  let start = turns.length;
  while (start > 0 && total + turns[start - 1].content.length <= budget) {
    total += turns[--start].content.length;
  }
  // Dernier message plus long que le budget à lui seul : gardé, coupé à sa fin.
  if (start === turns.length && turns.length > 0) {
    const last = turns[turns.length - 1];
    return [{ ...last, content: last.content.slice(-budget) }];
  }
  while (turns[start]?.role === "assistant") start++;
  return turns.slice(start);
}
