import { z } from "zod";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";
import { AMBIENCES, EFFECTS, MOOD_IDS, type Ambience, type Effect, type Mood } from "./bank";
import { BUILTIN_CATALOG, playableSounds, usableSounds, type CatalogSound, type PlayableSounds } from "./catalog";

/**
 * Script de scène d'une page lue par Tamilya : qui parle, avec quelle voix, d'où vient sa voix,
 * et les bruits autour. Écrit par Gemini (/api/lecture), vérifié ici, joué par soundscape.ts.
 *
 * Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière.
 */

/** Bruits de fond qui durent toute la page, et bruits courts à un moment précis : voir bank.ts. */
export { AMBIENCES, EFFECTS, MOOD_IDS, type Ambience, type Effect, type Mood };

/** Changement de musique à une réplique : une autre ambiance, ou « silence » (la musique s'arrête). */
export const MUSIC_CHANGES = [...MOOD_IDS, "silence"] as const;
export type MusicChange = Mood | "silence";

export const DISTANCES = ["tout-pres", "pres", "loin", "tres-loin"] as const;
export type Distance = (typeof DISTANCES)[number];
/** Hauteur d'un son : le tonnerre en haut, des pas dans l'escalier en dessous. */
export const HEIGHTS = ["haut", "milieu", "bas"] as const;
export type Height = (typeof HEIGHTS)[number];
/** Lieu de la scène : il donne l'écho (une grotte résonne, une plage non). */
export const PLACES = ["plein-air", "plage", "foret", "rue", "maison", "petite-piece", "grande-salle", "mosquee", "grotte", "bateau"] as const;
export type ScenePlace = (typeof PLACES)[number];

export const NARRATOR = "narratrice";

export const READING_LIMITS = { lines: 60, lineChars: 600, characters: 8, ambiences: 4, effectsPerLine: 3, waypoints: 4 } as const;
/** Livre : personnages gardés en mémoire d'un morceau à l'autre (avec leur voix). */
export const BOOK_CAST = 16;

/** Un son est un identifiant ; il n'est gardé que s'il est dans le catalogue du moment (catalog.ts). */
const soundId = z.string().trim().min(1).max(40);

const angle = z.coerce.number().transform((n) => (Number.isFinite(n) ? Math.max(-180, Math.min(180, Math.round(n))) : 0));
const distance = z.enum(DISTANCES).catch("pres");
const height = z.enum(HEIGHTS).nullish().catch(null);

/** Un point de passage : la voix ou le bruit passe par là pendant qu'il sonne. */
const pointSchema = z.object({ cote: angle.catch(0), distance: distance.optional().default("pres"), hauteur: height });
const trajet = z.array(pointSchema.nullable().catch(null)).max(10).catch([]).optional().default([]);

const effectSchema = z.object({
  son: soundId,
  quand: z.enum(["avant", "pendant", "apres"]).catch("pendant"),
  cote: angle.catch(0),
  vers: angle.nullish().catch(null),
  /** Points de passage entre le départ (cote) et l'arrivée (vers) : un scooter qui passe tout près puis repart loin. */
  trajet,
  distance: distance.optional().default("pres"),
  hauteur: height,
});

const lineSchema = z.object({
  qui: z.string().trim().min(1).max(40),
  texte: z.string().trim().min(1).max(READING_LIMITS.lineChars),
  cote: angle.catch(0),
  distance: distance.optional().default("pres"),
  hauteur: height,
  /** La voix arrive d'ailleurs et se déplace jusqu'à sa place (quelqu'un qui s'approche, qui passe). */
  depuis: z.object({ cote: angle.catch(0), distance: distance.optional().default("loin"), hauteur: height }).nullish().catch(null),
  /** Points de passage pendant la réplique, avant d'arriver à sa place (quelqu'un qui tourne autour, qui fait les cent pas). */
  trajet,
  /** Narratrice seulement : elle imite un bruit (« toc, toc, toc ») et sa voix vient de l'endroit du bruit. */
  bruitage: z.boolean().catch(false).optional().default(false),
  bruits: z.array(effectSchema.nullable().catch(null)).max(10).catch([]).optional().default([]),
  /** La musique change à partir de cette réplique (rare) ; null : elle continue. */
  musique: soundId.nullish().catch(null),
});

const characterSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nom: z.string().trim().max(60).catch(""),
  genre: z.enum(["homme", "femme"]).catch("homme"),
  age: z.enum(["enfant", "jeune", "adulte", "vieux"]).catch("adulte"),
});

