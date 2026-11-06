/**
 * Scène du vocal : pendant un appel, le tableau quitte la conversation et s'affiche
 * seul au centre de l'écran, Tamilya floutée derrière. La conversation ne bouge plus
 * pendant qu'elle parle. Le tableau revient à sa place une fois fini.
 *
 * Chaque tableau vit dans un « hôte » (VoiceBoard.tsx) : on déplace cet hôte d'un
 * endroit à l'autre sans que React le recrée, donc rien de ce qui est choisi n'est perdu.
 */

const BOARD = "[data-voice-board]";
const PART = "[data-board-part]";

/** Temps laissé pour voir la confirmation avant de revenir à la conversation. */
export const STAGE_DONE_MS = 1800;

/** Un tableau a fini son travail : commande payée, ticket acheté, place réservée… */
export const BOARD_DONE_EVENT = "tamilya:tableau-fini";

export function boardDone(el: Element | null) {
  el?.dispatchEvent(new CustomEvent(BOARD_DONE_EVENT, { bubbles: true }));
}

/** Tableau combiné : il faut que toutes ses parties soient finies. */
export const allPartsDone = (parts: number, finished: number) => finished >= parts;

const homes = new WeakMap<HTMLElement, HTMLElement>();

export const registerBoard = (host: HTMLElement, home: HTMLElement) => homes.set(host, home);

/** Le dernier tableau passe sur la scène. */
export function showBoard(slot: HTMLElement) {
  const boards = document.querySelectorAll<HTMLElement>(BOARD);
  const board = boards[boards.length - 1];
  if (board) slot.replaceChildren(board);
}

/**
 * Retour à la conversation, sous le dernier message : la discussion a pu continuer
 * pendant que le tableau était au centre, il revient en bas, sous les yeux de la personne.
 */
export function returnBoard(slot: HTMLElement) {
  for (const board of [...slot.children] as HTMLElement[]) {
    const home = homes.get(board);
    if (!home?.isConnected) {
      board.remove();
      continue;
    }
    const messages = [...document.querySelectorAll<HTMLElement>("[data-chat-scroll] article")].filter((el) => !el.closest("[data-voice-board]"));
    const last = messages[messages.length - 1];
    if (last && !last.contains(home) && last.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_PRECEDING) last.after(board);
    else home.appendChild(board);
    board.scrollIntoView({ block: "center" });
  }
}

/**
 * Écoute la fin du tableau affiché et appelle `leave` après un court instant.
 * Renvoie de quoi arrêter d'écouter.
 */
export function onBoardDone(leave: () => void) {
  const finished = new Set<Element>();
  let timer = 0;
  const done = (event: Event) => {
    const target = event.target as Element;
    const part = target.closest(PART);
    if (part) finished.add(part);
    const parts = target.closest(BOARD)?.querySelectorAll(PART).length ?? 0;
    if (parts && !allPartsDone(parts, finished.size)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(leave, STAGE_DONE_MS);
  };
  window.addEventListener(BOARD_DONE_EVENT, done);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener(BOARD_DONE_EVENT, done);
  };
}
