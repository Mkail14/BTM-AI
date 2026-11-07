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
  {
    name: "GROUPE BTM", initials: "BTM", colors: ["#f6ecdf", "#ead8c3"], since: "2025-09",
    logo: "/brand/groupe-btm-b-encre.png",
    pitch: "Bâtir la Technologie de Mayotte, le groupe qui a créé Tamilya.",
    integration:
      "Tamilya est intégrée au site btm.yt, et les services de BTM sont disponibles dans Tamilya : vous demandez votre devis directement dans la conversation, puis vous recevez votre code de retrait.",
    example: "Je voudrais un devis BTM",
    website: "https://btm.yt",
  },
  {
    name: "Saveurs de l'Île", initials: "SI", colors: ["#ea4335", "#fbbc05"], since: "2025-12", pitch: "Repas livrés à la maison.",
    integration: "Vous choisissez votre plat dans la conversation, Tamilya passe la commande et suit la livraison.",
    example: "Je veux un mataba livré ce midi",
  },
  {
    name: "Traversée Express", initials: "TE", colors: ["#0b57d0", "#5ee7ff"], since: "2026-02", pitch: "Horaires de la barge.",
    integration: "Les départs de la barge et les retards sont donnés par Tamilya, sans chercher sur un autre site.",
    example: "La prochaine barge pour Dzaoudzi ?",
  },
  {
    name: "Auto-École Horizon", initials: "AH", colors: ["#9b72cb", "#e2367a"], since: "2026-04", pitch: "Le code de la route, expliqué.",
    integration: "Tamilya vous fait réviser le code avec des questions et vous explique chaque réponse.",
    example: "Fais-moi réviser le code",
  },
  {
    name: "Panier Local", initials: "PL", colors: ["#188038", "#a8d23a"], since: "2026-07", pitch: "Les boutiques du coin.",
    integration: "Tamilya trouve les boutiques proches de chez vous et ce qu'elles ont en rayon.",
    example: "Où acheter du riz près de Kawéni ?",
  },
  {
    name: "Santé Proche", initials: "SP", colors: ["#e2367a", "#ff8a65"], since: "2026-10", pitch: "Pharmacies de garde.",
    integration: "Tamilya vous indique la pharmacie de garde la plus proche, avec l'adresse et le téléphone.",
    example: "Pharmacie de garde ce soir ?",
  },
];

/** Nos partenaires : un seul écran fixe (la page ne défile pas), la frise glisse de gauche à droite. */
export default function PartenairesPage() {
  return (
    // Écran trop bas (téléphone couché, petit téléphone) : la page défile en hauteur pour que les cartes ne soient pas coupées.
    <div className="landing fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-fg [@media(min-height:640px)]:overflow-hidden">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />

      {/* Titre, frise et appel groupés au milieu de l'écran : pas de grand vide entre le titre et la frise. */}
      <main id="contenu" className="relative z-10 flex flex-1 flex-col justify-center-safe pb-[max(1.5rem,env(safe-area-inset-bottom))] [@media(min-height:640px)]:min-h-0">
        <div aria-hidden="true" className="landing-aurora" />

        <div className="shrink-0 px-5 pt-[clamp(1rem,calc(8vh-2rem),3rem)] text-center">
          <h1 className="landing-rise text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-[650] tracking-[-0.035em] text-balance">
            Nos <span className="landing-accent">partenaires</span>
          </h1>
          <p className="landing-rise mt-3 text-[15px] text-fg-muted [animation-delay:100ms]">Ils font avancer Mayotte avec Tamilya. (Exemples)</p>
        </div>

        <PartnerFrise partners={EXAMPLES} />

        {/* Téléphone : sur deux lignes centrées, loin du rond d'aide en bas à droite. */}
        <p className="shrink-0 px-5 text-center text-sm text-fg-muted">
          Votre entreprise ici ?<br className="sm:hidden" />{" "}
          <a
            href="mailto:contact@btm.yt?subject=Devenir%20partenaire%20de%20Tamilya"
            className="zone-appui relative inline-block font-semibold text-fg underline decoration-[color-mix(in_oklab,var(--accent)_60%,transparent)] underline-offset-4 hover:decoration-[var(--accent)]"
          >
            Devenir partenaire
          </a>
        </p>
      </main>
    </div>
  );
}
