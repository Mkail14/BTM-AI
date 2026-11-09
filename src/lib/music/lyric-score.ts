/**
 * Note des paroles d'une chanson, calculée par le code (aucun appel) : sert à choisir la
 * meilleure de plusieurs versions écrites en même temps (src/lib/music/lyricist.ts).
 *
 * Remarque de l'utilisateur (2026-11-09) : les paroles « sentent vraiment l'IA ». On enlève des
 * points pour ce qui trahit une IA (clichés, mots vagues, même mot qui rime avec lui-même) et on
 * en donne pour ce qui fait une vraie chanson (rimes riches, vers de longueur égale, donc faciles
 * à chanter). La note ne juge pas le sens : elle écarte surtout les versions les plus « IA ».
 */

/** Tournures de chanson d'IA : très fortement pénalisées. */
const CLICHES = [
  "nos coeurs",
  "mon coeur bat",
  "main dans la main",
  "pour toujours",
  "a jamais",
  "ensemble on",
  "briller",
  "s envoler",
  "prendre son envol",
  "nos reves",
  "suivre ses reves",
  "toucher les etoiles",
  "vers les etoiles",
  "la lumiere",
  "l espoir",
  "la flamme",
  "au fond de mon ame",
  "mon ame",
  "liberte",
  "le chemin",
  "l horizon",
  "le destin",
  "l eternite",
  "infini",
  "la magie",
  "magique",
  "ensemble",
  "unis",
  "jamais abandonner",
  "crois en toi",
  "plus fort que tout",
  "la vie est belle",
];

/** Mots abstraits qui ne montrent rien : légèrement pénalisés. */
const VAGUE = [
  "reve",
  "reves",
  "coeur",
  "coeurs",
  "ame",
  "amour",
  "bonheur",
  "joie",
  "sourire",
  "sourires",
  "ciel",
  "etoile",
  "etoiles",
  "voyage",
  "avenir",
  "force",
  "courage",
  "paix",
  "harmonie",
  "emotion",
  "emotions",
  "souvenirs",
  "moment",
  "instant",
  "beaute",
  "merveilleux",
  "incroyable",
];

/** Mots français très courants : servent à savoir si les paroles sont en français. */
const FRENCH = new Set(
  "le la les un une des de du et je tu il elle on nous vous ils elles ne pas que qui dans sur avec pour mais ou mon ma mes ton ta tes son sa ses ce cette est suis es sont ai as a au aux en y me te se plus tout comme quand".split(" "),
);

export const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Les vers chantés, groupés par partie ([Couplet], [Refrain]…). Les balises ne comptent pas. */
export function lyricSections(lyrics: string): string[][] {
  const sections: string[][] = [[]];
  for (const raw of lyrics.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line) || !line) {
      if (sections[sections.length - 1].length) sections.push([]);
      continue;
    }
    sections[sections.length - 1].push(line);
  }
  return sections.filter((s) => s.length);
}

/** Part de mots français courants : au-dessus de 0,2, les paroles sont en français. */
export function frenchShare(lyrics: string): number {
  const words = normalizeText(lyrics).split(" ").filter(Boolean);
  if (!words.length) return 0;
  return words.filter((w) => FRENCH.has(w)).length / words.length;
}

/** Nombre de syllabes chantées, à peu près (groupes de voyelles, « e » muet final ôté). */
export function syllables(line: string): number {
  let count = 0;
  for (const word of normalizeText(line).split(" ").filter(Boolean)) {
    const groups = word.match(/[aeiouy]+/g)?.length ?? 0;
    const muteE = groups > 1 && /[^aeiouy](e|es|ent)$/.test(word);
    count += Math.max(1, groups - (muteE ? 1 : 0));
  }
  return count;
}

/** Fin de vers telle qu'on l'entend : sans lettres muettes finales ni « e » muet. */
export function rhymeTail(line: string): string {
  const words = normalizeText(line).split(" ").filter(Boolean);
  let word = words[words.length - 1] ?? "";
  word = word.replace(/(ent|es|e|s|t|x|d|p)$/, "");
  word = word.replace(/(e|s|t|x|d)$/, "");
  return word;
}

/** Nombre de lettres communes à la fin de deux vers (0 = pas de rime). Même dernier mot : -1. */
export function rhymeStrength(a: string, b: string): number {
  const lastA = normalizeText(a).split(" ").pop() ?? "";
  const lastB = normalizeText(b).split(" ").pop() ?? "";
  if (lastA && lastA === lastB) return -1;
  const x = rhymeTail(a);
  const y = rhymeTail(b);
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}

function countPhrase(text: string, phrase: string): number {
  let count = 0;
  let from = 0;
  const padded = ` ${text} `;
  const needle = ` ${phrase} `;
  for (;;) {
    const at = padded.indexOf(needle, from);
    if (at < 0) return count;
    count++;
    from = at + needle.length - 1;
  }
}

export type LyricScore = {
  score: number;
  cliches: number;
  vague: number;
  /** Lettres communes en moyenne à la meilleure rime de chaque vers (0 à 4). */
  rhyme: number;
  /** Écart moyen de syllabes entre les vers d'une même partie. */
  unevenness: number;
  /** Vers qui riment avec le même mot. */
  selfRhymes: number;
};

/** Note des paroles : plus elle est haute, plus elles sonnent comme une vraie chanson. */
export function scoreLyrics(lyrics: string): LyricScore {
  const sections = lyricSections(lyrics);
  // Un refrain répété mot pour mot ne compte qu'une fois (la répétition est voulue).
  const seen = new Set<string>();
  const unique = sections.filter((s) => {
    const id = s.map(normalizeText).join("|");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const text = unique.flat().map(normalizeText).join(" ");

  const cliches = CLICHES.reduce((sum, phrase) => sum + countPhrase(text, phrase), 0);
  const vague = VAGUE.reduce((sum, word) => sum + countPhrase(text, word), 0);

  let rhymeTotal = 0;
  let rhymeLines = 0;
  let selfRhymes = 0;
  let uneven = 0;
  let unevenLines = 0;
  for (const section of unique) {
    for (let i = 0; i < section.length; i++) {
      let best = 0;
      for (const j of [i - 2, i - 1, i + 1, i + 2]) {
        if (j < 0 || j >= section.length) continue;
        const strength = rhymeStrength(section[i], section[j]);
        if (strength < 0 && j > i) selfRhymes++;
        best = Math.max(best, strength);
      }
      rhymeTotal += Math.min(best, 4);
      rhymeLines++;
    }
    const counts = section.map(syllables);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    for (const c of counts) uneven += Math.abs(c - mean);
    unevenLines += counts.length;
  }
  const rhyme = rhymeLines ? rhymeTotal / rhymeLines : 0;
  const unevenness = unevenLines ? uneven / unevenLines : 0;
  const words = Math.max(1, text.split(" ").length);

  // Clichés et mots vagues comptés pour 100 mots : une chanson plus longue n'est pas punie.
  const score = 10 + rhyme * 2.5 - (cliches * 300) / words - (vague * 60) / words - Math.min(unevenness, 6) * 0.8 - selfRhymes * 1.5;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { score: round(score), cliches, vague, rhyme: round(rhyme), unevenness: round(unevenness), selfRhymes };
}
