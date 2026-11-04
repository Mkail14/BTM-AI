import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { listDeveloperKeys, MAX_ACTIVE_KEYS } from "@/lib/developers/keys";
import { siteOrigin } from "@/lib/email/device";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { ApiReference } from "./ApiReference";
import { CodeExamples } from "./CodeExamples";
import { DeveloperKeys } from "./DeveloperKeys";
import { SignInButton } from "./SignInButton";
import { card, DevShell, ghostButton, roseButton, screen, SectionTitle } from "./ui";

export const metadata: Metadata = {
  title: "Développeurs",
  description: "Mettez Tamilya dans votre application, avec votre propre clé Gemini.",
};

const STEPS = [
  { title: "Créez votre code", text: "Un compte gratuit suffit. Le code dit à Tamilya que c'est vous." },
  { title: "Ajoutez votre clé Gemini", text: "Gratuite sur Google AI Studio. Elle paie les réponses, et nous ne la gardons jamais." },
  { title: "Posez vos questions", text: "Depuis votre serveur. Tamilya répond avec tout ce qu'elle sait." },
] as const;

const perMinute = RATE_LIMIT_POLICIES.developerKey.find((r) => r.windowSeconds === 60)?.limit ?? 0;
const perDay = RATE_LIMIT_POLICIES.developerKey.find((r) => r.windowSeconds === 86_400)?.limit ?? 0;



/**
 * Espace développeurs, en trois écrans : l'accueil, les étapes et le code
 * d'accès, puis l'exemple d'appel.
 */
export default async function DeveloppeursPage() {
  const [{ user }, requestHeaders] = await Promise.all([getAuthContext(), headers()]);
  const keys = user ? await listDeveloperKeys(user.id) : null;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const endpoint = `${siteOrigin(`${host.startsWith("localhost") ? "http" : "https"}://${host}`)}/api/v1/tamilya`;

  return (
    <DevShell>
      {/* Écran 1 : accueil, centré comme celui du site. */}
      <section className={`relative mx-auto flex max-w-3xl flex-col items-center justify-center px-5 py-10 text-center ${screen}`}>
        <div aria-hidden="true" className="landing-aurora" />
        <p className="landing-rise landing-eyebrow">API de Tamilya</p>
        <h1 className="landing-rise landing-title mt-6 [animation-delay:100ms]">
          Tamilya dans <span className="landing-accent">votre appli</span>
        </h1>
        <p className="landing-rise mx-auto mt-6 max-w-lg text-base leading-relaxed text-pretty text-fg-muted [animation-delay:180ms] sm:text-lg">
          Le shimaoré et tout ce qu&apos;elle sait de Mayotte, dans votre site ou votre application. Gratuit, avec votre
          propre clé Gemini.
        </p>
        <div className="landing-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:260ms]">
          <a href="#code" className={roseButton}>
            Obtenir mon code
          </a>
          <a href="#exemple" className={ghostButton}>
            Voir un exemple
          </a>
        </div>
      </section>

      {/* Écran 2 : les trois étapes et le code d'accès. */}
      <section id="code" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 py-16 ${screen}`}>
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          <div>
            <SectionTitle index="01" title="Trois étapes, c'est tout" />
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
            <SectionTitle index="02" title="Votre code d'accès" />
            <div className={`mt-8 ${card}`}>
              {!user ? (
                <div className="flex flex-col items-start gap-4">
                  <p className="text-sm leading-relaxed text-fg-muted">
                    Créez votre compte gratuit, puis votre code en un clic. Déjà un compte ? Connectez-vous en haut de la page.
                  </p>
                  <SignInButton className={roseButton} />
                </div>
              ) : keys === null ? (
                <p className="text-sm text-fg-muted">Les codes sont indisponibles pour le moment. Réessayez plus tard.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed text-fg-muted">
                    Un code par application. Il n&apos;est montré qu&apos;une fois : gardez-le dans un endroit sûr.
                  </p>
                  <DeveloperKeys keys={keys} max={MAX_ACTIVE_KEYS} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Écran 3 : l'exemple d'appel. */}
      <section id="exemple" className={`mx-auto flex max-w-5xl scroll-mt-12 flex-col justify-center px-5 py-8 ${screen}`}>
        {/* Titre plus serré que les autres écrans : tout doit tenir dans un seul écran. */}
        <div className="text-center">
          <span aria-hidden="true" className="landing-index">
            03
          </span>
          <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-[650] tracking-[-0.035em] text-balance">
            Posez votre première question
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-pretty text-fg-muted sm:text-base">
            Une seule adresse, à appeler depuis votre serveur. Jamais depuis le navigateur : votre code et votre clé seraient
            visibles par tous.
          </p>
          <code className="mt-4 inline-block max-w-full truncate rounded-full border border-border bg-bg px-4 py-1.5 font-mono text-xs">
            <span className="font-semibold text-[var(--persona,var(--accent))]">POST</span> {endpoint}
          </code>
        </div>
        <div className="mt-8 grid gap-5 lg:h-[min(26rem,calc(100dvh-24rem))] lg:min-h-[18rem] lg:grid-cols-[1.5fr_1fr]">
          <CodeExamples endpoint={endpoint} className="h-[24rem] lg:h-auto" />
          <ApiReference className="h-[22rem] lg:h-auto" />
        </div>
        <p className="mt-5 text-center text-xs text-fg-muted">
          Pour chaque code : {perMinute} questions par minute, {perDay.toLocaleString("fr-FR")} par jour. Besoin de plus ?{" "}
          <a href="mailto:contact@btm.yt?subject=API%20de%20Tamilya" className="text-fg underline underline-offset-4">
            Écrivez-nous
          </a>
          .
        </p>
      </section>
    </DevShell>
  );
}