const ambienceSchema = z.object({
  son: soundId,
  cote: angle.catch(0),
  distance: distance.optional().default("loin"),
  hauteur: height,
  volume: z.coerce.number().min(0).max(1).catch(0.5),
  /** Le bruit tourne lentement autour de la tête (le vent qui passe). */
  bouge: z.boolean().catch(false),
});

export const rawScriptSchema = z.object({
  lisible: z.boolean().catch(true),
  raison: z.string().max(300).nullish().catch(null),
  titre: z.string().trim().max(120).catch(""),
  lieu: z.enum(PLACES).catch("plein-air"),
  intro: z.string().trim().max(400).catch(""),
  /** Après l'histoire : Tamilya prend des nouvelles de la personne (puis l'écoute 4 s). */
  fin: z.string().trim().max(300).catch("").optional().default(""),
  /** Livre lu en continu : où on en est, transmis au morceau suivant (prompt.ts). */
  resume: z.string().trim().max(1200).catch("").optional().default(""),
  /** Musique de fond du début ; null : pas de musique. */
  musique: soundId.nullish().catch(null),
  decor: z.array(ambienceSchema.nullable().catch(null)).max(10).catch([]).optional().default([]),
  personnages: z.array(characterSchema.nullable().catch(null)).max(20).catch([]).optional().default([]),
  repliques: z.array(lineSchema.nullable().catch(null)).max(200).catch([]).optional().default([]),
});

/** Une place autour de la tête (angle, distance, hauteur). */
export type Waypoint = { side: number; distance: Distance; height: Height };
/** path : les places où passe le bruit après son départ ; la dernière est son arrivée (vide : il ne bouge pas). */
export type SoundCue = { sound: Effect; when: "avant" | "pendant" | "apres"; from: number; to: number | null; distance: Distance; height: Height; path: Waypoint[] };
export type SceneLine = {
  /** null : la narratrice (la voix choisie par BTM pour Tamilya). */
  voice: GeminiVoiceId | null;
  speaker: string;
  text: string;
  side: number;
  distance: Distance;
  height: Height;
  from: Waypoint | null;
  /** Places traversées pendant la réplique, avant d'arriver à sa place (side, distance, height). */
  path: Waypoint[];
  /** La narratrice imite un bruit : sa voix sort de l'endroit du bruit, pas du milieu de la tête. */
  placed: boolean;
  cues: SoundCue[];
  /** La musique change avant cette réplique ; null : elle continue. */
  music: MusicChange | null;
};
export type SceneAmbience = { sound: Ambience; side: number; distance: Distance; height: Height; volume: number; moving: boolean };
export type SceneScript = {
  title: string;
  place: ScenePlace;
  intro: string;
  outro: string;
  music: Mood | null;
  ambiences: SceneAmbience[];
  lines: SceneLine[];
  /** Sons branchés dans /admin/sons, avec leur adresse : le téléphone les joue d'après cette liste. */
  sons?: PlayableSounds;
  /** Livre : les personnages et leur voix, et où on en est, pour le morceau suivant. */
  cast?: KnownCharacter[];
  summary?: string;
};

/** Personnage déjà entendu dans un livre : il garde sa voix jusqu'à la fin. */
export type KnownCharacter = { id: string; nom: string; genre: "homme" | "femme"; age: "enfant" | "jeune" | "adulte" | "vieux"; voix: GeminiVoiceId };

/** Sons utilisables de l'histoire, rangés par sorte. */
type SoundSet = { decors: Map<string, CatalogSound>; bruits: Map<string, CatalogSound>; musiques: Map<string, CatalogSound>; playable: PlayableSounds };

function soundSet(catalog: CatalogSound[]): SoundSet {
  const usable = usableSounds(catalog);
  const of = (kind: CatalogSound["kind"]) => new Map(usable.filter((s) => s.kind === kind).map((s) => [s.id, s]));
  return { decors: of("decor"), bruits: of("bruit"), musiques: of("musique"), playable: playableSounds(catalog) };
}

export type ScriptResult = { ok: true; script: SceneScript } | { ok: false; reason: string };

/**
 * Voix des personnages, de la plus jeune à la plus mûre. La narratrice garde la voix de Tamilya ;
 * chaque personnage reçoit une voix différente des autres et de la sienne.
 */
const VOICE_POOLS: Record<"homme" | "femme", Record<"enfant" | "jeune" | "adulte" | "vieux", GeminiVoiceId[]>> = {
  homme: {
    enfant: ["Puck", "Fenrir", "Sadachbia"],
    jeune: ["Fenrir", "Sadachbia", "Puck", "Achird"],
    adulte: ["Orus", "Achird", "Iapetus", "Algieba", "Umbriel"],
    vieux: ["Charon", "Algieba", "Umbriel", "Orus"],
  },
  femme: {
    enfant: ["Laomedeia", "Despina", "Zephyr"],
    jeune: ["Aoede", "Despina", "Zephyr", "Autonoe"],
    adulte: ["Kore", "Erinome", "Pulcherrima", "Callirrhoe", "Sulafat"],
    vieux: ["Gacrux", "Vindemiatrix", "Sulafat", "Achernar"],
  },
};

