import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/LandingNav";
import { MapResetWord } from "@/components/mayotte/MapResetWord";
import { MayotteMap } from "@/components/mayotte/MayotteMap";

export const metadata: Metadata = { title: "Mayotte" };

/**
 * Mayotte : la page des infos de l'île. Pour l'instant, le titre et la carte de
 * Mayotte côte à côte (téléphone : titre en haut, carte en dessous), sur un seul
 * écran fixe qui ne défile pas.
 */
export default function MayottePage() {
  return (
    <div className="landing fixed inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />

      <main
        id="contenu"
        className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1024px] flex-1 flex-col gap-5 px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-10 md:px-6 md:py-8"
      >
        <div aria-hidden="true" className="landing-aurora" />

        <div className="shrink-0 text-center md:flex-1 md:text-left">
          <h1 className="landing-rise text-[clamp(1.25rem,6.2vw,2rem)] leading-[1.05] font-[650] tracking-[-0.035em] whitespace-nowrap md:text-[clamp(1.25rem,3vw,2rem)]">
            Tamilya connectée à <MapResetWord />
          </h1>
          <p className="landing-rise mt-3 text-[15px] text-fg-muted [animation-delay:100ms]">Toutes les infos de l&apos;île, au même endroit.</p>        </div>

        <div className="landing-rise min-h-0 flex-1 overflow-hidden rounded-3xl border border-black/[0.08] shadow-sm [animation-delay:200ms] md:h-full md:max-h-[640px] dark:border-white/[0.1]">
          <MayotteMap />
        </div>
      </main>
    </div>
  );
}
