/**
 * Comparaison tolérante des mots shimaoré. La langue s'écrit de plusieurs
 * façons (« djéjé » / « jéjé », « shiwanda » / « chiwanda », « oukéya » /
 * « ukeya », voyelles doublées, accents) et la dictée vocale l'écrit à
 * l'oreille : deux écritures du même mot doivent se retrouver.
 */

/** Forme de comparaison : sans accents ni apostrophes, sons écrits d'une seule façon. */
export function shimaoreKey(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`\-]/g, "")
    .replace(/dj/g, "j")
    .replace(/tch/g, "ch")
    .replace(/sh/g, "ch")
    .replace(/ou/g, "u")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/c(?=[aou])/g, "k")
    .replace(/(.)\1+/g, "$1");
}

/** Distance d'édition (insertions, suppressions, substitutions), arrêtée au-delà de `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]);
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Deux mots shimaoré sont-ils le même ? Même forme de comparaison, ou une
 * lettre d'écart à partir de 5 lettres (deux à partir de 9) : assez pour une
 * faute de frappe ou de dictée, pas assez pour confondre deux mots courts.
 */
export function sameShimaoreWord(a: string, b: string): boolean {
  const x = shimaoreKey(a);
  const y = shimaoreKey(b);
  if (x === y) return true;
  const shortest = Math.min(x.length, y.length);
  if (shortest < 5) return false;
  return editDistance(x, y, shortest >= 9 ? 2 : 1) <= (shortest >= 9 ? 2 : 1);
}