export function assignVoices(
  characters: { id: string; genre: "homme" | "femme"; age: "enfant" | "jeune" | "adulte" | "vieux" }[],
  narrator: GeminiVoiceId,
  known: ReadonlyMap<string, GeminiVoiceId> = new Map(),
) {
  // Déjà entendus plus tôt dans le livre : même voix ; les nouveaux en prennent une autre.
  const taken = new Set<GeminiVoiceId>([narrator, ...known.values()]);
  const voices = new Map<string, GeminiVoiceId>();
  for (const character of characters) {
    const kept = known.get(character.id);
    if (kept) {
      voices.set(character.id, kept);
      continue;
    }
    const pool = VOICE_POOLS[character.genre][character.age];
    const all = [...pool, ...Object.values(VOICE_POOLS[character.genre]).flat()];
    const voice = all.find((v) => !taken.has(v)) ?? pool[0];
    taken.add(voice);
    voices.set(character.id, voice);
  }
  return voices;
}

/** Début du script, sans les répliques : de quoi lancer le décor et la voix de Tamilya. */
export type SceneMeta = Omit<SceneScript, "lines">;
/** Distribution : voix et noms des personnages, pour ranger chaque réplique dès qu'elle arrive. */
export type Cast = { voices: Map<string, GeminiVoiceId>; names: Map<string, string>; sounds: SoundSet };
export type MetaResult = { ok: true; meta: SceneMeta; cast: Cast } | { ok: false; reason: string };

const UNREADABLE = "Je n'arrive pas à lire cette page. Reprends la photo bien à plat, avec de la lumière.";

/** Titre, lieu, intro, décor et distribution (tout ce qui vient avant les répliques). */
export function buildMeta(raw: unknown, narrator: GeminiVoiceId, catalog: CatalogSound[] = BUILTIN_CATALOG, known: KnownCharacter[] = []): MetaResult {
  const sounds = soundSet(catalog);
  const parsed = rawScriptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Je n'ai pas réussi à préparer cette page. Réessaie." };
  const data = parsed.data;
  if (!data.lisible) return { ok: false, reason: data.raison?.trim() || UNREADABLE };
  const characters = data.personnages
    .filter((c): c is NonNullable<typeof c> => c !== null && c.id !== NARRATOR)
    .slice(0, READING_LIMITS.characters);
  const voices = assignVoices(characters, narrator, new Map(known.map((c) => [c.id, c.voix])));
  const names = new Map(characters.map((c) => [c.id, c.nom || c.id]));
  // Livre : les anciens personnages restent connus même s'ils ne parlent pas ici (les plus récents d'abord).
  const cast: KnownCharacter[] = [
    ...characters.map((c) => ({ id: c.id, nom: c.nom, genre: c.genre, age: c.age, voix: voices.get(c.id)! })),
    ...known.filter((k) => !voices.has(k.id)),
  ].slice(0, BOOK_CAST);
  const ambiences: SceneAmbience[] = data.decor
    .filter((a): a is NonNullable<typeof a> => a !== null && sounds.decors.has(a.son))
    .filter((a, i, all) => all.findIndex((b) => b.son === a.son) === i)
    .slice(0, READING_LIMITS.ambiences)
    .map((a) => ({ sound: a.son, side: a.cote, distance: a.distance, height: a.hauteur ?? sounds.decors.get(a.son)?.height ?? "milieu", volume: a.volume, moving: a.bouge }));
  const music = data.musique && sounds.musiques.has(data.musique) ? data.musique : null;
  return {
    ok: true,
    meta: {
      title: data.titre,
      place: data.lieu,
      intro: data.intro,
      outro: data.fin,
      music,
      ambiences,
      sons: sounds.playable,
      ...(known.length || data.resume ? { cast, summary: data.resume } : {}),
    },
    // Un ancien personnage qui reparle sans avoir été redéclaré garde quand même sa voix.
    cast: {
      voices: new Map([...known.map((k) => [k.id, k.voix] as const), ...voices]),
      names: new Map([...known.map((k) => [k.id, k.nom || k.id] as const), ...names]),
      sounds,
    },
  };
}

