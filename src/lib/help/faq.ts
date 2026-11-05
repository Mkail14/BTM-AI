import { formatEuros, WALLET_MAX_BALANCE, WALLET_MAX_TOPUP, WALLET_MIN_TOPUP } from "@/lib/wallet/limits";

/**
 * Questions fréquentes, partagées par la page /aide, le rond d'aide (HelpBubble)
 * et l'IA d'aide (/api/aide), qui s'en sert comme base de réponse.
 * Réponses en texte brut ; `link` ajoute un lien sous la réponse.
 */
export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };
export type FaqTopic = { title: string; questions: FaqItem[] };

export const FAQ: FaqTopic[] = [
  {
    title: "Parler avec Tamilya",
    questions: [
      {
        q: "Qui est Tamilya ?",
        a: "L'assistante de BTM AI, créée à Mayotte par GROUPE BTM. Elle répond en français et apprend le shimaoré. Elle peut se tromper : vérifie les informations importantes.",
      },
      {
        q: "Comment lui parler en shimaoré ?",
        a: "Écris-lui en shimaoré ou demande-lui de répondre en shimaoré : elle utilise les mots qu'elle connaît. Son shimaoré progresse chaque jour : l'équipe de GROUPE BTM lui apprend les mots qu'elle ne connaît pas encore.",
      },
      {
        q: "Comment lui parler à voix haute ?",
        a: "Appuie sur le micro dans la barre de message. Il faut autoriser le micro dans ton navigateur ; Chrome et Edge fonctionnent le mieux.",
      },
      {
        q: "Comment commencer une nouvelle conversation ?",
        a: "Le bouton + en haut de la barre latérale, ou Ctrl + Maj + O sur ordinateur.",
      },
    ],
  },
  {
    title: "Limites de messages",
    questions: [
      {
        q: "Pourquoi Tamilya ne répond plus ?",
        a: "Tu as peut-être atteint ta limite de messages du jour ou de la minute : la page Utilisation montre ce qu'il te reste. Si la conversation est très longue, ouvre-en une nouvelle.",
        link: { href: "/utilisation", label: "Voir mon utilisation" },
      },
      {
        q: "« La réponse n'a pas pu être générée », que faire ?",
        a: "Appuie sur le bouton pour réessayer, à côté de ton message. Si ça continue, attends une minute : le service est peut-être très demandé.",
      },
    ],
  },
  {
    title: "Code de la route",
    questions: [
      {
        q: "Comment réserver mon examen du code ?",
        a: "Demande-le à Tamilya (« je veux passer mon code »). Elle te montre les places libres dans les bureaux La Poste de Mayotte ; choisis ta ville, ton jour et ton heure, puis remplis tes informations. Pour l'instant, la réservation est un essai : aucune vraie place n'est prise.",
      },
      {
        q: "C'est quoi le NEPH ?",
        a: "Ton numéro de dossier permis, à 12 chiffres. Il est obligatoire pour passer le code, même avec le SNU. Tu l'obtiens gratuitement sur le site de l'ANTS (France Titres), en 2 à 4 semaines.",
      },
      {
        q: "J'ai fait le SNU, c'est gratuit ?",
        a: "Le SNU donne droit à un passage gratuit du code voiture (B), une seule fois, dans l'année qui suit sa validation. Coche « Je suis éligible au SNU » lors de la réservation.",
      },
    ],
  },
  {
    title: "Partenaires",
    questions: [
      {
        q: "Qui sont les partenaires de Tamilya ?",
        a: "Des entreprises de Mayotte dont les services sont disponibles directement dans Tamilya. Le premier est GROUPE BTM : Tamilya est intégrée à son site, btm.yt.",
        link: { href: "/partenaires", label: "Voir les partenaires" },
      },
      {
        q: "Comment obtenir un devis BTM ?",
        a: "Demande-le simplement à Tamilya (« je voudrais un devis BTM »). Elle prépare ton devis directement dans la conversation, puis tu reçois ton code de retrait.",
      },
    ],
  },
  {
    title: "Portefeuille",
    questions: [
      {
        q: "À quoi sert le portefeuille ?",
        a: "À payer les réservations et services partenaires sans redonner ta carte à chaque fois. Tu le recharges, puis tu paies avec ton solde.",
      },
      {
        q: "Combien je peux mettre ?",
        a: `De ${formatEuros(WALLET_MIN_TOPUP)} à ${formatEuros(WALLET_MAX_TOPUP)} par recharge, et ${formatEuros(WALLET_MAX_BALANCE)} au maximum sur le solde : en cas de problème, tu ne risques jamais plus.`,
      },
      {
        q: "Y a-t-il des frais ?",
        a: "Non : si tu recharges 10 €, tu as 10 € sur ton solde.",
      },
      {
        q: "Ma recharge n'apparaît pas",
        a: "Certains paiements sont validés en quelques minutes. Reviens sur la page Portefeuille : l'opération y est marquée « En attente » puis créditée. Si elle reste « Échouée », rien n'a été débité.",
      },
    ],
  },
  {
    title: "Compte et données",
    questions: [
      {
        q: "Comment changer mon nom ou mon mot de passe ?",
        a: "Dans les Paramètres : bouton « Modifier » pour le nom, « Changer » pour le mot de passe.",
        link: { href: "/parametres", label: "Ouvrir les Paramètres" },
      },
      {
        q: "Comment faire oublier quelque chose à Tamilya ?",
        a: "Dis-le-lui simplement, par exemple « oublie où j'habite ».",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Paramètres → Supprimer le compte. Tes conversations, la mémoire de Tamilya et tes informations sont effacées.",
      },
      {
        q: "Que fait BTM de mes données ?",
        a: "Tout est expliqué simplement dans la page Données et confidentialité.",
        link: { href: "/confidentialite", label: "Données et confidentialité" },
      },
    ],
  },
];

/** Sujets proposés dans l'onglet « Écrire » ; repris dans l'objet de l'e-mail envoyé à l'équipe. */
export const HELP_TOPICS = ["Mon compte", "Portefeuille", "Code de la route", "Un bug", "Autre"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

/** La FAQ en texte, pour les consignes de l'IA d'aide. */
export function faqAsText(): string {
  return FAQ.map(
    (topic) =>
      `## ${topic.title}\n` +
      topic.questions.map((item) => `Q : ${item.q}\nR : ${item.a}${item.link ? ` (page ${item.link.href})` : ""}`).join("\n"),
  ).join("\n\n");
}
