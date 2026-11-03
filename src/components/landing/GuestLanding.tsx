"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AwaBlob } from "@/components/chat/AwaBlob";
import { IconSend } from "@/components/ui/icons";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import type { PublicReview } from "@/lib/reviews/rules";
import { ReviewsWall } from "./ReviewsWall";

const SIGNUP_REASON = "Crée ton compte gratuit pour parler à Tamilya sans limite.";
const REVIEW_REASON = "Crée ton compte gratuit pour donner ton avis sur Tamilya.";

/*
 * Pour l'instant, Tamilya ne fait qu'une chose en public : parler shimaoré.
 * Les autres fonctionnalités (code de la route, emploi, actualité…) ne sont
 * pas encore ouvertes : ne pas les annoncer ici tant qu'elles ne le sont pas.
 */

/** Exemples qui défilent dans le champ « Parle à Tamilya ». */
const EXAMPLES = [
  "Comment dit-on « merci » en shimaoré ?",
  "Apprends-moi à saluer quelqu'un",
  "Comment on compte jusqu'à dix ?",
  "Dis-moi bonne nuit en shimaoré",
];

const POINTS = [
  {
    title: "Elle te répond en shimaoré",
    text: "Écris-lui en français ou en shimaoré, comme tu parles. Sa réponse vient toujours en shimaoré.",
  },
  {
    title: "Elle n'invente pas",
    text: "Elle n'utilise que des mots vérifiés. Quand elle ne connaît pas un mot, elle le dit au lieu de deviner.",
  },
  {
    title: "Elle apprend chaque jour",
    text: "Des locuteurs de Mayotte lui apprennent de nouveaux mots, relus par l'équipe de GROUPE BTM.",
  },
];

const ratingFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Apparition au défilement : la section monte en fondu quand elle entre à l'écran. */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} data-shown={shown || undefined} className={`landing-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Invitation du champ vide : des exemples qui montent et s'effacent. */
function RotatingExample() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 right-12 flex items-center overflow-hidden text-[15px] text-fg-muted">
      <span key={index} className="composer-hint block truncate">
        {EXAMPLES[index]}
      </span>
    </span>
  );
}

/**
 * Page d'accueil des visiteurs sans compte : qui est Tamilya, ce qu'en disent ses
 * utilisateurs, et un champ pour lui parler tout de suite.
 * `onStart` lance la conversation (avec son animation, voir GuestHome).
 */
