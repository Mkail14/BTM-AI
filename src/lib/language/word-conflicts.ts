/**
 * Conflits du dictionnaire : un mot français qui a plusieurs traductions
 * shimaoré (souvent deux sources qui ne sont pas d'accord). Tamilya ne tranche
 * pas : quand un de ces mots sert dans une conversation, une demande part à
 * l'administrateur (liste « À traduire » de /admin/lexique), qui garde la bonne.
 */

export type WordConflict = { french: string; translations: string[] };

type Entry = { french: string; shimaore: string };

export const MAX_REPORTED_CONFLICTS = 3;

/** Même clé que teachWords : garder une traduction remplace bien les autres. */
const frenchKey = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** Minuscules, sans accents ni ponctuation : pour comparer et chercher dans un texte. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();

/** Mots français du dictionnaire qui ont au moins deux traductions différentes. */
export function findConflicts(entries: readonly Entry[]): WordConflict[] {
  const groups = new Map<string, { french: string; translations: Map<string, string> }>();
  for (const entry of entries) {
    const key = frenchKey(entry.french);
    const shimaore = entry.shimaore.trim();
    if (!key || !fold(shimaore)) continue;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { french: entry.french.trim(), translations: new Map() }));
    if (!group.translations.has(fold(shimaore))) group.translations.set(fold(shimaore), shimaore);
  }
  return [...groups.values()]
    .filter((group) => group.translations.size > 1)
    .map((group) => ({ french: group.french, translations: [...group.translations.values()].sort((a, b) => a.localeCompare(b, "fr")) }));
}

/** Le message parle de shimaoré : un mot français cité y est sans doute à traduire. */
const ABOUT_SHIMAORE = /shima|mahorais|maor[eé]|comment (on )?(le )?di[ts]|tradui/i;

/**
 * Conflits qui servent dans cet échange : une des traductions est écrite (par la
 * personne ou par Tamilya), ou le mot français est demandé en shimaoré. Les
 * traductions de moins de trois lettres (« na », « de »…) se confondent avec le
 * français et ne comptent pas.
 */
export function conflictsInExchange(
  conflicts: readonly WordConflict[],
  exchange: { message: string; reply: string },
  max = MAX_REPORTED_CONFLICTS,
): WordConflict[] {
  const written = ` ${fold(`${exchange.message} ${exchange.reply}`)} `;
  const asked = ABOUT_SHIMAORE.test(exchange.message) ? ` ${fold(exchange.message)} ` : "";
  const found: WordConflict[] = [];
  for (const conflict of conflicts) {
    const used = conflict.translations.some((t) => {
      const n = fold(t);
      return n.length >= 3 && written.includes(` ${n} `);
    });
    const french = fold(conflict.french);
    if (used || (asked && french && asked.includes(` ${french} `))) found.push(conflict);
    if (found.length >= max) break;
  }
  return found;
}

/** Dans la liste donnée à Tamilya, un mot français qui revient avec deux traductions. */
export function hasConflictingEntries(entries: readonly Entry[]): boolean {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const key = frenchKey(entry.french);
    const shimaore = fold(entry.shimaore);
    const before = seen.get(key);
    if (before !== undefined && before !== shimaore) return true;
    seen.set(key, shimaore);
  }
  return false;
}
