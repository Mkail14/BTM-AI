/**
 * « Comment on dit … » : le moteur prépare la phrase shimaoré avant que Tamilya
 * réponde, et le code vérifie chaque mot. Une phrase déjà validée par un
 * locuteur est redonnée telle quelle ; sinon un modèle compose avec le seul
 * vocabulaire retrouvé, et tout mot qui n'en vient pas est marqué « à vérifier ».
 * Tamilya ne peut plus présenter une invention (« nisi ou hega ») comme sûre.
 */
import { shimaoreKey } from "./shimaore-match";
import type { GrammarRule } from "@/server/services/ai/brain";

type Entry = { french: string; shimaore: string };

export type Composition = {
  /** Phrase française demandée. */
  french: string;
  /** Phrase shimaoré proposée ; vide si le moteur ne sait pas la dire. */
  shimaore: string;
  /** Phrase validée telle quelle par un locuteur (dictionnaire ou expressions). */
  validated: boolean;
  /** Mots de la phrase qui ne viennent pas du vocabulaire retrouvé : un seul, et la phrase n'est pas donnée. */
  unsure: string[];
  /** Mots connus utiles, à donner quand la phrase entière n'est pas sûre. */
  known: Entry[];
};

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// « comment on dit », « comment ça se dit », « comment dit-on », « comment tu dis », « traduis(-moi) ».
const ASK = /\b(?:comment\s+(?:on\s+|ca\s+se\s+|se\s+|tu\s+)?(?:di?t|dis|dire)(?:[- ]on)?|traduis(?:[- ]moi)?|traduire)\b\s*:?\s*/;
// Appliqué au message d'origine, accents compris (« shimaoré »).
const SHIMAORE = /\s*\b(?:en|au)\s+(?:shimaor\p{L}*|mahorais)(?!\p{L})\s*/giu;
// Autre langue visée : ce n'est pas au moteur du shimaoré de répondre.
const OTHER_LANGUAGE = /\ben\s+(?:anglais|espagnol|arabe|allemand|italien|portugais|kibushi|malgache|comorien|shingazidja|swahili|chinois|japonais)\b/;

