/**
 * Annulation d'une commande de repas : possible chez BTM jusqu'à 4 h avant le
 * début de la préparation (placedAt), remboursée tout de suite sur le moyen de
 * paiement utilisé. Après, BTM ne peut plus l'annuler : il faut voir
 * directement avec le restaurant partenaire.
 */

/** Délai minimal entre l'annulation et le début de la préparation. */
export const CANCEL_LEAD_MS = 4 * 3600_000;

/** Dernier instant où l'annulation est possible chez BTM. */
export const cancelDeadline = (placedAt: string) => Date.parse(placedAt) - CANCEL_LEAD_MS;

/** Vrai tant que la commande peut encore être annulée et remboursée par BTM. */
export const canCancel = (order: { placedAt: string; cancelled?: boolean }, now = Date.now()) =>
  !order.cancelled && now < cancelDeadline(order.placedAt);

/** Message affiché quand le délai est passé. */
export const tooLateMessage = (restaurant: string) =>
  `L'annulation n'est plus possible chez BTM : la préparation commence dans moins de 4 h. Contacte directement ${restaurant}.`;
