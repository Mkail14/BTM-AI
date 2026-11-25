/**
 * ESSAI ADMIN : comment postuler à une offre Emploi Territorial (lu sur la page de l'offre).
 * Code commun au serveur, à /admin/candidatures et à la liste des offres de la conversation.
 */

/** Façon principale de postuler, de la plus simple à la plus lourde. */
export type ApplyWay = "mail" | "site" | "formulaire" | "courrier" | "inconnu";

export type ApplyInfo = {
  way: ApplyWay;
  /** Adresses où envoyer CV et lettre (jamais celles d'Emploi Territorial). */
  emails: string[];
  /** Site de recrutement de l'employeur. */
  links: string[];
  /** Bouton « Déposer ma candidature » d'Emploi Territorial (compte demandeur demandé). */
  form: string | null;
  /** Adresse postale quand il faut écrire par courrier. */
  postal: string | null;
  phone: string | null;
  /** « Informations complémentaires » telles qu'écrites par l'employeur. */
  note: string | null;
};

export const APPLY_LABELS: Record<ApplyWay, string> = {
  mail: "Par mail",
  site: "Site de l'employeur",
  formulaire: "Bouton Emploi Territorial",
  courrier: "Par courrier",
  inconnu: "À voir sur l'offre",
};

/** Mail prêt à envoyer : la personne n'a plus qu'à joindre CV et lettre. */
export function applyMailto(offer: { title: string; company: string | null; link: string }, to: string) {
  const subject = `Candidature : ${offer.title}`;
  const body = [
    "Bonjour,",
    "",
    `Je vous adresse ma candidature au poste de ${offer.title}${offer.company ? ` (${offer.company})` : ""}, publié sur Emploi Territorial :`,
    offer.link,
    "",
    "Vous trouverez ci-joint mon CV et ma lettre de motivation.",
    "",
    "Je reste à votre disposition pour un entretien.",
    "",
    "Cordialement,",
  ].join("\n");
  return `mailto:${to}?${new URLSearchParams({ subject, body }).toString().replace(/\+/g, "%20")}`;
}
