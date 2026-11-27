import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/LandingNav";

export const metadata: Metadata = {
  title: "Tamilya Connect",
  description: "Écrire à Tamilya sans internet : le message passe de téléphone en téléphone. Uniquement dans l'application Tamilya.",
};

/*
 * Ce que dit cette page suit le code de Tamilya Connect (src/lib/mesh, src/server/services/mesh,
 * app Android .../connect) : 5 sauts au plus, 1 000 caractères, 24 h de validité, relais
 * seulement quand l'application est ouverte, SOS envoyé par e-mail aux proches.
 * Changer une limite là-bas : la changer ici aussi.
 */

const STEPS = [
  {
    title: "Tu écris, même sans réseau",
    text: "Plus de 4G, plus de Wi-Fi ? Dans la conversation, tire vers le haut une fois arrivé en bas : Tamilya Connect s'allume. Tu écris ensuite comme d'habitude.",
  },
  {
    title: "Ton message passe de téléphone en téléphone",
    text: "Il saute vers les téléphones proches qui ont l'application ouverte, par Bluetooth et Wi-Fi, jusqu'à en trouver un qui a internet. Cinq sauts au plus.",
  },
  {
    title: "Tamilya te répond par le même chemin",
    text: "Le téléphone qui a internet transmet ton message à Tamilya. Sa réponse revient vers toi de la même façon, sans que personne n'ait rien à faire.",
  },
] as const;

const HOPS = ["Toi", "Un voisin", "Un passant", "Internet", "Tamilya"] as const;

const SAFETY = [
  { title: "Illisible en chemin", text: "Ton message est chiffré sur ton téléphone. Les téléphones qui le portent ne peuvent ni le lire ni le modifier." },
  { title: "Signé par ton téléphone", text: "Chaque message porte la signature de ton appareil : personne ne peut écrire à ta place." },
  { title: "Il ne traîne pas", text: "Un message qui n'a pas trouvé internet au bout de 24 heures est abandonné." },
] as const;

const LIMITS = [
  "Il faut un compte Tamilya et l'application installée.",
  "Un message fait 1 000 caractères au plus.",
  "Le message avance seulement s'il y a, près de toi, des téléphones avec l'application ouverte.",
  "Le délai dépend des personnes autour : de quelques secondes à bien plus.",
] as const;

const sectionTitle = "text-[clamp(1.6rem,3.5vw,2.25rem)] leading-tight font-[650] tracking-[-0.03em] text-balance";

export default function TamilyaConnectPage() {
  return (
    <div className="landing min-h-dvh bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />

      <main id="contenu" className="relative z-10 pb-[max(4rem,env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="landing-aurora" />

        {/* Une */}
        <section className="mx-auto max-w-3xl px-5 pt-[clamp(3rem,10vh,6rem)] text-center">
          <p className="landing-rise inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1 text-xs font-medium text-fg-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--accent)]" />
            Uniquement dans l&apos;application Tamilya
          </p>
          <h1 className="landing-rise mt-5 text-[clamp(2.4rem,6vw,4rem)] leading-[1.02] font-[650] tracking-[-0.04em] text-balance [animation-delay:80ms]">
            Tamilya <span className="landing-accent">Connect</span>
          </h1>
          <p className="landing-rise mx-auto mt-4 max-w-xl text-[clamp(1.05rem,2vw,1.25rem)] leading-relaxed text-fg-muted [animation-delay:160ms]">
            Écris à Tamilya même quand il n&apos;y a plus de réseau. Ton message passe de téléphone en téléphone jusqu&apos;à trouver internet.
          </p>
        </section>

        {/* Le chemin du message */}
        <section aria-label="Le chemin d'un message" className="landing-rise mx-auto mt-14 max-w-3xl px-5 [animation-delay:240ms]">
          <ol className="flex items-start justify-between gap-1">
            {HOPS.map((hop, index) => {
              const end = index === 0 || index === HOPS.length - 1;
              return (
                <li key={hop} className="relative flex flex-1 flex-col items-center gap-2.5 text-center">
                  {index > 0 ? (
                    <span aria-hidden="true" className="absolute top-5 right-1/2 h-px w-full -translate-y-1/2 border-t border-dashed border-fg/25" />
                  ) : null}
                  <span
                    className={`relative grid size-10 place-items-center rounded-full text-sm font-semibold ${
                      end ? "bg-[var(--accent)] text-white" : "border border-border bg-bg text-fg-muted"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={`text-xs sm:text-sm ${end ? "font-semibold" : "text-fg-muted"}`}>{hop}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Comment ça marche */}
        <section className="mx-auto mt-24 max-w-5xl px-5">
          <h2 className={`${sectionTitle} text-center`}>Comment ça marche</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ title, text }, index) => (
              <li key={title} className="rounded-3xl border border-border bg-bg/60 p-6 backdrop-blur-sm">
                <span className="text-sm font-semibold text-[var(--accent)]">Étape {index + 1}</span>
                <h3 className="mt-2 text-lg leading-snug font-semibold tracking-[-0.01em]">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Sécurité */}
        <section className="mx-auto mt-24 max-w-5xl px-5">
          <h2 className={`${sectionTitle} text-center`}>Tes messages restent à toi</h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
            {SAFETY.map(({ title, text }) => (
              <div key={title}>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SOS */}
        <section className="mx-auto mt-24 max-w-5xl px-5">
          <div className="rounded-3xl border border-border bg-bg/60 p-8 backdrop-blur-sm md:p-12">
            <p className="text-sm font-semibold text-[var(--accent)]">SOS</p>
            <h2 className={`${sectionTitle} mt-2`}>Prévenir tes proches, même hors réseau</h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
              En cas de problème, lance un SOS depuis Tamilya Connect. Il part avec ta position et le niveau de ta batterie. Dès qu&apos;il
              atteint internet, chacun de tes proches reçoit un e-mail.
            </p>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
              Ajoute tes proches à l&apos;avance dans les paramètres de ton compte, quand tu as encore internet.
            </p>
            <p className="mt-6 text-sm font-medium">Si tu es en danger, appelle d&apos;abord le 112.</p>
          </div>
        </section>

        {/* Bon à savoir */}
        <section className="mx-auto mt-24 max-w-3xl px-5">
          <h2 className={sectionTitle}>Bon à savoir</h2>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {LIMITS.map((limit) => (
              <li key={limit} className="py-4 text-[15px] leading-relaxed text-fg-muted">
                {limit}
              </li>
            ))}
          </ul>
        </section>

        {/* Où le trouver */}
        <section className="mx-auto mt-24 max-w-3xl px-5 text-center">
          <h2 className={sectionTitle}>
            Uniquement dans <span className="landing-accent">l&apos;application</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            Tamilya Connect a besoin du Bluetooth et du Wi-Fi de ton téléphone : il n&apos;existe pas sur le site. Installe l&apos;application Tamilya et connecte-toi à ton
            compte pour l&apos;utiliser.
          </p>
        </section>
      </main>
    </div>
  );
}
