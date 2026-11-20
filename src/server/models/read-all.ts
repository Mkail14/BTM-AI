/**
 * Supabase ne renvoie jamais plus de 1 000 lignes par requête (réglage « Max
 * rows » du projet), même avec `.limit(5000)`. Le 2026-11-20, le dictionnaire
 * comptait 1 860 mots actifs : Tamilya n'en voyait que les 1 000 plus récents
 * (« dormir = ulala », « demain = meso », « tu as faim ? = ouyi tsahawo »
 * restaient invisibles et elle disait ne pas les connaître ou inventait).
 *
 * Lit donc page par page jusqu'à `max` lignes. La requête doit être triée
 * sur une colonne unique en dernier (id) pour que deux pages ne se chevauchent pas.
 */
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function readAllRows<T>(page: (from: number, to: number) => Page<T>, max = 20_000): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE_ROWS) {
    const to = Math.min(from + PAGE_ROWS, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
