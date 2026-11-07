import { z } from "zod";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";

/**
 * Script de scène d'une page lue par Tamilya : qui parle, avec quelle voix, d'où vient sa voix,
 * et les bruits autour. Écrit par Gemini (/api/lecture), vérifié ici, joué par soundscape.ts.
 *
 * Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière.
 */

/** Bruits de fond qui durent toute la page (fabriqués par le téléphone, rien à télécharger). */
export const AMBIENCES = ["vent", "pluie", "vagues", "riviere", "feu", "nuit", "oiseaux", "foret"] as const;
/** Bruits courts, à un moment précis. */
export const EFFECTS = ["tonnerre", "pas", "coeur", "rafale", "frappe", "eclaboussure", "galop"] as const;
export type Ambience = (typeof AMBIENCES)[number];
export type Effect = (typeof EFFECTS)[number];

export const DISTANCES = ["tout-pres", "pres", "loin"] as const;
export type Distance = (typeof DISTANCES)[number];
/** Hauteur d'un son : le tonnerre en haut, des pas dans l'escalier en dessous. */
export const HEIGHTS = ["haut", "milieu", "bas"] as const;
export type Height = (typeof HEIGHTS)[number];
/** Lieu de la scène : il donne l'écho (une grotte résonne, une plage non). */
export const PLACES = ["plein-air", "plage", "foret", "rue", "maison", "petite-piece", "grande-salle", "mosquee", "grotte", "bateau"] as const;
export type ScenePlace = (typeof PLACES)[number];

export const NARRATOR = "narratrice";

export const READING_LIMITS = { lines: 60, lineChars: 600, characters: 8, ambiences: 4, effectsPerLine: 3 } as const;

const angle = z.coerce.number().transform((n) => (Number.isFinite(n) ? Math.max(-180, Math.min(180, Math.round(n))) : 0));
const distance = z.enum(DISTANCES).catch("pres");
const height = z.enum(HEIGHTS).nullish().catch(null);

const effectSchema = z.object({
  son: z.enum(EFFECTS),
  quand: z.enum(["avant", "pendant", "apres"]).catch("pendant"),
  cote: angle.catch(0),
  vers: angle.nullish().catch(null),
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
  bruits: z.array(effectSchema.nullable().catch(null)).max(10).catch([]).optional().default([]),
});

const characterSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nom: z.string().trim().max(60).catch(""),
  genre: z.enum(["homme", "femme"]).catch("homme"),
  age: z.enum(["enfant", "jeune", "adulte", "vieux"]).catch("adulte"),
});

const ambienceSchema = z.object({
  son: z.enum(AMBIENCES),
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
  decor: z.array(ambienceSchema.nullable().catch(null)).max(10).catch([]).optional().default([]),
  personnages: z.array(characterSchema.nullable().catch(null)).max(20).catch([]).optional().default([]),
  repliques: z.array(lineSchema.nullable().catch(null)).max(200).catch([]).optional().default([]),
});

export type SoundCue = { sound: Effect; when: "avant" | "pendant" | "apres"; from: number; to: number | null; distance: Distance; height: Height };
export type SceneLine = {
  /** null : la narratrice (la voix choisie par BTM pour Tamilya). */
  voice: GeminiVoiceId | null;
  speaker: string;
  text: string;
  side: number;
  distance: Distance;
  height: Height;
  from: { side: number; distance: Distance; height: Height } | null;
  cues: SoundCue[];
};
export type SceneAmbience = { sound: Ambience; side: number; distance: Distance; height: Height; volume: number; moving: boolean };
export type SceneScript = { title: string; place: ScenePlace; intro: string; outro: string; ambiences: SceneAmbience[]; lines: SceneLine[] };

/** Hauteur par défaut d'un bruit quand Gemini ne la donne pas. */
const DEFAULT_HEIGHT: Partial<Record<Ambience | Effect, Height>> = { tonnerre: "haut", pluie: "haut", oiseaux: "haut", pas: "bas", eclaboussure: "bas", galop: "bas" };

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

