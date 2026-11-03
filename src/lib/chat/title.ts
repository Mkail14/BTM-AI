/**
 * Titres de l'historique : le sujet de la conversation en quelques mots,
 * pas le premier message recopié (« coucou tamilya j'ai trop faim je ve… »).
 */

/** Longueur maximale d'un titre court, en caractères. */
export const SHORT_TITLE_CHARS = 40;

// Salutations et mots qui n'apportent rien au sujet, retirés en début de message.
const OPENING =
  /^(?:(?:coucou|salut|bonjour|bonsoir|hello|hey|yo|wesh|kwezi|jeje|cc|slt|bjr|re)\b|awa\b|tamilya\b|chef\b|ma belle\b|toi\b|stp\b|s'il te pla[iî]t\b|svp\b|dis(?:-moi)?\b|alors\b|euh+\b|bon\b|ok\b|[,.!?;:\s-])+/i;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Coupe au dernier mot entier avant la limite. */
function cut(text: string, max: number) {
  if (text.length <= max) return text;
  const short = text.slice(0, max + 1);
  const space = short.lastIndexOf(" ");
  return `${(space > max / 2 ? short.slice(0, space) : text.slice(0, max)).replace(/[\s,;:.!?-]+$/, "")}…`;
}

/**
 * Titre immédiat, sans IA : le premier message sans les salutations, une seule
 * phrase, coupé court. Remplacé ensuite par le titre de l'IA.
 */
export function quickTitle(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  const topic = line.replace(OPENING, "").split(/(?<=[.!?])\s/)[0].replace(/[.!?\s]+$/, "").trim();
  if (!topic) return line ? cut(capitalize(line), SHORT_TITLE_CHARS) : "Nouvelle conversation";
  return cut(capitalize(topic), SHORT_TITLE_CHARS);
}

/** Nettoie la réponse de l'IA : une ligne, sans guillemets ni point final ; null si inutilisable. */
export function cleanAiTitle(raw: string): string | null {
  const line = raw
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  const title = line
    .replace(/^(?:titre\s*:\s*)/i, "")
    .replace(/^[«"'“*\s]+|[»"'”*\s]+$/g, "")
    .replace(/[.!?…]+$/, "")
    .trim();
  if (title.length < 2 || title.length > 60) return null;
  return cut(capitalize(title), SHORT_TITLE_CHARS);
}
