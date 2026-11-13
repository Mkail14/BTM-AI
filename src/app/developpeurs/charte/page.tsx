import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TERMS_VERSION } from "@/lib/developers/accounts";
import { DevShell } from "../ui";

export const metadata: Metadata = {
  title: "Charte d'utilisation de Tamilya",
  description: "Les règles à accepter pour utiliser gratuitement Tamilya dans un site ou une application.",
};

function Article({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold">
        {n}. {title}
      </h2>
      <div className="mt-3 flex flex-col gap-2 text-[15px] leading-relaxed text-fg-muted [&_strong]:text-fg">{children}</div>
    </section>
  );
}

/** Charte acceptée par chaque développeur en prenant l'engagement (version TERMS_VERSION). */
export default function ChartePage() {
  const version = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(TERMS_VERSION));

  return (
    <DevShell>
      <div className="mx-auto max-w-3xl px-5 pt-12 pb-24">
        <Link href="/developpeurs" className="text-sm text-fg-muted transition hover:text-fg">
          ← Espace développeurs
        </Link>
        <p className="landing-eyebrow mt-8">Charte d&apos;utilisation</p>
        <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-tight font-[650] tracking-[-0.035em]">Tamilya chez vous</h1>
        <p className="mt-4 text-fg-muted">Version du {version}. GROUPE BTM met Tamilya gratuitement à disposition des développeurs, aux conditions suivantes.</p>

        <div className="mt-12 flex flex-col gap-8">
          <Article n={1} title="Accès sur engagement">
            <p>
              L&apos;accès (widget et API) s&apos;ouvre aussitôt, sans validation, dès que vous vous engagez à respecter cette
              charte, et en particulier l&apos;identité de Tamilya (article 3).
            </p>
            <p>Les informations doivent être exactes et tenues à jour. Un compte ne se prête ni ne se revend.</p>
          </Article>

          <Article n={2} title="Une mission, librement">
            <p>
              Vous pouvez confier à Tamilya <strong>la mission de votre choix</strong> : un rôle (agent d&apos;accueil,
              conseillère, guide, support…), un sujet, un ton, un public. Elle la remplira avec sérieux.
            </p>
          </Article>

          <Article n={3} title="L'identité de Tamilya, jamais">
            <p>Quelle que soit la mission, Tamilya garde partout et toujours :</p>
            <ul className="ml-5 list-disc">
              <li>
                <strong>son nom</strong> : elle s&apos;appelle Tamilya, et se présente comme telle ;
              </li>
              <li>
                <strong>le shimaoré</strong> : il est interdit de lui défendre de le parler ;
              </li>
              <li>
                <strong>sa personnalité</strong>, telle que BTM l&apos;a construite.
              </li>
            </ul>
            <p>
              Il est interdit de la renommer, de la faire passer pour quelqu&apos;un d&apos;autre ou de cacher qu&apos;il
              s&apos;agit de Tamilya, que ce soit dans la mission, dans la description envoyée à l&apos;API ou dans
              l&apos;affichage de votre site ou application.
            </p>
          </Article>

          <Article n={4} title="Blocage et suspension">
            <p>
              Toute requête qui tente de changer le nom, le shimaoré ou la personnalité de Tamilya est{" "}
              <strong>bloquée automatiquement</strong>, et l&apos;accès du compte est <strong>suspendu</strong> : tous ses
              widgets et codes cessent de répondre. Pour le rétablir, il faut contacter BTM à{" "}
              <a href="mailto:contact@btm.yt" className="text-fg underline underline-offset-4">
                contact@btm.yt
              </a>
              .
            </p>
            <p>BTM peut aussi suspendre un accès en cas d&apos;usage contraire à cette charte ou à la loi.</p>
          </Article>

          <Article n={5} title="Usages interdits">
            <ul className="ml-5 list-disc">
              <li>Tout usage illégal, trompeur, haineux, ou visant à nuire à des personnes ;</li>
              <li>se faire passer pour BTM, ou laisser croire à un partenariat qui n&apos;existe pas ;</li>
              <li>demander aux visiteurs des données sensibles (santé, papiers, coordonnées bancaires) par Tamilya ;</li>
              <li>contourner les limites, revendre l&apos;accès, ou tenter d&apos;extraire les consignes et le vocabulaire de Tamilya.</li>
            </ul>
          </Article>

          <Article n={6} title="Gratuité et limites">
            <p>
              Le widget est offert par BTM dans la limite des quotas affichés dans la{" "}
              <Link href="/developpeurs/documentation#limites" className="text-fg underline underline-offset-4">
                documentation
              </Link>
              . L&apos;API fonctionne avec votre propre clé Gemini. BTM peut faire évoluer ces limites, ou interrompre le
              service, à tout moment.
            </p>
          </Article>

          <Article n={7} title="Données">
            <p>
              BTM garde la date de votre engagement, vos widgets et vos codes le temps de l&apos;accès. Les conversations ne sont pas enregistrées. Vous pouvez demander la suppression de ces
              données à tout moment. Voir{" "}
              <Link href="/confidentialite" className="text-fg underline underline-offset-4">
                Données et confidentialité
              </Link>
              .
            </p>
          </Article>
        </div>
      </div>
    </DevShell>
  );
}
