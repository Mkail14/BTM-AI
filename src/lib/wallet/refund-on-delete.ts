/**
 * Suppression d'un compte qui a encore de l'argent sur son portefeuille.
 *
 * Règle de l'utilisateur (2026-11-08) : compte banni, pas de remboursement ;
 * compte non banni, remboursement possible. Le portefeuille disparaît avec le
 * compte (suppression en cascade) : la demande de remboursement part donc par
 * e-mail à l'équipe AVANT la suppression, et la suppression est refusée si cet
 * e-mail ne part pas (sinon la trace de l'argent dû serait perdue).
 */

export type RefundDecision =
  | { kind: "none" }
  /** Compte banni : le solde n'est pas remboursé. */
  | { kind: "forfeit"; balanceCents: number }
  /** Demande de remboursement à envoyer à l'équipe avant de supprimer. */
  | { kind: "request"; balanceCents: number };

export function refundDecision({ balanceCents, demo, bannedUntil, now = Date.now() }: { balanceCents: number; demo: boolean; bannedUntil?: string | null; now?: number }): RefundDecision {
  // Portefeuille de démonstration : argent fictif, rien à rembourser.
  if (demo || !Number.isFinite(balanceCents) || balanceCents <= 0) return { kind: "none" };
  const banned = Boolean(bannedUntil) && Date.parse(String(bannedUntil)) > now;
  return banned ? { kind: "forfeit", balanceCents } : { kind: "request", balanceCents };
}

export const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/** E-mail à l'équipe : tout ce qu'il faut pour rembourser après la suppression. */
export function refundRequestEmail({ userId, email, balanceCents, at }: { userId: string; email: string | null; balanceCents: number; at: Date }) {
  const lines = [
    "Un compte a été supprimé avec de l'argent sur son portefeuille.",
    "",
    `Montant à rembourser : ${euros(balanceCents)}`,
    `Adresse e-mail : ${email ?? "(aucune)"}`,
    `Identifiant du compte : ${userId}`,
    `Date : ${at.toISOString()}`,
    "",
    "Le compte n'était pas banni : le remboursement est dû (règle du 2026-11-08).",
    "Avant de rembourser, vérifier que le compte n'existe plus (la suppression a pu échouer juste après cet e-mail).",
    "Rembourser par Stripe sur les dernières recharges de ce compte (tableau de bord Stripe, recherche par e-mail).",
  ];
  const text = lines.join("\n");
  return {
    subject: `Remboursement à faire : ${euros(balanceCents)} (compte supprimé)`,
    text,
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
  };
}
