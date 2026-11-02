"use client";

/**
 * Notifications de la cloche (en haut à droite de la conversation).
 *
 * Deux sources : l'historique du compte, lu par le serveur (paiements,
 * recharges, demandes de réservation du code : /api/notifications), et les
 * événements vécus sur cet appareil (livreur parti, arrivé, commande reçue,
 * place réservée), gardés ici dans le navigateur.
 *
 * Une notification animée qui s'en va « entre » dans la cloche (flyToBell) :
 * la cloche sonne et sa pastille grossit.
 */

export type AppNotification = {
  id: string;
  emoji: string;
  title: string;
  subtitle?: string;
  /** Date ISO de l'événement. */
  at: string;
  href?: string;
};

const STORE = "btm-notifications";
const SEEN = "btm-notifications-seen";
const MAX_LOCAL = 60;
/** Une notification a été ajoutée, ou la liste a été lue. */
export const NOTIFY_EVENT = "btm-notify";
/** Une notification animée vient d'entrer dans la cloche : elle sonne. */
export const RING_EVENT = "btm-notify-ring";
/** Identifiant de la cloche dans la page (cible de l'envol). */
export const BELL_ID = "btm-bell";

export function readLocal(): AppNotification[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) ?? "[]") as AppNotification[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Ajoute une notification (une seule fois par identifiant). */
export function notify(item: AppNotification) {
  const list = readLocal();
  if (list.some((n) => n.id === item.id)) return;
  localStorage.setItem(STORE, JSON.stringify([item, ...list].slice(0, MAX_LOCAL)));
  window.dispatchEvent(new Event(NOTIFY_EVENT));
}

/** Dernière ouverture de la cloche. Première visite : maintenant (l'ancien historique n'est pas « nouveau »). */
export function lastSeen(): number {
  const raw = localStorage.getItem(SEEN);
  if (raw) return Number(raw) || 0;
  const now = Date.now();
  localStorage.setItem(SEEN, String(now));
  return now;
}

export function markSeen() {
  localStorage.setItem(SEEN, String(Date.now()));
  window.dispatchEvent(new Event(NOTIFY_EVENT));
}

/**
 * Fait entrer un élément dans la cloche : il glisse jusqu'à elle en
 * rétrécissant (classe notif-fly-to-bell), puis la cloche sonne. Sans cloche
 * visible, il s'envole simplement vers le haut. Renvoie la durée de l'envol.
 */
export function flyToBell(el: HTMLElement | null): number {
  const bell = document.getElementById(BELL_ID);
  if (!el || !bell || bell.getClientRects().length === 0) return 0;
  const from = el.getBoundingClientRect();
  const to = bell.getBoundingClientRect();
  el.style.setProperty("--fly-x", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
  el.style.setProperty("--fly-y", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
  el.classList.add("notif-fly-to-bell");
  window.setTimeout(() => window.dispatchEvent(new Event(RING_EVENT)), FLY_MS - 80);
  return FLY_MS;
}

export const FLY_MS = 620;

/* Notifications supprimées par la personne. Celles du serveur (paiements…)
   restent dans l'historique du compte : elles sont seulement masquées sur cet appareil. */
const HIDDEN = "btm-notifications-hidden";
const MAX_HIDDEN = 300;

export function readHidden(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN) ?? "[]") as string[];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

/** Supprime des notifications de la cloche. */
export function dismiss(ids: readonly string[]) {
  if (ids.length === 0) return;
  const hidden = [...ids, ...readHidden()].filter((id, i, all) => all.indexOf(id) === i).slice(0, MAX_HIDDEN);
  localStorage.setItem(HIDDEN, JSON.stringify(hidden));
  localStorage.setItem(STORE, JSON.stringify(readLocal().filter((n) => !ids.includes(n.id))));
  window.dispatchEvent(new Event(NOTIFY_EVENT));
}