/** Phrase française à dire en shimaoré, ou null (pas une demande, autre langue, texte trop long). */
export function phraseToTranslate(message: string): string | null {
  const text = normalize(message).replace(/[’`]/g, "'");
  if (OTHER_LANGUAGE.test(text)) return null;
  const ask = ASK.exec(text);
  if (!ask) return null;
  // Même position dans le message d'origine : on garde ses accents.
  const phrase = message
    .slice(ask.index + ask[0].length)
    .replace(SHIMAORE, " ")
    .replace(/\b(?:stp|svp|s'il te pla[iî]t|s'il vous pla[iî]t)\b/gi, " ")
    .replace(/^[\s«"“'‘:]+|[\s»"”'’?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return phrase.length >= 2 && phrase.length <= 200 ? phrase : null;
}

/** « j'aime pas » et « je n'aime pas » : la même phrase, pour retrouver une phrase validée. */
export function frenchKey(text: string): string {
  return normalize(text)
    .replace(/[’`]/g, "'")
    .replace(/\bj'/g, "je ")
    .replace(/\b(?:n'|ne\s+)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Phrase déjà validée par un locuteur pour ce sens, la plus récente d'abord. */
export function findValidated(entries: readonly Entry[], french: string): Entry | null {
  const wanted = frenchKey(french);
  for (let i = entries.length - 1; i >= 0; i--) if (frenchKey(entries[i].french) === wanted) return entries[i];
  return null;
}

const wordsOf = (shimaore: string) => shimaore.match(/[\p{L}\p{N}'’-]+/gu) ?? [];

// Petits mots du français : ils comptent un peu (« je », « ai » disent la personne et le temps), moins qu'un mot de sens.
const LIGHT_FRENCH = /^(?:le|la|les|l|un|une|des|de|du|d|a|au|aux|en|y|ce|c|est|que|qui)$/;
const frenchTokens = (text: string) => frenchKey(text).split(" ").filter(Boolean).map((t) => t.replace(/[sx]$/, ""));

/**
 * Phrases validées les plus proches de la phrase à dire, à donner au moteur comme modèles de
 * construction. Mesure du 2026-11-20 (scripts/shimaore-bench.ts) : pour « j'ai faim », le moteur
 * ne recevait pas « j'ai soif = nisi kiya gnora », faute de mot commun exact ; il abandonnait
 * 67 fois sur 122. Une langue rare s'apprend surtout par des phrases d'exemple (Aycock et al., 2025) :
 * on lui donne celles qui partagent le plus de mots français, les petits mots comptant moins.
 * Seules les entrées de deux mots shimaoré ou plus (des phrases, pas des mots isolés).
 */
export function nearestExamples<T extends Entry>(entries: readonly T[], french: string, max = 20): T[] {
  const wanted = frenchTokens(french);
  if (wanted.length === 0) return [];
  const weight = (t: string) => (LIGHT_FRENCH.test(t) ? 0.3 : 1);
  const scored: { entry: T; score: number; at: number }[] = [];
  entries.forEach((entry, at) => {
    if (wordsOf(entry.shimaore).length < 2) return;
    const tokens = frenchTokens(entry.french);
    if (tokens.length === 0) return;
    const pool = [...tokens];
    let shared = 0;
    for (const t of wanted) {
      const i = pool.indexOf(t);
      if (i >= 0) {
        shared += weight(t);
        pool.splice(i, 1);
      }
    }
    // Un seul petit mot en commun (« la », « de ») ne fait pas un modèle.
    if (shared < 1) return;
    // Les phrases courtes et proches d'abord ; à égalité, la plus récente (leçon du référent).
    scored.push({ entry, score: shared / Math.sqrt(tokens.length * wanted.length), at });
  });
  scored.sort((a, b) => b.score - a.score || b.at - a.at);
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const { entry } of scored) {
    const key = `${frenchKey(entry.french)}\u0000${entry.shimaore.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
    if (kept.length >= max) break;
  }
  return kept;
}

/**
 * Mots de la phrase qui ne viennent d'aucune entrée donnée au moteur. Le code
 * décide, pas le modèle : un mot qu'il dit « connu » sans qu'il soit dans le
 * vocabulaire retrouvé reste à vérifier.
 */
export function unsureWords(shimaore: string, given: readonly Entry[], french = ""): string[] {
  // Les noms repris de la phrase française (Claude, Mamoudzou) ne sont pas des mots devinés.
  const names = (french.match(/\b\p{Lu}[\p{L}'’-]+/gu) ?? []).map(shimaoreKey);
  const known = new Set([...given.flatMap((entry) => wordsOf(entry.shimaore).map(shimaoreKey)), ...names]);
  const seen = new Set<string>();
  return wordsOf(shimaore).filter((word) => {
    const k = shimaoreKey(word);
    if (!k || known.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const COMPOSE_PROMPT = `Tu composes une phrase en shimaoré (langue bantoue de Mayotte, à ne pas confondre avec le kibushi ni le comorien des autres îles).
Tu ne connais du shimaoré QUE ce qui est donné plus bas : phrases validées, règles, vocabulaire. Le dictionnaire donne surtout des verbes à l'infinitif (préfixe u-, ex. uvendza = aimer) : pour les conjuguer, appuie-toi sur les phrases validées et les règles, jamais sur ce que tu crois savoir.
Méthode : regarde d'abord les « phrases proches » : prends celle dont la construction ressemble le plus (même personne, même temps, même forme) et garde sa construction telle quelle, en ne remplaçant que le morceau qui change, par un mot du vocabulaire. Sinon, découpe la phrase française en morceaux de sens, retrouve chaque morceau dans ce qui est donné, puis assemble. N'emploie jamais un mot d'un autre sens pour combler un trou (« je te déteste » pour « je n'aime pas »).
Un même petit mot shimaoré peut avoir plusieurs sens (« tsi » = je, ou ne…pas, ou le passé ; « nisi » = je, ou je te) : fie-toi aux phrases proches, pas à une traduction mot à mot. Écris les mots comme dans les phrases validées.
Si un morceau n'est nulle part, ne l'invente pas : mets-le dans "manque".
Réponds UNIQUEMENT par un objet JSON, sans texte autour : {"shimaore":"…","manque":["…"]}.
- shimaore : la phrase complète, ou "" si plus de la moitié du sens manque.
- manque : les morceaux du français que tu n'as pas pu traduire avec ce qui est donné.`;

/** Ce que le moteur reçoit : la phrase, puis tout ce qu'on a retrouvé pour elle. */
export function buildComposeContent(input: {
  french: string;
  /** Phrases validées les plus proches (nearestExamples), les plus proches d'abord. */
  nearest?: readonly Entry[];
  phrases: readonly Entry[];
  words: readonly Entry[];
  grammar: readonly GrammarRule[];
}): string {
  const list = (entries: readonly Entry[]) => entries.map((e) => `- ${e.french} → ${e.shimaore}`).join("\n");
  const rules = input.grammar.map((g) => `- ${g.title} : ${g.rule}${g.examples ? ` (${g.examples})` : ""}`).join("\n");
  return [
    ...(input.nearest?.length ? [`Phrases proches (validées, les plus proches d'abord) :\n${list(input.nearest)}`] : []),
    `Phrases validées :\n${list(input.phrases) || "(aucune)"}`,
    `Règles :\n${rules || "(aucune)"}`,
    `Vocabulaire :\n${list(input.words) || "(aucun)"}`,
    `Phrase à dire en shimaoré :\n${input.french}`,
  ].join("\n\n");
}

/** Lit {"shimaore":"…"} ; null si la réponse n'est pas lisible. */
export function parseComposition(output: string): string | null {
  const json = output.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const value = (JSON.parse(json) as { shimaore?: unknown }).shimaore;
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

// « la plage » retrouvait « là = vale » : les petits mots du français ne sont pas des mots utiles à donner.
const SMALL_WORD = /^(?:la|le|les|l|un|une|des|de|du|d|a|au|aux|et|ou|en|y)$/;

/** Consigne de Tamilya pour ce message : elle redonne la phrase préparée, avec le bon degré d'assurance. */
export function compositionBlock(c: Composition, teaches = false): string {
  // Seul un administrateur lui apprend des mots : aux autres, elle demande s'ils la connaissent, sans promettre de la retenir.
  const ask = teaches ? "demande-lui s'il peut te l'apprendre" : "demande-lui s'il la connaît, sans promettre de la retenir";
  const known = c.known
    .filter((e) => !SMALL_WORD.test(frenchKey(e.french)))
    .slice(0, 8)
    .map((e) => `${e.french} = ${e.shimaore}`)
    .join(" ; ");
  const lines = [`POUR CE MESSAGE : la personne demande comment dire « ${c.french} » en shimaoré. Le moteur de traduction a préparé la réponse et vérifié chaque mot.`];
  if (c.validated) {
    lines.push(`Phrase validée par un locuteur : « ${c.shimaore} ». Donne-la telle quelle, avec assurance, sans la découper ni proposer d'autre version.`);
  } else if (c.shimaore && c.unsure.length === 0) {
    lines.push(`Proposition du moteur : « ${c.shimaore} ». Recopie-la à l'identique : n'en change, n'en ajoute ni n'en retire aucun mot.`);
    lines.push("Tous ses mots viennent de ton vocabulaire, mais la phrase entière n'a pas été validée : dis-le en quelques mots et demande-lui de confirmer.");
  } else {
    // Un seul mot deviné suffit : la phrase n'est pas donnée (« nisi veli mivo mivo mutsanga », essai du 2026-11-16).
    // Essai du 2026-11-20 (« où est la plage ») : elle a ajouté « i » pour « la », déduit d'une phrase d'exemple,
    // et donné « est = mashariki » (le point cardinal) pour le verbe. Seule la liste vérifiée peut sortir, et
    // seulement les mots qui ont ce sens-là dans la phrase.
    const words = known
      ? ` Tu peux donner, au plus, ces mots-là, tels quels : ${known}. Seulement ceux qui ont le même sens que dans la phrase demandée (un mot français peut avoir plusieurs sens) ; aucun autre mot shimaoré, même déduit d'un exemple.`
      : " Ne donne aucun mot shimaoré.";
    lines.push(`Tu ne sais pas encore dire cette phrase : dis-le franchement, en une phrase, et ${ask}.${words} N'assemble aucune phrase toi-même.`);
  }
  // Essai du 2026-11-16 : une phrase donnée dans une conversation passée revenait, dite avec assurance.
  if (!c.validated) {
    lines.push("Une phrase en shimaoré vue dans une conversation passée n'est pas vérifiée : ne la donne pas à la place de ce qui précède.");
  }
  lines.push("Si la personne corrige ensuite, c'est elle qui a raison : reprends sa phrase.");
  return lines.join("\n");
}
