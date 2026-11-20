/**
 * Doutes de Tamilya : après avoir parlé shimaoré, elle relit sa phrase et
 * signale ce dont elle n'est pas sûre. Même code pour le chat et la voix.
 */
import { shimaoreEntryKey } from "./teaching";

export const MAX_DOUBTS = 2;

export type Doubt = { phrase: string; french: string; question: string };

export const DOUBT_PROMPT = `Tu es Tamilya et tu relis ce que tu viens de dire en shimaoré (langue de Mayotte) à ton maître.
Repère au plus ${MAX_DOUBTS} passages dont tu n'es PAS sûre : un mot que tu as deviné, un ordre des mots incertain, une règle que tu ne connais pas.
Ne signale rien de ce qui est dans les règles ou le vocabulaire qu'on te donne.
Réponds uniquement par un tableau JSON : [{"phrase": "passage shimaoré tel que tu l'as dit", "french": "ce que tu voulais dire", "question": "ta question courte à ton maître"}].
Réponds [] si tu es sûre de tout ou s'il n'y a pas de shimaoré.`;

/**
 * Le maître ne doit pas être resollicité pour ce qu'il a déjà validé : un doute
 * dont la phrase est, telle quelle, un mot ou une phrase validés est écarté
 * (« Wawé hiriwa m'banni ? » était redemandé le 2026-11-20). Comparaison sans
 * majuscules, accents ni ponctuation. Un morceau de phrase validée reste posé :
 * « Noh védza » (dans « Noh védza unwa ») cache une vraie question (noh ou nisi ?).
 * `validated` : le shimaoré des mots et des phrases validés.
 */
export function keepRealDoubts(doubts: readonly Doubt[], validated: readonly string[]): Doubt[] {
  const exact = new Set(validated.map(shimaoreEntryKey).filter(Boolean));
  return doubts.filter((doubt) => {
    const key = shimaoreEntryKey(doubt.phrase);
    return Boolean(key) && !exact.has(key);
  });
}

/** Lit la réponse de l'appel de fond (tableau JSON), en tolérant le texte autour. */
export function parseDoubts(output: string): Doubt[] {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const doubts: Doubt[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { phrase, french, question } = item as Record<string, unknown>;
    if (typeof phrase !== "string" || typeof question !== "string") continue;
    const clean = phrase.trim().slice(0, 300);
    const ask = question.trim().slice(0, 300);
    if (!clean || !ask) continue;
    doubts.push({ phrase: clean, french: typeof french === "string" ? french.trim().slice(0, 300) : "", question: ask });
    if (doubts.length >= MAX_DOUBTS) break;
  }
  return doubts;
}
