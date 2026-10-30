/**
 * Mots shimaoré inconnus signalés par Awa à la fin de sa réponse :
 * « <<inconnu: mot1 | mot2>> ». La balise est retirée du flux avant
 * d'arriver chez l'utilisateur ; les mots partent dans la liste « À traduire »
 * de /admin/lexique.
 */
const TAG = "<<inconnu:";

export const MAX_REPORTED_WORDS = 5;
const MAX_WORD_CHARS = 60;

/**
 * Filtre de flux : renvoie le texte affichable au fil des morceaux et retient
 * tout ce qui suit le début de la balise. end() rend le reste à afficher
 * (une fausse alerte « < » est rendue telle quelle) et les mots signalés.
 */
export function createUnknownTagFilter() {
  let held = "";
  let inTag = false;

  return {
    push(chunk: string): string {
      if (inTag) {
        held += chunk;
        return "";
      }
      held += chunk;
      let out = "";
      while (held) {
        const i = held.indexOf("<");
        if (i < 0) {
          out += held;
          held = "";
          break;
        }
        out += held.slice(0, i);
        held = held.slice(i);
        const head = held.slice(0, TAG.length).toLowerCase();
        if (head === TAG) {
          inTag = true;
          break;
        }
        // Début possible de balise coupé entre deux morceaux : on attend la suite.
        if (held.length < TAG.length && TAG.startsWith(head)) break;
        out += held[0];
        held = held.slice(1);
      }
      return out;
    },

    end(): { rest: string; words: string[] } {
      if (!inTag) return { rest: held, words: [] };
      const close = held.indexOf(">>");
      const inside = held.slice(TAG.length, close < 0 ? undefined : close);
      const after = close < 0 ? "" : held.slice(close + 2);
      const words = inside
        .split(/[|,;\n]/)
        .map((w) => w.trim().replace(/^["«“']+|["»”']+$/g, "").trim())
        .filter((w) => w && w.length <= MAX_WORD_CHARS);
      return { rest: after.trim() ? after : "", words: [...new Set(words)].slice(0, MAX_REPORTED_WORDS) };
    },
  };
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[?!.,;:«»"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Le message semble contenir du shimaoré : un mot déjà connu du dictionnaire,
 * ou la langue nommée. Déclenche la recherche des mots inconnus (un appel de
 * fond seulement dans ce cas, pour ménager les quotas des API gratuites).
 */
export function mayContainShimaore(userMessage: string, known: Iterable<string>): boolean {
  if (/shima|mahorais|maor[eé]/i.test(userMessage)) return true;
  const knownTokens = new Set([...known].flatMap((k) => normalize(k).split(" ")).filter((t) => t.length > 2));
  return normalize(userMessage)
    .split(" ")
    .some((token) => knownTokens.has(token));
}

/** Consigne de l'appel de fond qui relève le shimaoré d'un message. */
export const SHIMAORE_SPOTTING_PROMPT =
  "Tu repères le shimaoré (langue de Mayotte) dans un message qui peut mélanger français et shimaoré. Réponds uniquement par un tableau JSON des mots shimaoré, tels qu'ils sont écrits dans le message, un mot par élément. N'inclus aucun mot français, aucun prénom, aucune traduction. Réponds [] s'il n'y en a pas.";

/** Lit la réponse de l'appel de fond (tableau JSON de chaînes), en tolérant le texte autour. */
export function parseSpottedWords(output: string): string[] {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(output.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter((w): w is string => typeof w === "string").map((w) => w.trim()).filter((w) => w && w.length <= MAX_WORD_CHARS),
      ),
    ].slice(0, MAX_REPORTED_WORDS * 2);
  } catch {
    return [];
  }
}

/**
 * Garde-fou : seuls les mots présents dans le message de l'utilisateur et
 * absents du dictionnaire sont gardés (le modèle peut se tromper ou inventer).
 * Une expression dont chaque mot est déjà connu n'est pas redemandée.
 */
export function keepReportableWords(words: readonly string[], userMessage: string, known: Iterable<string>): string[] {
  const message = ` ${normalize(userMessage)} `;
  const knownTokens = new Set([...known].flatMap((k) => normalize(k).split(" ")).filter(Boolean));
  return words.filter((w) => {
    const n = normalize(w);
    if (n.length < 2 || !message.includes(` ${n} `)) return false;
    return !n.split(" ").every((token) => knownTokens.has(token));
  });
}
