/**
 * Registre des histoires racontées dans le grand globe (lecture en 3D).
 *
 * L'histoire vit ici, hors de la conversation : quand la réponse de Tamilya finit de s'écrire, le
 * message est redessiné et sa carte recréée ; avant, la carte emportait l'histoire avec elle (le
 * son s'arrêtait et le lecteur réapparaissait avec son bouton). Le moteur (story-engine.ts) n'est
 * chargé qu'à la première histoire. Module côté navigateur uniquement.
 */

/** Livre gardé dans le téléphone (book-store.ts) : lu à partir de ce morceau, puis jusqu'au bout. */
export type BookStart = { id: string; chapter: number; chunk: number; from?: number };

/**
 * Livre : la barre sous le globe. Tout est compté en lettres (at : où on en est, total : tout le
 * livre) ; rate : lettres entendues par seconde, pour dire le temps qui reste. parts : début de
 * chaque partie, montrée quand on fait glisser la barre.
 */
export type BookTimeline = { at: number; total: number; rate: number; parts: { title: string; at: number }[] };
export type StorySource = { text: string } | { story: string } | { photo: File } | { book: BookStart };

export type StoryView = {
  key: string;
  /** ready : prête, mais le navigateur attend un toucher pour lancer le son. */
  status: "preparing" | "ready" | "playing" | "paused" | "done" | "error";
  title: string;
  message?: string;
  /** Ce qui se prépare : une histoire inventée, ou un texte / une page à lire. */
  kind?: "histoire" | "lecture";
  /** Sa première voix se fait entendre : le message d'attente sous le globe s'efface. */
  started?: boolean;
  /** Livre : la partie en cours et où on en est (« 3 - La loi… · 12 % »). */
  progress?: string;
  timeline?: BookTimeline;
};

type Snapshot = { active: StoryView | null; stories: ReadonlyMap<string, StoryView> };

let snapshot: Snapshot = { active: null, stories: new Map() };
const listeners = new Set<() => void>();

export function subscribeStories(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getStories = () => snapshot;
const emptySnapshot: Snapshot = { active: null, stories: new Map() };
export const getServerStories = () => emptySnapshot;

/** Met à jour une histoire ; open : c'est elle que montre le globe (false : le globe se ferme). */
export function patchStory(key: string, patch: Partial<StoryView>, open?: boolean) {
  const previous = snapshot.stories.get(key) ?? { key, status: "preparing" as const, title: "" };
  const next = { ...previous, ...patch, key };
  const stories = new Map(snapshot.stories);
  stories.set(key, next);
  const activeKey = open === true ? key : open === false && snapshot.active?.key === key ? null : snapshot.active?.key;
  snapshot = { stories, active: activeKey ? (stories.get(activeKey) ?? null) : null };
  for (const listener of listeners) listener();
}

const engine = () => import("./story-engine");

/** Ouvre le globe et raconte (ou rejoue l'histoire déjà préparée sous cette clé). */
export function playStory(key: string, source: StorySource) {
  // Un livre garde sa barre pendant qu'il se prépare : elle ne saute pas quand on la déplace.
  const timeline = "book" in source ? {} : { timeline: undefined };
  patchStory(key, { status: "preparing", message: undefined, started: false, progress: undefined, kind: "story" in source ? "histoire" : "lecture", ...timeline }, true);
  // Le son doit s'ouvrir pendant le geste de la personne : avant le chargement du moteur.
  unlockAudio();
  void engine().then((m) => m.runStory(key, source));
}

const started = new Set<string>();
/** Une seule fois par histoire, même si la carte de la conversation est recréée. */
export function playStoryOnce(key: string, source: StorySource) {
  if (started.has(key)) return;
  started.add(key);
  playStory(key, source);
}

export function toggleStory() {
  void engine().then((m) => m.toggleStory());
}

/** La barre du livre lâchée à cette position (en lettres) : la lecture reprend là. */
export function seekStory(at: number) {
  unlockAudio();
  void engine().then((m) => m.seekBook(at));
}

export function stopStory() {
  void engine().then((m) => m.stopStory());
}

let sharedContext: AudioContext | null = null;
/** Contexte audio partagé, ouvert (et relancé) au plus tôt. */
export function unlockAudio(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContext();
  void sharedContext.resume().catch(() => {});
  return sharedContext;
}
