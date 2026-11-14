import "server-only";
import { placeKey } from "@/lib/geo/villages";

/**
 * Les 17 communes de Mayotte : codes postaux et population (geo.api.gouv.fr,
 * chiffres INSEE ; gratuit, sans clé). Gardées 7 jours.
 */

const URL = "https://geo.api.gouv.fr/communes?codeDepartement=976&fields=nom,code,codesPostaux,population";
const CACHE_MS = 7 * 24 * 3600_000;

type Commune = { nom?: string; code?: string; codesPostaux?: string[]; population?: number };

let cache: { at: number; communes: Commune[] } | null = null;

const people = new Intl.NumberFormat("fr-FR");

/** La liste des communes (null si l'API ne répond pas et que rien n'est gardé). */
async function loadCommunes(): Promise<Commune[] | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.communes;
  try {
    const response = await fetch(URL, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    if (!response.ok) throw new Error(`geo.api ${response.status}`);
    const communes = ((await response.json()) as Commune[]).filter((c) => c.nom);
    if (!communes.length) return cache?.communes ?? null;
    cache = { at: Date.now(), communes };
    return communes;
  } catch (error) {
    console.error("[direct] Communes indisponibles", error);
    return cache?.communes ?? null;
  }
}

/** Bloc pour Tamilya (null si l'API ne répond pas et que rien n'est gardé). */
export async function communesBlock(): Promise<string | null> {
  const communes = await loadCommunes();
  if (!communes) return null;
  const total = communes.reduce((sum, c) => sum + (c.population ?? 0), 0);
  return [
    `Communes de Mayotte (geo.api.gouv.fr, population légale INSEE ; total ${people.format(total)} habitants) :`,
    ...communes.map(
      (c) =>
        `- ${c.nom} : code postal ${(c.codesPostaux ?? []).join(", ") || "inconnu"}${typeof c.population === "number" ? `, ${people.format(c.population)} habitants` : ""} (code INSEE ${c.code})`,
    ),
  ].join("\n");
}

/** Habitants d'une commune, écrits pour être dits (« 11 156 ») ; null si inconnue ou si l'API ne répond pas. */
export async function communePopulation(name: string): Promise<string | null> {
  const key = placeKey(name);
  const commune = key ? (await loadCommunes())?.find((c) => placeKey(c.nom ?? "") === key) : null;
  return typeof commune?.population === "number" ? people.format(commune.population) : null;
}