export function GuestLanding({
  reviews,
  leaving,
  hasDraft,
  onStart,
  onResume,
}: {
  /** Avis publiés par les comptes (Paramètres → Mon avis), les plus récents d'abord. */
  reviews: PublicReview[];
  leaving: boolean;
  /** Une conversation d'essai existe déjà sur cet appareil. */
  hasDraft: boolean;
  onStart: (text: string) => void;
  onResume: () => void;
}) {
  const { openAuthDialog } = useAuth();
  const [text, setText] = useState("");
  // Champ : au repos (court), ouvert (étiré), ou qui se referme.
  const [stretch, setStretch] = useState<"rest" | "open" | "closed">("rest");
  // La barre du haut prend sa bordure une fois la page défilée.
  const [scrolled, setScrolled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || leaving) return;
    onStart(clean.slice(0, CHAT_LIMITS.maxUserMessageChars));
  };
  // La page d'accueil défile dans son propre calque (fixed), pas dans la fenêtre.
  const talkAgain = () => {
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    input.current?.focus({ preventScroll: true });
  };
  const signUp = () => openAuthDialog({ mode: "signup", reason: SIGNUP_REASON });
  // Après l'inscription, la personne arrive directement sur son formulaire d'avis.
  const giveReview = () => openAuthDialog({ mode: "signup", reason: REVIEW_REASON, next: "/parametres?rubrique=avis" });

  return (
    <div
      ref={scroller}
      role="region"
      aria-label="Bienvenue sur BTM AI"
      data-leaving={leaving || undefined}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
      className="landing fixed inset-0 z-[55] overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-fg"
    >
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      {/* Barre du haut, collée en haut, floute ce qui passe dessous. */}
      <header
        data-scrolled={scrolled || undefined}
        className="landing-nav sticky top-0 z-20 border-b border-transparent bg-bg/60 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 transition-colors data-[scrolled]:border-border data-[scrolled]:bg-bg/75"
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:gap-6 sm:px-5">
          <button type="button" onClick={talkAgain} aria-label="BTM AI — haut de la page" className="rounded">
            <BrandLogo size="sm" />
          </button>
          <nav aria-label="Navigation" className="hidden items-center gap-1 text-sm text-fg-muted md:flex">
            <a href="#shimaore" className="rounded-md px-2.5 py-1.5 transition hover:text-fg">
              Tamilya
            </a>
            <a href="#avis" className="rounded-md px-2.5 py-1.5 transition hover:text-fg">
              Avis
            </a>
            <Link href="/aide" className="rounded-md px-2.5 py-1.5 transition hover:text-fg">
              Aide
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => openAuthDialog({ mode: "signin" })}
              className="rounded-full px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition hover:text-fg sm:px-3"
            >
              Se connecter
            </button>
            <button type="button" onClick={signUp} className="btn-creme rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap sm:px-4">
              Créer un compte
            </button>
          </div>
        </div>
      </header>

      <main className="landing-content relative z-10">
        {/* Accueil : Tamilya et le champ pour lui parler */}
        <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col items-center justify-center px-5 pt-6 pb-20 text-center">
          <div className="landing-rise">
            <AwaBlob label="Parler à Tamilya" onActivate={() => input.current?.focus()} size="min(32vw, 8rem)" goo={8} />
          </div>

          <p className="landing-rise landing-eyebrow mt-9 [animation-delay:80ms]">Version d&apos;essai · elle apprend encore</p>
          <h1 className="landing-rise landing-title mt-4 [animation-delay:120ms]">
            Parle <span className="landing-accent">shimaoré</span> avec Tamilya
          </h1>
          <p className="landing-rise mx-auto mt-5 max-w-md text-base leading-relaxed text-pretty text-fg-muted [animation-delay:200ms] sm:text-lg">
            Écris-lui en français ou en shimaoré : elle te répond dans la langue de Mayotte.
          </p>

          {/* Le champ s'étire comme un élastique au clic (data-stretch), et reprend sa taille en rebondissant. */}
          <div className="landing-rise mt-9 flex justify-center [animation-delay:280ms]">
            <form
              onSubmit={submit}
              data-stretch={stretch}
              onFocus={() => setStretch("open")}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !text) setStretch("closed");
              }}
              className="landing-input relative"
            >
              <label htmlFor="landing-message" className="sr-only">
                Ton message à Tamilya
              </label>
              <input
                ref={input}
                id="landing-message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={CHAT_LIMITS.maxUserMessageChars}
                autoComplete="off"
                enterKeyHint="send"
                className="w-full rounded-full border border-border bg-bg/80 py-2.5 pr-12 pl-4 text-[15px] backdrop-blur outline-none transition focus:border-[var(--persona,var(--accent))]"
              />
              {text ? null : <RotatingExample />}
              <button
                type="submit"
                disabled={!text.trim() || leaving}
                aria-label="Parler à Tamilya"
                className="btn-creme btn-creme--icon absolute top-1/2 right-1.5 size-8 -translate-y-1/2"
              >
                <IconSend width={16} height={16} />
              </button>
              <span aria-hidden="true" className="landing-input-glow" />
            </form>
          </div>

          {hasDraft ? (
            <p className="landing-rise mt-5 text-xs text-fg-muted [animation-delay:480ms]">
              <button type="button" onClick={onResume} className="font-semibold text-fg underline-offset-4 hover:underline">
                Reprendre ma conversation →
              </button>
            </p>
          ) : null}
        </section>

        {/* Ce qu'il faut savoir sur Tamilya */}
        <section id="shimaore" className="flex min-h-[calc(100dvh-4rem)] scroll-mt-16 flex-col justify-center border-t border-border">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-16">
            <Reveal>
              <h2 className="landing-h2">Une IA qui apprend le shimaoré, pour de vrai</h2>
              <p className="mt-5 max-w-sm leading-relaxed text-fg-muted">
                Tamilya est créée à Mayotte par GROUPE BTM. Pour l&apos;instant, elle se consacre à une seule chose : la langue de l&apos;île.
              </p>
            </Reveal>
            <ul className="divide-y divide-border border-y border-border">
              {POINTS.map((point, i) => (
                <li key={point.title}>
                  <Reveal delay={i * 70} className="grid gap-1.5 py-6 sm:grid-cols-[3rem_1fr] sm:py-7">
                    <span aria-hidden="true" className="landing-index pt-1">
                      0{i + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{point.title}</h3>
                      <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-fg-muted">{point.text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Avis des utilisateurs */}
        <section id="avis" className="relative flex min-h-[calc(100dvh-4rem)] scroll-mt-16 flex-col justify-center overflow-hidden border-t border-border bg-bg-subtle">
          <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,19rem)_1fr] md:items-center md:gap-16">
            <Reveal>
              <h2 className="landing-h2">Ce qu&apos;ils en disent</h2>
              <p className="mt-4 leading-relaxed text-fg-muted">Les avis des personnes qui parlent avec Tamilya.</p>
              {reviews.length ? (
                <div className="mt-8 flex items-center gap-4 border-t border-border pt-6">
                  <span className="text-6xl leading-none font-semibold tracking-[-0.04em] tabular-nums">{ratingFormat.format(average)}</span>
                  <span>
                    <span
                      role="img"
                      aria-label={`Note moyenne ${ratingFormat.format(average)} sur 5`}
                      className="review-stars block text-lg leading-none"
                      style={{ "--fill": `${(average / 5) * 100}%` } as CSSProperties}
                    />
                    <span className="mt-1 block text-sm text-fg-muted">{reviews.length} avis</span>
                  </span>
                </div>
              ) : null}
              <button type="button" onClick={giveReview} className="btn-creme mt-7 rounded-full px-5 py-2.5 text-sm font-semibold">
                Donner mon avis
              </button>
            </Reveal>

            <Reveal delay={80}>
              <ReviewsWall reviews={reviews} onReview={giveReview} />
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="landing-content relative z-10 border-t border-border bg-bg-subtle">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 pt-12 pb-8 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <BrandLogo size="sm" />
            <p className="mt-3 max-w-xs text-sm text-fg-muted">Tamilya, l&apos;assistante qui apprend le shimaoré. Faite à Mayotte par GROUPE BTM.</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Tamilya</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                <button type="button" onClick={talkAgain} className="transition hover:text-fg">
                  Lui parler
                </button>
              </li>
              <li>
                <button type="button" onClick={signUp} className="transition hover:text-fg">
                  Créer un compte
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openAuthDialog({ mode: "signin" })} className="transition hover:text-fg">
                  Se connecter
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Infos</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                <Link href="/aide" className="transition hover:text-fg">
                  Aide
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="transition hover:text-fg">
                  Données et confidentialité
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl flex-col gap-1 border-t border-border px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-fg-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} GROUPE BTM · Bâtir la Technologie de Mayotte</p>
          <p>Tamilya peut se tromper. Vérifie les informations importantes.</p>
        </div>
      </footer>
    </div>
  );
}
