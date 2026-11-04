/**
 * Nettoyage du lexique : ce qui, dans les mots et les expressions appris,
 * ressemble à une erreur (espaces en trop, doublons, traduction recopiée avec
 * une faute). Tamilya apprend ce qu'on lui donne, fautes comprises.
 */

export type EntryTable = "words" | "lexicon";
export type LexEntry = { table: EntryTable; id: string; french: string; shimaore: string };

export type IssueKind = "espaces" | "doublon" | "deux-traductions" | "copie";

export type Issue = {
  kind: IssueKind;
  /** Identifiant stable de la remarque (pour « c'est voulu »). */
  ref: string;
  entries: LexEntry[];
};

export const refOf = (entry: LexEntry) => `${entry.table}:${entry.id}`;

export const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** Minuscules, sans accents ni ponctuation autour : « Aéroport ! » = « aeroport ». */
const fold = (text: string) =>
  tidy(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/^[\s"«“(]+|[\s"»”).,!?…:;]+$/g, "");

/** Nombre de lettres à changer pour passer de a à b (Levenshtein). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Remarques sur le lexique, sans celles marquées « c'est voulu »
 * (`ignored` : « genre|ref »).
 */
export function findIssues(entries: readonly LexEntry[], ignored: ReadonlySet<string> = new Set()): Issue[] {
  const issues: Issue[] = [];

  for (const entry of entries) {
    if (entry.french !== tidy(entry.french) || entry.shimaore !== tidy(entry.shimaore)) {
      issues.push({ kind: "espaces", ref: refOf(entry), entries: [entry] });
    }
  }

  // Même mot français appris plusieurs fois : en double, ou avec deux traductions.
  const byFrench = new Map<string, LexEntry[]>();
  for (const entry of entries) {
    const k = fold(entry.french);
    if (!k) continue;
    byFrench.set(k, [...(byFrench.get(k) ?? []), entry]);
  }
  for (const group of byFrench.values()) {
    if (group.length < 2) continue;
    const translations = new Set(group.map((e) => fold(e.shimaore)));
    issues.push({
      kind: translations.size === 1 ? "doublon" : "deux-traductions",
      ref: group.map(refOf).sort().join(","),
      entries: group,
    });
  }

  // Traduction qui ressemble au français à une ou deux lettres près : souvent
  // une faute de frappe en recopiant (« aéroprt »), parfois un mot emprunté.
  for (const entry of entries) {
    const f = fold(entry.french);
    const s = fold(entry.shimaore);
    if (f === s || f.length < 4 || s.length < 4) continue;
    const distance = editDistance(f, s);
    if (distance <= (f.length >= 8 ? 2 : 1)) issues.push({ kind: "copie", ref: refOf(entry), entries: [entry] });
  }

  return issues.filter((issue) => !ignored.has(`${issue.kind}|${issue.ref}`));
}
