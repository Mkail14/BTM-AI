/**
 * Registre des histoires racontées dans le grand globe (lecture en 3D).
 *
 * L'histoire vit ici, hors de la conversation : quand la réponse de Tamilya finit de s'écrire, le
 * message est redessiné et sa carte recréée ; avant, la carte emportait l'histoire avec elle (le
 * son s'arrêtait et le lecteur réapparaissait avec son bouton). Le moteur (story-engine.ts) n'est
 * chargé qu'à la première histoire. Module côté navigateur uniquement.
 */

export type StorySource = { text: string } | { story: string } | { photo: File };

export type StoryView = {
  key: string;
  /** ready : prête, mais le navigateur attend un toucher pour lancer le son. */
  status: "preparing" | "ready" | "playing" | "paused" | "done" | "error";
  title: string;
  message?: string;
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
  patchStory(key, { status: "preparing", message: undefined }, true);
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