export function assignVoices(characters: { id: string; genre: "homme" | "femme"; age: "enfant" | "jeune" | "adulte" | "vieux" }[], narrator: GeminiVoiceId) {
  const taken = new Set<GeminiVoiceId>([narrator]);
  const voices = new Map<string, GeminiVoiceId>();
  for (const character of characters) {
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
export type Cast = { voices: Map<string, GeminiVoiceId>; names: Map<string, string> };
export type MetaResult = { ok: true; meta: SceneMeta; cast: Cast } | { ok: false; reason: string };

const UNREADABLE = "Je n'arrive pas à lire cette page. Reprends la photo bien à plat, avec de la lumière.";

/** Titre, lieu, intro, décor et distribution (tout ce qui vient avant les répliques). */
export function buildMeta(raw: unknown, narrator: GeminiVoiceId): MetaResult {
  const parsed = rawScriptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Je n'ai pas réussi à préparer cette page. Réessaie." };
  const data = parsed.data;
  if (!data.lisible) return { ok: false, reason: data.raison?.trim() || UNREADABLE };
  const characters = data.personnages
    .filter((c): c is NonNullable<typeof c> => c !== null && c.id !== NARRATOR)
    .slice(0, READING_LIMITS.characters);
  const voices = assignVoices(characters, narrator);
  const names = new Map(characters.map((c) => [c.id, c.nom || c.id]));
  const ambiences: SceneAmbience[] = data.decor
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .filter((a, i, all) => all.findIndex((b) => b.son === a.son) === i)
    .slice(0, READING_LIMITS.ambiences)
    .map((a) => ({ sound: a.son, side: a.cote, distance: a.distance, height: a.hauteur ?? DEFAULT_HEIGHT[a.son] ?? "milieu", volume: a.volume, moving: a.bouge }));
  return { ok: true, meta: { title: data.titre, place: data.lieu, intro: data.intro, outro: data.fin, ambiences }, cast: { voices, names } };
}

/** Une réplique, rangée dès qu'elle arrive. Null si elle est mal formée ou vide. */
export function buildLine(raw: unknown, cast: Cast): SceneLine | null {
  const parsed = lineSchema.safeParse(raw);
  if (!parsed.success) return null;
  const line = parsed.data;
  const voice = line.qui === NARRATOR ? null : (cast.voices.get(line.qui) ?? null);
  return {
    voice,
    speaker: voice ? (cast.names.get(line.qui) ?? line.qui) : "Tamilya",
    text: line.texte,
    // La narratrice parle tout près, devant : c'est elle qui tient le livre.
    side: voice ? line.cote : 0,
    distance: voice ? line.distance : "tout-pres",
    height: voice ? (line.hauteur ?? "milieu") : "milieu",
    from: voice && line.depuis ? { side: line.depuis.cote, distance: line.depuis.distance, height: line.depuis.hauteur ?? line.hauteur ?? "milieu" } : null,
    cues: line.bruits
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .slice(0, READING_LIMITS.effectsPerLine)
      .map((c) => ({ sound: c.son, when: c.quand, from: c.cote, to: c.vers ?? null, distance: c.distance, height: c.hauteur ?? DEFAULT_HEIGHT[c.son] ?? "milieu" })),
  };
}

/** Vérifie et range la réponse complète de Gemini. Ce qui est mal formé est écarté, pas deviné. */
export function buildScript(raw: unknown, narrator: GeminiVoiceId): ScriptResult {
  const meta = buildMeta(raw, narrator);
  if (!meta.ok) return meta;
  const rawLines = raw && typeof raw === "object" && Array.isArray((raw as { repliques?: unknown }).repliques) ? (raw as { repliques: unknown[] }).repliques : [];
  const lines = rawLines
    .map((line) => buildLine(line, meta.cast))
    .filter((line): line is SceneLine => line !== null)
    .slice(0, READING_LIMITS.lines);
  if (!lines.length) return { ok: false, reason: UNREADABLE };
  return { ok: true, script: { ...meta.meta, lines } };
}
