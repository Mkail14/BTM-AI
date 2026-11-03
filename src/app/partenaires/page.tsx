import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/LandingNav";
import { PartnerFrise, type Partner } from "@/components/partners/PartnerFrise";

export const metadata: Metadata = { title: "Nos partenaires" };

/*
 * Partenaires fictifs (noms et logos inventés), pour montrer la mise en page.
 * Remplacer EXAMPLES par les vrais partenaires (avec leur accord écrit) quand
 * ils seront signés, dans l'ordre de leur arrivée.
 */
const EXAMPLES: readonly Partner[] = [
  { name: "Bus du Lagon", initials: "BL", colors: ["#1a73e8", "#14a89e"], since: "2025-09", pitch: "Horaires et trajets en bus." },
  { name: "Saveurs de l'Île", initials: "SI", colors: ["#ea4335", "#fbbc05"], since: "2025-12", pitch: "Repas livrés à la maison." },
  { name: "Traversée Express", initials: "TE", colors: ["#0b57d0", "#5ee7ff"], since: "2026-02", pitch: "Horaires de la barge." },
  { name: "Auto-École Horizon", initials: "AH", colors: ["#9b72cb", "#e2367a"], since: "2026-04", pitch: "Le code de la route, expliqué." },
  { name: "Panier Local", initials: "PL", colors: ["#188038", "#a8d23a"], since: "2026-07", pitch: "Les boutiques du coin." },
  { name: "Santé Proche", initials: "SP", colors: ["#e2367a", "#ff8a65"], since: "2026-10", pitch: "Pharmacies de garde." },
];

/** Nos partenaires : un seul écran fixe (la page ne défile pas), la frise glisse de gauche à droite. */
export default function PartenairesPage() {
  return (
    <div className="landing fixed inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />

      <main id="contenu" className="relative z-10 flex min-h-0 flex-1 flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="landing-aurora" />

        <div className="shrink-0 px-5 pt-[clamp(1.5rem,6vh,4rem)] text-center">
          <h1 className="landing-rise text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-[650] tracking-[-0.035em] text-balance">
            Nos <span className="landing-accent">partenaires</span>
          </h1>
          <p className="landing-rise mt-3 text-[15px] text-fg-muted [animation-delay:100ms]">Ils font avancer Mayotte avec Tamilya. (Exemples)</p>
        </div>

        <PartnerFrise partners={EXAMPLES} />

        <p className="shrink-0 px-5 text-center text-sm text-fg-muted">
          Votre entreprise ici ?{" "}
          <a
            href="mailto:contact@btm.yt?subject=Devenir%20partenaire%20de%20Tamilya"
            className="font-semibold text-fg underline decoration-[color-mix(in_oklab,var(--accent)_60%,transparent)] underline-offset-4 hover:decoration-[var(--accent)]"
          >
            Devenir partenaire
          </a>
        </p>
      </main>
    </div>
  );
}
