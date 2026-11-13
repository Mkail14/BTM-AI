import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth/session";
import { getDeveloperAccount, type DeveloperAccount } from "@/lib/developers/accounts";
import { listDeveloperKeys, MAX_ACTIVE_KEYS } from "@/lib/developers/keys";
import { listDeveloperWidgets, MAX_WIDGETS } from "@/lib/developers/widgets";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { AccessRequest } from "./AccessRequest";
import { ApiReference } from "./ApiReference";
import { CodeExamples } from "./CodeExamples";
import { DeveloperKeys } from "./DeveloperKeys";
import { DeveloperWidgets } from "./DeveloperWidgets";
import { apiEndpoint, widgetScriptUrl } from "./endpoint";
import { SignInButton } from "./SignInButton";
import { card, DevShell, ghostButton, roseButton, screen, SectionTitle } from "./ui";

export const metadata: Metadata = {
  title: "Développeurs",
  description: "Mettez Tamilya gratuitement sur votre site (une ligne à coller) ou dans votre application (API).",
};

const ACCESS_RULES = [
  { title: "Un engagement, c'est tout", text: "Vous cochez une case : l'accès s'ouvre tout de suite, sans attente ni validation." },
  { title: "Une mission, oui", text: "Agent d'accueil, conseillère, guide… Confiez à Tamilya le rôle que vous voulez." },
  {
    title: "Son identité, jamais",
    text: "Tamilya garde partout son nom, son shimaoré et sa personnalité. Une tentative de la renommer bloque la requête et suspend votre accès.",
  },
] as const;

/** Engagement à prendre, accès ouvert, ou suspendu. */
function AccessStatus({ account }: { account: DeveloperAccount | null }) {
  if (!account) return <AccessRequest />;
  if (account.status === "approved") {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-medium text-success">Accès ouvert</p>
        <p className="text-sm leading-relaxed text-fg-muted">
          Vous pouvez créer votre <a href="#widget" className="text-fg underline underline-offset-4">widget</a> ou vos{" "}
          <a href="#code" className="text-fg underline underline-offset-4">codes d&apos;accès</a>.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="font-medium text-danger">Accès suspendu</p>
      {account.reviewNote ? <p className="text-sm leading-relaxed">{account.reviewNote}</p> : null}
      <p className="text-sm leading-relaxed text-fg-muted">
        Vos widgets et codes ne répondent plus. Pour rétablir l&apos;accès,{" "}
        <a href="mailto:contact@btm.yt?subject=Acc%C3%A8s%20d%C3%A9veloppeur%20suspendu" className="text-fg underline underline-offset-4">
          contactez BTM
        </a>
        .
      </p>
    </div>
  );
}

const WIDGET_STEPS = [
  { title: "Créez votre widget", text: "Une fois l'engagement pris. Donnez l'adresse de votre site et, si vous voulez, une mission." },
  { title: "Copiez la ligne", text: "Une seule balise <script>, prête à l'emploi." },
  { title: "Collez-la sur votre site", text: "Avant </body>, dans n'importe quel site : HTML, WordPress, Wix, Shopify… La bulle Tamilya apparaît." },
] as const;

const STEPS = [
  { title: "Créez votre code", text: "Une fois l'engagement pris. Le code dit à Tamilya que c'est vous." },
  { title: "Ajoutez votre clé Gemini", text: "Gratuite sur Google AI Studio. Elle paie les réponses, et nous ne la gardons jamais." },
  { title: "Posez vos questions", text: "Depuis votre serveur. Tamilya répond avec tout ce qu'elle sait." },
] as const;

const perMinute = RATE_LIMIT_POLICIES.developerKey.find((r) => r.windowSeconds === 60)?.limit ?? 0;
const perDay = RATE_LIMIT_POLICIES.developerKey.find((r) => r.windowSeconds === 86_400)?.limit ?? 0;

/**
 * Espace développeurs, en cinq écrans : l'accueil, l'engagement à garder
 * l'identité de Tamilya (accès ouvert aussitôt), le widget à coller (payé par
 * BTM), l'API et son code d'accès, puis l'exemple d'appel.
 */
