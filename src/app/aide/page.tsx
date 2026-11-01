import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimplePage } from "@/components/layout/SimplePage";
import { formatEuros, WALLET_MAX_BALANCE, WALLET_MAX_TOPUP, WALLET_MIN_TOPUP } from "@/lib/wallet/limits";

export const metadata: Metadata = { title: "Aide" };

type Question = { q: string; a: ReactNode };

const link = "font-medium text-accent hover:underline";

const TOPICS: { title: string; questions: Question[] }[] = [
  {
    title: "Parler avec Awa",
    questions: [
      {
        q: "Qui est Awa ?",
        a: "L'assistante de BTM AI, créée à Mayotte par GROUPE BTM. Elle répond en français et apprend le shimaoré. Elle peut se tromper : vérifie les informations importantes.",
      },
      {
        q: "Comment lui parler en shimaoré ?",
        a: "Écris-lui simplement en shimaoré, elle répond dans la même langue. Son shimaoré progresse chaque jour : l'équipe de GROUPE BTM lui apprend les mots qu'elle ne connaît pas encore.",
      },
      {
        q: "Comment lui parler à voix haute ?",
        a: "Appuie sur le micro dans la barre de message. Il faut autoriser le micro dans ton navigateur ; Chrome, Edge et Safari fonctionnent le mieux.",
      },
      {
        q: "C'est quoi « Professionnelle » à côté du message ?",
        a: "Le caractère d'Awa. Clique dessus pour en choisir un autre : elle change sa façon de te parler, pas ce qu'elle sait.",
      },
      {
        q: "Comment commencer une nouvelle conversation ?",
        a: "Le bouton + en haut de la barre latérale, ou Ctrl + Maj + O sur ordinateur.",
      },
    ],
  },
  {
    title: "Quotas",
    questions: [
      {
        q: "Pourquoi Awa ne répond plus ?",
        a: (
          <>
            Tu as peut-être atteint ta limite de messages du jour ou de la minute. Regarde ce qu&apos;il te reste dans{" "}
            <Link href="/utilisation" className={link}>
              Utilisation
            </Link>
            . Si la conversation est très longue, ouvre-en une nouvelle.
          </>
        ),
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
        a: "Demande-le à Awa (« je veux passer mon code »). Elle te montre les places libres dans les bureaux La Poste de Mayotte ; choisis ta ville, ton jour et ton heure, puis remplis tes informations. GROUPE BTM te recontacte pour confirmer.",
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
        a: (
          <>
            Dans{" "}
            <Link href="/parametres" className={link}>
              Paramètres
            </Link>{" "}
            : bouton « Modifier » pour le nom, « Changer » pour le mot de passe.
          </>
        ),
      },
      {
        q: "Comment faire oublier quelque chose à Awa ?",
        a: "Dis-le-lui simplement, par exemple « oublie où j'habite ».",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Paramètres → Supprimer le compte. Tes conversations, la mémoire d'Awa et tes informations sont effacées.",
      },
      {
        q: "Que fait BTM de mes données ?",
        a: (
          <>
            Tout est expliqué simplement dans{" "}
            <Link href="/confidentialite" className={link}>
              Données et confidentialité
            </Link>
            .
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <SimplePage title="Obtenir de l'aide">
      <div className="space-y-6">
        <p className="text-fg-muted">Les réponses aux questions les plus fréquentes. Clique sur une question pour la déplier.</p>
        {TOPICS.map((topic) => (
          <section key={topic.title}>
            <h2 className="px-1 text-xs font-medium tracking-wide text-fg-muted uppercase">{topic.title}</h2>
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg">
              {topic.questions.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium hover:bg-bg-muted [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-fg-muted transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-relaxed text-fg-muted">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SimplePage>
  );
}
