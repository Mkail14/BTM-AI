/**
 * Champs remplis à la voix (remplir_tableau) : la reconnaissance vocale écrit les noms
 * de Mayotte à l'oreille (« Sivré » pour « Tsiveré ») et Tamilya peut se tromper de
 * ville (« Mamoudzou » parce que le code postal est 97600, alors que la personne a dit
 * « Koungou »). Ici, avant d'écrire :
 * 1. un mot épelé lettre par lettre (« T S I V E R E ») est recopié tel quel ;
 * 2. une ville proche d'une commune ou d'un village de Mayotte prend sa bonne écriture,
 *    et le champ « Ville » prend la ville que la personne vient de dire ;
 * 3. une adresse proche d'une rue de la Base Adresse Nationale (mayotte-voies.json)
 *    prend son nom exact, et Tamilya apprend sa commune et son code postal.
 * Prudence : un nom trop éloigné de tout reste tel quel (Paris reste Paris).
 */

import { MAYOTTE_COMMUNES } from "@/lib/address-fields";
import { editDistance, shimaoreKey } from "@/lib/language/shimaore-match";
import { MAYOTTE_PLACES } from "./mayotte-places";

/** [nom de la voie ou du lieu-dit, commune, code postal] */
export type Voie = [string, string, string];

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

// ——— Épellation ———

/** Noms des lettres tels que la dictée peut les écrire. */
const LETTER_NAMES: Record<string, string> = {
  a: "a", be: "b", bé: "b", ce: "c", cé: "c", de: "d", dé: "d", e: "e", eu: "e", é: "é", è: "è",
  ef: "f", effe: "f", ge: "g", gé: "g", ache: "h", hache: "h", i: "i", ji: "j", jy: "j", ka: "k",
  el: "l", elle: "l", em: "m", emme: "m", en: "n", enne: "n", o: "o", pe: "p", pé: "p", qu: "q", ku: "q",
  er: "r", erre: "r", es: "s", esse: "s", te: "t", té: "t", u: "u", ve: "v", vé: "v", w: "w",
  ixe: "x", x: "x", y: "y", zed: "z", zède: "z", zèd: "z",
};

function letterOf(token: string): string | null {
  const t = token.toLowerCase();
  if (/^\p{L}$/u.test(t)) return t;
  return LETTER_NAMES[t] ?? null;
}

/** Mots épelés dans ce que la personne a dit : au moins 3 lettres à la suite. */
export function spelledWords(heard: string): string[] {
  const tokens = heard.split(/[\s,.;:\-–—/]+/).filter(Boolean);
  const words: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) words.push(run.join(""));
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    // « e accent aigu », « e accent grave »
    if (t === "accent" && run.length && ["aigu", "grave"].includes(tokens[i + 1]?.toLowerCase() ?? "")) {
      if (run[run.length - 1] === "e") run[run.length - 1] = tokens[i + 1].toLowerCase() === "aigu" ? "é" : "è";
      i++;
      continue;
    }
    const letter = letterOf(t);
    if (letter) run.push(letter);
    else flush();
  }
  flush();
  return words;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Remplace, dans la valeur, le mot qui ressemble le plus au mot épelé. */
export function applySpelling(value: string, spelled: string[]): string {
  let result = value;
  for (const raw of spelled) {
    const word = capitalize(raw);
    const key = shimaoreKey(word);
    if (shimaoreKey(result).includes(key)) continue;
    const tokens = [...result.matchAll(WORD)].filter((m) => !/^\d+$/.test(m[0]));
    let best: RegExpMatchArray | null = null;
    let bestGap = Infinity;
    for (const token of tokens) {
      const allowed = Math.ceil(key.length / 2);
      const gap = editDistance(shimaoreKey(token[0]), key, allowed);
      if (gap <= allowed && gap < bestGap) {
        best = token;
        bestGap = gap;
      }
    }
    if (best && best.index !== undefined) result = result.slice(0, best.index) + word + result.slice(best.index + best[0].length);
    else if (tokens.length <= 1) result = word;
  }
  return result;
}

// ——— Villes et villages ———

const PLACE_NAMES = [...new Set<string>([...MAYOTTE_COMMUNES, ...Object.keys(MAYOTTE_PLACES), ...Object.values(MAYOTTE_PLACES).flat()])];
const placeKey = (name: string) => shimaoreKey(name.replace(/\s+/g, ""));
const PLACES = PLACE_NAMES.map((name) => ({ name, key: placeKey(name) }));

const COMMUNE_KEYS = new Set([...MAYOTTE_COMMUNES, ...Object.keys(MAYOTTE_PLACES)].map((name) => placeKey(name)));
const isCommune = (name: string) => COMMUNE_KEYS.has(placeKey(name));

/** Écart toléré : aucun sous 5 lettres, 1 jusqu'à 8, 2 au-delà. */
const allowedGap = (letters: number) => (letters < 5 ? 0 : letters >= 9 ? 2 : 1);

