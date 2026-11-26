import { COMMUNE_CENTERS, type Point } from "@/lib/geo/communes";
import { VILLAGES } from "@/lib/geo/villages";

/**
 * Lieu dont parle un article de journal (page « Mayotte ») : on cherche le nom
 * d'une ville, d'un village ou d'un quartier de l'île dans le titre, puis dans
 * le résumé. Sans IA : une simple lecture des mots, instantanée et gratuite.
 */

export type NewsPlace = { name: string; point: Point };

/** Une « une » de la page Mayotte (GET /api/mayotte/une). */
export type Headline = {
  title: string;
  link: string;
  source: string;
  date: string | null;
  image?: string;
  place: NewsPlace | null;
};

/** Mot simplifié : sans accents, apostrophes ni majuscules (« M’Tsapéré » = « mtsapere »). */
const simplify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’ʼ`]/g, "");

const words = (text: string) => simplify(text).match(/[a-z0-9]+/g) ?? [];

/** Clé d'un nom de lieu : ses mots collés (« Kani-Kéli », « Kani Kéli » et « Kanikéli » donnent « kanikeli »). */
const keyOf = (name: string) => words(name.replace(/\s*\(.*\)$/, "")).join("");

const PLACES = new Map<string, NewsPlace>();
const add = (name: string, point: Point, key = keyOf(name)) => {
  if (key.length >= 4 && !PLACES.has(key)) PLACES.set(key, { name, point });
};
for (const village of VILLAGES) add(village.name.replace(/\s*\(.*\)$/, ""), village.point);
for (const [name, point] of Object.entries(COMMUNE_CENTERS)) add(name, point);
// Autres écritures courantes dans la presse.
const OTHER_NAMES: [other: string, name: string][] = [
  ["Iloni", "Ironi Bé"],
  ["Kavani", "Cavani"],
  ["Majicavo", "Majicavo-Koropa"],
  ["Passamaïnty", "Passamainty"],
  ["Mtsamboro", "M'Tsamboro"],
  ["Hauts-Vallons", "Les Hauts Vallons"],
  ["Tsoundzou", "Tsoundzou 1"],
  ["Miréréni", "Miréréni (Tsingoni)"],
];
for (const [other, name] of OTHER_NAMES) {
  const place = PLACES.get(keyOf(name));
  if (place) add(other, place.point, keyOf(other));
}
// Petite-Terre : entre Dzaoudzi-Labattoir et Pamandzi.
add("Petite-Terre", { lat: -12.792, lng: 45.272 });

/** Plus long nom de lieu, en mots (« Les Hauts Vallons », « M'Tsanga M'Titi »). */
const MAX_WORDS = 4;

/** Lieux de Mayotte nommés dans le texte, dans l'ordre, sans doublon. */
function placesIn(text: string): NewsPlace[] {
  const list = words(text);
  const found = new Map<string, NewsPlace>();
  for (let i = 0; i < list.length; i++) {
    // Le nom le plus long d'abord : « Kani-Kéli » avant « Kani ».
    for (let n = Math.min(MAX_WORDS, list.length - i); n >= 1; n--) {
      const place = PLACES.get(list.slice(i, i + n).join(""));
      if (!place) continue;
      found.set(place.name, place);
      i += n - 1;
      break;
    }
  }
  return [...found.values()];
}

/**
 * Lieu de l'article : le premier nommé dans le titre ; sinon celui du résumé, s'il n'y en a
 * qu'un (un résumé qui cite plusieurs villes parle de toute l'île : la carte la montre en entier).
 */
export function newsPlace(title: string, summary = ""): NewsPlace | null {
  const inTitle = placesIn(title);
  if (inTitle.length) return inTitle[0];
  const inSummary = placesIn(summary);
  return inSummary.length === 1 ? inSummary[0] : null;
}
