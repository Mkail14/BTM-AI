import type { ChatTurn } from "./types";

/**
 * Construit un historique valide pour le modèle :
 * - uniquement des paires question/réponse (une question sans réponse, ou
 *   suivie d'une réponse vide, est écartée) ;
 * - alternance stricte user → assistant ;
 * - on garde les échanges les plus récents dans la limite de `maxChars`.
 */
export function buildModelHistory(messages: readonly ChatTurn[], maxChars: number): ChatTurn[] {
  const pairs: [ChatTurn, ChatTurn][] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];
    if (
      current.role === "user" &&
      current.content.trim() &&
      next.role === "assistant" &&
      next.content.trim()
    ) {
      pairs.push([current, next]);
      i++;
    }
  }

  const kept: ChatTurn[] = [];
  let total = 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [question, answer] = pairs[i];
    const size = question.content.length + answer.content.length;
    if (total + size > maxChars) break;
    total += size;
    kept.unshift(
      { role: "user", content: question.content },
      { role: "assistant", content: answer.content },
    );
  }

  return kept;
}

/** Titre de conversation dérivé du premier message (pas d'appel IA supplémentaire). */
export function deriveTitle(firstMessage: string, maxChars: number): string {
  const singleLine = firstMessage.replace(/\s+/g, " ").trim();
  if (!singleLine) return "Nouvelle conversation";
  if (singleLine.length <= maxChars) return singleLine;
  return `${singleLine.slice(0, maxChars - 1).trimEnd()}…`;
}
