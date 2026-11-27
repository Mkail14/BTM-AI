import { LandingNav } from "@/components/landing/LandingNav";

/** Page publique encore vide (Tamilya Connect, Tamilya Game…) : barre du haut, titre, « bientôt disponible ». */
export function ComingSoonPage({ title, accent, text }: { title: string; accent: string; text: string }) {
  return (
    <div className="landing fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />
      <main id="contenu" className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <div aria-hidden="true" className="landing-aurora" />
        <h1 className="landing-rise text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-[650] tracking-[-0.035em] text-balance">
          {title} <span className="landing-accent">{accent}</span>
        </h1>
        <p className="landing-rise mt-3 max-w-md text-[15px] text-fg-muted [animation-delay:100ms]">{text}</p>
        <p className="landing-rise mt-6 rounded-full border border-border px-4 py-1.5 text-sm font-medium [animation-delay:200ms]">Bientôt disponible</p>
      </main>
    </div>
  );
}