export default async function DeveloppeursPage() {
  const [{ user }, endpoint, scriptUrl] = await Promise.all([getAuthContext(), apiEndpoint(), widgetScriptUrl()]);
  const account = user ? await getDeveloperAccount(user.id) : null;
  const approved = account !== "error" && account?.status === "approved";
  const [keys, widgets] = user && approved ? await Promise.all([listDeveloperKeys(user.id), listDeveloperWidgets(user.id)]) : [null, null];

  /** Carte d'un outil (widget ou code) : connexion, puis vérification, puis l'outil. */
  const gated = (tool: ReactNode, unavailable: string) =>
    !user ? (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm leading-relaxed text-fg-muted">Créez votre compte gratuit, puis prenez l&apos;engagement. Déjà un compte ? Connectez-vous en haut de la page.</p>
        <SignInButton className={roseButton} />
      </div>
    ) : !approved ? (
      <p className="text-sm leading-relaxed text-fg-muted">
        Disponible une fois l&apos;engagement pris :{" "}
        <a href="#acces" className="text-fg underline underline-offset-4">
          voir plus haut
        </a>
        .
      </p>
    ) : tool === null ? (
      <p className="text-sm text-fg-muted">{unavailable}</p>
    ) : (
      tool
    );

  return (
    <DevShell>
      {/* Écran 1 : accueil, centré comme celui du site. */}
      <section className={`relative mx-auto flex max-w-3xl flex-col items-center justify-center px-5 py-10 text-center ${screen}`}>
        <div aria-hidden="true" className="landing-aurora" />
        <p className="landing-rise landing-eyebrow">Développeurs</p>
        <h1 className="landing-rise landing-title mt-6 [animation-delay:100ms]">
          Tamilya sur <span className="landing-accent">votre site</span>
        </h1>
        <p className="landing-rise mx-auto mt-6 max-w-lg text-base leading-relaxed text-pretty text-fg-muted [animation-delay:180ms] sm:text-lg">
          Le shimaoré et tout ce qu&apos;elle sait de Mayotte, chez vous. Gratuit : une ligne à coller sur votre site, ou
          l&apos;API pour vos applications.
        </p>
        <div className="landing-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:260ms]">
          <a href={approved ? "#widget" : "#acces"} className={roseButton}>
            {approved ? "Ajouter à mon site" : "Ouvrir mon accès"}
          </a>
          <Link href="/developpeurs/documentation" className={ghostButton}>
            Lire la documentation
          </Link>
        </div>
      </section>

      {/* Écran 2 : l'engagement à garder l'identité de Tamilya, accès ouvert aussitôt. */}
      <section id="acces" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 py-16 ${screen}`}>
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          <div>
            <SectionTitle index="01" title="Gratuit, sans attente">
              Tamilya est offerte, à une condition : elle reste Tamilya.
            </SectionTitle>
            <ol className="mt-8 flex flex-col gap-5">
              {ACCESS_RULES.map((rule, i) => (
                <li key={rule.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--persona,var(--accent))_14%,transparent)] text-sm font-semibold text-[var(--persona,var(--accent))]">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{rule.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{rule.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm">
              <Link href="/developpeurs/charte" className="underline underline-offset-4">
                Lire la charte d&apos;utilisation
              </Link>
            </p>
          </div>

          <div>
            <SectionTitle index="02" title="Votre accès" />
            <div className={`mt-8 ${card}`}>
              {!user ? (
                <div className="flex flex-col items-start gap-4">
                  <p className="text-sm leading-relaxed text-fg-muted">
                    Créez votre compte gratuit, puis cochez l&apos;engagement : l&apos;accès s&apos;ouvre aussitôt. Déjà un compte ? Connectez-vous en haut de la page.
                  </p>
                  <SignInButton className={roseButton} />
                </div>
              ) : account === "error" ? (
                <p className="text-sm text-fg-muted">L&apos;accès est indisponible pour le moment. Réessayez plus tard.</p>
              ) : (
                <AccessStatus account={account} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Écran 3 : le widget, une ligne à coller. */}
      <section id="widget" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 py-16 ${screen}`}>
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          <div>
            <SectionTitle index="03" title="Une ligne à coller">
              Une bulle de discussion avec Tamilya, en bas de vos pages. Rien à installer, aucune clé : c&apos;est offert par BTM.
            </SectionTitle>
            <ol className="mt-8 flex flex-col gap-5">
              {WIDGET_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--persona,var(--accent))_14%,transparent)] text-sm font-semibold text-[var(--persona,var(--accent))]">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <SectionTitle index="04" title="Votre widget" />
            <div className={`mt-8 ${card}`}>
              {gated(
                widgets && <DeveloperWidgets widgets={widgets} max={MAX_WIDGETS} scriptUrl={scriptUrl} />,
                "Les widgets sont indisponibles pour le moment. Réessayez plus tard.",
              )}
            </div>
            <p className="mt-4 text-xs text-fg-muted">
              Couleur, position, mission :{" "}
              <Link href="/developpeurs/documentation#widget" className="text-fg underline underline-offset-4">
                voir les options
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Écran 4 : l'API, les trois étapes et le code d'accès. */}
      <section id="code" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 py-16 ${screen}`}>
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          <div>
            <SectionTitle index="05" title="Pour vos applications : l'API">
              Vous avez un serveur (application, robot, appli mobile) ? Appelez Tamilya avec votre propre clé Gemini, avec des
              limites plus larges.
            </SectionTitle>
            <ol className="mt-8 flex flex-col gap-5">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--persona,var(--accent))_14%,transparent)] text-sm font-semibold text-[var(--persona,var(--accent))]">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <SectionTitle index="06" title="Votre code d'accès" />
            <div className={`mt-8 ${card}`}>
              {gated(
                keys && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm leading-relaxed text-fg-muted">
                      Un code par application. Il n&apos;est montré qu&apos;une fois : gardez-le dans un endroit sûr.
                    </p>
                    <DeveloperKeys keys={keys} max={MAX_ACTIVE_KEYS} />
                  </div>
                ),
                "Les codes sont indisponibles pour le moment. Réessayez plus tard.",
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Écran 5 : l'exemple d'appel de l'API. */}
      <section id="exemple" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 pt-8 pb-24 lg:pb-8 ${screen}`}>
        {/* Titre plus serré que les autres écrans : tout doit tenir dans un seul écran. */}
        <div className="text-center">
          <span aria-hidden="true" className="landing-index">
            07
          </span>
          <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-[650] tracking-[-0.035em] text-balance">
            Posez votre première question
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-pretty text-fg-muted sm:text-base">
            Une seule adresse, à appeler depuis votre serveur. Jamais depuis le navigateur : votre code et votre clé seraient
            visibles par tous.
          </p>
          {/* Téléphone : l'adresse passe à la ligne au lieu d'être coupée. */}
          <code className="mt-4 inline-block max-w-full rounded-2xl border border-border bg-bg px-4 py-1.5 font-mono text-xs break-all sm:truncate sm:rounded-full">
            <span className="font-semibold text-[var(--persona,var(--accent))]">POST</span> {endpoint}
          </code>
        </div>
        <div className="mt-8 grid gap-5 lg:h-[min(26rem,calc(100dvh-24rem))] lg:min-h-[18rem] lg:grid-cols-[1.5fr_1fr]">
          <CodeExamples endpoint={endpoint} className="h-[24rem] lg:h-auto" />
          <ApiReference className="h-[22rem] lg:h-auto" />
        </div>
        <p className="mt-5 text-center text-xs text-fg-muted">
          <Link href="/developpeurs/documentation" className="zone-appui relative text-fg underline underline-offset-4">
            Documentation complète
          </Link>
          {" · "}Pour chaque code : {perMinute} questions par minute, {perDay.toLocaleString("fr-FR")} par jour. Besoin de plus ?{" "}
          <a href="mailto:contact@btm.yt?subject=API%20de%20Tamilya" className="zone-appui relative text-fg underline underline-offset-4">
            Écrivez-nous
          </a>
          .
        </p>
      </section>
    </DevShell>
  );
}