function waypoints(raw: ({ cote: number; distance: Distance; hauteur?: Height | null } | null)[], fallback: Height): Waypoint[] {
  return raw
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .slice(0, READING_LIMITS.waypoints)
    .map((p) => ({ side: p.cote, distance: p.distance, height: p.hauteur ?? fallback }));
}

/** Côté net d'un son répété qui part du milieu (gauche d'abord, comme on lit). */
const SIDE = 70;

/**
 * Un même bruit immobile répété dans une réplique (« toc », « toc ») ne revient jamais au même
 * endroit à la suite : il passe de l'autre côté, comme en binaural ou en musique. Un bruit
 * qui voyage garde son trajet.
 */
export function alternateRepeats(cues: SoundCue[]): SoundCue[] {
  // Pour chaque bruit : où Gemini l'avait mis la dernière fois, et où il a vraiment sonné.
  const last = new Map<string, { asked: number; played: number }>();
  const still = (cue: SoundCue) => cue.to === null && cue.path.length === 0;
  return cues.map((cue) => {
    if (!still(cue)) return cue;
    const before = last.get(cue.sound);
    let from = cue.from;
    if (before && (Math.abs(cue.from - before.asked) < 45 || Math.abs(cue.from - before.played) < 45)) {
      // Même endroit que le précédent : de l'autre côté.
      from = Math.abs(before.played) < 30 ? SIDE : -before.played;
    } else if (!before && Math.abs(from) < 30 && cues.filter((c) => c.sound === cue.sound && still(c)).length > 1) {
      // Premier d'une série qui part du milieu : à gauche, le suivant ira à droite.
      from = -SIDE;
    }
    last.set(cue.sound, { asked: cue.from, played: from });
    return from === cue.from ? cue : { ...cue, from };
  });
}

/** Une réplique, rangée dès qu'elle arrive. Null si elle est mal formée ou vide. */
export function buildLine(raw: unknown, cast: Cast): SceneLine | null {
  const parsed = lineSchema.safeParse(raw);
  if (!parsed.success) return null;
  const line = parsed.data;
  const voice = line.qui === NARRATOR ? null : (cast.voices.get(line.qui) ?? null);
  // La narratrice parle tout près, au milieu (c'est elle qui tient le livre), sauf quand elle imite un bruit.
  const moves = voice !== null || line.bruitage;
  const height = line.hauteur ?? "milieu";
  return {
    voice,
    speaker: voice ? (cast.names.get(line.qui) ?? line.qui) : "Tamilya",
    text: line.texte,
    side: moves ? line.cote : 0,
    distance: moves ? line.distance : "tout-pres",
    height: moves ? height : "milieu",
    from: moves && line.depuis ? { side: line.depuis.cote, distance: line.depuis.distance, height: line.depuis.hauteur ?? height } : null,
    path: moves ? waypoints(line.trajet, height) : [],
    placed: voice === null && line.bruitage,
    cues: alternateRepeats(
      line.bruits
        .filter((c): c is NonNullable<typeof c> => c !== null && cast.sounds.bruits.has(c.son))
        .slice(0, READING_LIMITS.effectsPerLine)
        .map((c) => {
          const cueHeight = c.hauteur ?? cast.sounds.bruits.get(c.son)?.height ?? "milieu";
          const via = waypoints(c.trajet, cueHeight);
          const end = c.vers === null || c.vers === undefined ? [] : [{ side: c.vers, distance: via.at(-1)?.distance ?? c.distance, height: cueHeight }];
          return { sound: c.son, when: c.quand, from: c.cote, to: c.vers ?? null, distance: c.distance, height: cueHeight, path: [...via, ...end] };
        }),
    ),
    music: line.musique === "silence" || (line.musique && cast.sounds.musiques.has(line.musique)) ? line.musique : null,
  };
}

/** Vérifie et range la réponse complète de Gemini. Ce qui est mal formé est écarté, pas deviné. */
export function buildScript(raw: unknown, narrator: GeminiVoiceId, catalog: CatalogSound[] = BUILTIN_CATALOG, known: KnownCharacter[] = []): ScriptResult {
  const meta = buildMeta(raw, narrator, catalog, known);
  if (!meta.ok) return meta;
  const rawLines = raw && typeof raw === "object" && Array.isArray((raw as { repliques?: unknown }).repliques) ? (raw as { repliques: unknown[] }).repliques : [];
  const lines = rawLines
    .map((line) => buildLine(line, meta.cast))
    .filter((line): line is SceneLine => line !== null)
    .slice(0, READING_LIMITS.lines);
  if (!lines.length) return { ok: false, reason: UNREADABLE };
  return { ok: true, script: { ...meta.meta, lines } };
}
