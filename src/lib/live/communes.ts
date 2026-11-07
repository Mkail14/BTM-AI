import "server-only";

/**
 * Les 17 communes de Mayotte : codes postaux et population (geo.api.gouv.fr,
 * chiffres INSEE ; gratuit, sans clé). Gardées 7 jours.
 */

const URL = "https://geo.api.gouv.fr/communes?codeDepartement=976&fields=nom,code,codesPostaux,population";
const CACHE_MS = 7 * 24 * 3600_000;

type Commune = { nom?: string; code?: string; codesPostaux?: string[]; population?: number };

let cache: { at: number; text: string } | null = null;

const people = new Intl.NumberFormat("fr-FR");

/** Bloc pour Tamilya (null si l'API ne répond pas et que rien n'est gardé). */
export async function communesBlock(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  try {
    const response = await fetch(URL, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    if (!response.ok) throw new Error(`geo.api ${response.status}`);
    const communes = ((await response.json()) as Commune[]).filter((c) => c.nom);
    if (!communes.length) return cache?.text ?? null;
    const total = communes.reduce((sum, c) => sum + (c.population ?? 0), 0);
    const text = [
      `Communes de Mayotte (geo.api.gouv.fr, population légale INSEE ; total ${people.format(total)} habitants) :`,
      ...communes.map(
        (c) =>
          `- ${c.nom} : code postal ${(c.codesPostaux ?? []).join(", ") || "inconnu"}${typeof c.population === "number" ? `, ${people.format(c.population)} habitants` : ""} (code INSEE ${c.code})`,
      ),
    ].join("\n");
    cache = { at: Date.now(), text };
    return text;
  } catch (error) {
    console.error("[direct] Communes indisponibles", error);
    return cache?.text ?? null;
  }
}