/** La commune ou le village de Mayotte qui correspond à ce texte, ou null. */
export function matchPlace(text: string): string | null {
  const key = placeKey(text);
  if (key.length < 3) return null;
  let best: string | null = null;
  let bestGap = Infinity;
  let tied = false;
  for (const place of PLACES) {
    const allowed = allowedGap(Math.min(key.length, place.key.length));
    const gap = place.key === key ? 0 : allowed === 0 ? 1 : editDistance(key, place.key, allowed);
    if (gap > allowed) continue;
    if (gap < bestGap) [best, bestGap, tied] = [place.name, gap, false];
    else if (gap === bestGap && place.name !== best) tied = true;
  }
  return tied ? null : best;
}

/** Les lieux de Mayotte cités dans une phrase (groupes de 1 à 3 mots). */
export function placesIn(text: string): string[] {
  const words = text.match(WORD) ?? [];
  const found = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    for (let size = 3; size >= 1; size--) {
      if (i + size > words.length) continue;
      const place = matchPlace(words.slice(i, i + size).join(" "));
      if (place) {
        found.add(place);
        i += size - 1;
        break;
      }
    }
  }
  return [...found];
}

/** Champ qui attend une ville ou un lieu. */
export const isPlaceField = (label: string) => /\b(ville|commune|village|quartier|lieu|fait a|a)\b/.test(simple(label));
/** Champ de la ville de résidence : il prend toujours la ville que la personne vient de dire. */
const isCityField = (label: string) => /\b(ville|commune)\b/.test(simple(label));
export const isAddressField = (label: string) => /\b(adresse|rue|voie)\b/.test(simple(label));

function simple(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// ——— Rues ———

const STREET_TYPES = /^(rue|boulevard|bd|impasse|chemin|route|allee|avenue|av|place|ruelle|sentier|lotissement|residence|quartier|voie|cite|passage|square|lieu dit|rn|rd)\s+/;
const streetCore = (name: string) => simple(name).replace(STREET_TYPES, "").replace(/\s+/g, "");

/** La rue de Mayotte qui correspond à ce texte (sans le numéro), ou null si rien n'est assez proche ou si c'est ambigu. */
export function matchVoie(text: string, voies: Voie[], strict = false): Voie | null {
  const wanted = streetCore(text);
  if (wanted.length < 3) return null;
  const wantedKey = shimaoreKey(wanted);
  let best: Voie[] = [];
  let bestGap = Infinity;
  for (const voie of voies) {
    const key = shimaoreKey(streetCore(voie[0]));
    // Environ une lettre sur trois du nom le plus long (« Sivré » pour « Tsiveré »), trois au plus.
    const allowed = strict || wantedKey.length < 4 ? 0 : Math.min(3, Math.floor(Math.max(key.length, wantedKey.length) * 0.3));
    const gap = key === wantedKey ? 0 : allowed === 0 ? 1 : editDistance(key, wantedKey, allowed);
    if (gap > allowed) continue;
    if (gap < bestGap) [best, bestGap] = [[voie], gap];
    else if (gap === bestGap) best.push(voie);
  }
  if (!best.length) return null;
  // Même nom dans plusieurs communes, ou deux rues aussi proches : on ne choisit pas.
  const names = new Set(best.map((v) => v[0]));
  return names.size === 1 && best.length === 1 ? best[0] : null;
}

let voiesPromise: Promise<Voie[]> | null = null;
/** Les rues ne sont chargées qu'au premier champ d'adresse rempli à la voix. */
export const loadVoies = () => (voiesPromise ??= import("./mayotte-voies.json").then((m) => m.default as Voie[]).catch(() => []));

/** Ce qu'il faut écrire dans le champ, et une note pour Tamilya. */
export async function fixFieldValue(label: string, value: string, heard: string): Promise<{ value: string; note: string | null }> {
  const spelled = spelledWords(heard);
  let result = spelled.length ? applySpelling(value, spelled) : value;
  const strict = spelled.length > 0;
  const notes: string[] = [];

  if (isAddressField(label)) {
    const match = /^\s*(\d+\s*(?:bis|ter)?\s*,?\s*)?(.*)$/i.exec(result);
    const number = match?.[1] ?? "";
    const rest = match?.[2] ?? result;
    const voie = matchVoie(rest, await loadVoies(), strict);
    if (voie) {
      result = `${number}${voie[0]}`;
      notes.push(
        `Rue reconnue : ${voie[0]}, à ${voie[1]} (${voie[2]}) selon la base officielle des adresses. Si la personne n'a pas dit sa ville, c'est ${voie[1]} ; si elle en a dit une, garde la sienne. Le code postal ne dit pas la ville (97600 sert à Mamoudzou et à Koungou).`,
      );
    }
  } else if (isPlaceField(label)) {
    // Seulement des communes : « j'habite à Kawéni » donne bien Mamoudzou en ville.
    const heardPlaces = placesIn(heard).filter(isCommune);
    const place = matchPlace(result);
    if (isCityField(label) && heardPlaces.length === 1 && place && isCommune(place) && place !== heardPlaces[0]) {
      notes.push(`La personne a dit « ${heardPlaces[0]} » : c'est ce qui est écrit, pas « ${place} ».`);
      result = heardPlaces[0];
    } else if (place && (!strict || placeKey(place) === placeKey(result))) {
      result = place;
    }
  }
  if (spelled.length && result !== value) notes.push(`Mot épelé recopié lettre par lettre : ${spelled.map(capitalize).join(", ")}.`);
  return { value: result, note: notes.length ? notes.join(" ") : null };
}
