import { supabaseUrl } from "@/lib/supabase/config";
import { BEDS, MOODS, RECORDED, LIGHT_MOODS, SCARY_SOUNDS, SHOTS, musicUrl, soundUrl } from "./bank";
import { SYNTHESIZED } from "./sounds";

/**
 * Catalogue des sons de Tamilya, réglable depuis /admin/sons sans toucher au code.
 * Les sons d'origine (bank.ts, public/sons et public/musique) sont la base ; le fichier
 * catalogue.json du stockage Supabase (dossier « lecture-sons ») garde ce que l'admin a changé
 * (débranché, renommé, fichier remplacé) et les sons ajoutés. Sans ce fichier, rien ne change.
 */

export type SoundKind = "decor" | "bruit" | "musique";
export type SoundHeight = "haut" | "milieu" | "bas";

/** Ce qui est gardé pour un son dans catalogue.json (seulement ce qui diffère de l'origine pour un son d'origine). */
export type StoredSound = {
  kind?: SoundKind;
  name?: string;
  active?: boolean;
  height?: SoundHeight | null;
  width?: number | null;
  scary?: boolean;
  light?: boolean;
  /** Chemin du fichier dans le stockage ; null ou absent : le fichier d'origine. */
  file?: string | null;
};
export type StoredCatalog = { sons: Record<string, StoredSound> };

export type CatalogSound = {
  id: string;
  kind: SoundKind;
  /** Ce que c'est : lu par Gemini pour choisir le son. */
  name: string;
  active: boolean;
  height: SoundHeight | null;
  /** Décor : largeur en degrés autour de la tête (360 : tout autour). */
  width: number | null;
  /** Fait peur : écarté des histoires légères. */
  scary: boolean;
  /** Musique légère : le décor reste plus discret dessous, les sons qui font peur sont écartés. */
  light: boolean;
  file: string | null;
  builtin: boolean;
  /** Son d'origine changé dans /admin/sons (on peut le remettre comme avant). */
  changed: boolean;
  /** Adresse du fichier ; null : seulement la version fabriquée par le téléphone. */
  url: string | null;
  /** Le téléphone sait le fabriquer s'il n'a pas de fichier. */
  synth: boolean;
};

/** Ce que le téléphone reçoit au début de chaque histoire pour jouer les sons. */
export type PlayableSound = { kind: SoundKind; url: string | null; width?: number; scary?: true; light?: true };
export type PlayableSounds = Record<string, PlayableSound>;

export const SOUND_BUCKET = "lecture-sons";
export const CATALOG_FILE = "catalogue.json";
export const SOUND_ID = /^[a-z0-9][a-z0-9-]{1,29}$/;
export const SOUND_MAX_BYTES = 3_000_000;

export const storageUrl = (path: string) => `${supabaseUrl}/storage/v1/object/public/${SOUND_BUCKET}/${path}`;

function builtins(): CatalogSound[] {
  const synth = new Set<string>(SYNTHESIZED);
  const base = { active: true, file: null, builtin: true, changed: false, light: false };
  return [
    ...Object.entries(BEDS).map(([id, bed]) => ({
      ...base,
      id,
      kind: "decor" as const,
      name: bed.name,
      height: ("height" in bed ? bed.height : null) as SoundHeight | null,
      width: bed.width as number,
      scary: SCARY_SOUNDS.has(id),
      url: RECORDED.has(id) ? soundUrl(id) : null,
      synth: synth.has(id),
    })),
    ...Object.entries(SHOTS).map(([id, shot]) => ({
      ...base,
      id,
      kind: "bruit" as const,
      name: shot.name,
      height: ("height" in shot ? shot.height : null) as SoundHeight | null,
      width: null,
      scary: SCARY_SOUNDS.has(id),
      url: RECORDED.has(id) ? soundUrl(id) : null,
      synth: synth.has(id),
    })),
    ...Object.entries(MOODS).map(([id, name]) => ({
      ...base,
      id,
      kind: "musique" as const,
      name,
      height: null,
      width: null,
      scary: false,
      light: LIGHT_MOODS.has(id),
      url: musicUrl(id),
      synth: false,
    })),
  ];
}

/** Sons d'origine et changements de l'admin, mélangés. Un son ajouté sans type ni fichier est écarté. */
export function mergeCatalog(stored: StoredCatalog | null): CatalogSound[] {
  const changes = stored?.sons ?? {};
  const list = builtins().map((sound) => {
    const change = changes[sound.id];
    if (!change) return sound;
    const file = change.file ?? null;
    return {
      ...sound,
      changed: true,
      name: change.name?.trim() || sound.name,
      active: change.active ?? sound.active,
      height: change.height === undefined ? sound.height : change.height,
      width: sound.kind === "decor" ? (change.width ?? sound.width) : null,
      scary: change.scary ?? sound.scary,
      light: change.light ?? sound.light,
      file,
      url: file ? storageUrl(file) : sound.url,
    };
  });
  const known = new Set(list.map((s) => s.id));
  for (const [id, change] of Object.entries(changes)) {
    if (known.has(id) || !SOUND_ID.test(id) || !change.kind || !change.file || !change.name?.trim()) continue;
    list.push({
      id,
      kind: change.kind,
      name: change.name.trim(),
      active: change.active ?? true,
      height: change.height ?? null,
      width: change.kind === "decor" ? (change.width ?? 120) : null,
      scary: change.scary ?? false,
      light: change.light ?? false,
      file: change.file,
      builtin: false,
      changed: false,
      url: storageUrl(change.file),
      synth: false,
    });
  }
  return list;
}

/** Sons que Tamilya peut utiliser : branchés, et avec un fichier ou une version fabriquée. */
export const usableSounds = (catalog: CatalogSound[]) => catalog.filter((s) => s.active && (s.url !== null || s.synth));

export function playableSounds(catalog: CatalogSound[]): PlayableSounds {
  const out: PlayableSounds = {};
  for (const s of usableSounds(catalog)) {
    out[s.id] = {
      kind: s.kind,
      url: s.url,
      ...(s.kind === "decor" && s.width ? { width: s.width } : {}),
      ...(s.scary ? { scary: true as const } : {}),
      ...(s.light ? { light: true as const } : {}),
    };
  }
  return out;
}

/** Les sons d'origine, sans rien de l'admin (si le stockage ne répond pas). */
export const BUILTIN_CATALOG: CatalogSound[] = mergeCatalog(null);
