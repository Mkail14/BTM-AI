"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AwaBlob } from "@/components/chat/AwaBlob";
import { IconSend } from "@/components/ui/icons";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import type { PublicReview } from "@/lib/reviews/rules";
import type { Announcement } from "@/lib/site/announcement-rules";
import { AnnouncementBar } from "./AnnouncementBar";
import { ChatDemo } from "./ChatDemo";
import { LandingNav } from "./LandingNav";
import { ReviewsWall } from "./ReviewsWall";

const SIGNUP_REASON = "Crée ton compte gratuit pour parler à Tamilya sans limite.";
const REVIEW_REASON = "Crée ton compte gratuit pour donner ton avis sur Tamilya.";

/*
 * Pour l'instant, Tamilya ne fait qu'une chose en public : parler shimaoré.
 * Les autres fonctionnalités (code de la route, emploi, actualité…) ne sont
 * pas encore ouvertes : ne pas les annoncer ici tant qu'elles ne le sont pas.
 */

/** Une seule phrase fixe dans le champ : la ligne tapée sous le titre bouge déjà. */
const EXAMPLE = "Comment dit-on merci ?";

const POINTS = [
  {
    title: "Elle te répond en shimaoré",
    text: "Écris-lui en français ou en shimaoré, comme tu parles. Sa réponse vient toujours en shimaoré.",
    tag: "maison → nyumba",
  },
  {
    title: "Elle n'invente pas",
    text: "Elle n'utilise que des mots vérifiés. Quand elle ne connaît pas un mot, elle le dit au lieu de deviner.",
    tag: "✓ Mots vérifiés",
  },
  {
    title: "Elle apprend chaque jour",
    text: "Des locuteurs de Mayotte lui apprennent de nouveaux mots, relus par l'équipe de GROUPE BTM.",
    tag: "Relus par GROUPE BTM",
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

/** Phrases tapées sous le titre, une à une : courtes, et rien que Tamilya ne sache pas faire. */
const TYPED_LINES = [
  "Écris-lui en français ou en shimaoré.",
  "Demande-lui comment dire « merci ».",
  "Apprends à saluer en shimaoré.",
  "Elle n'invente aucun mot.",
  "Chaque jour, elle apprend de nouveaux mots.",
];

/** Vitesses de la machine à écrire (ms) : par lettre tapée, par lettre effacée, pauses. */
const TYPE_MS = 45;
const ERASE_MS = 22;
const HOLD_MS = 1800;
const NEXT_MS = 350;

/**
 * Sous-titre en machine à écrire : la phrase s'écrit, reste un instant,
 * s'efface, puis la suivante s'écrit. Les lecteurs d'écran lisent la
 * première phrase, fixe ; si l'appareil limite les animations, elle reste
 * affichée sans bouger.
 */
function TypedLine() {
  const [line, setLine] = useState(0);
  const [count, setCount] = useState(0);
  const [erasing, setErasing] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (still) return;
    const full = TYPED_LINES[line].length;
    let timer: number;
    if (!erasing && count < full) timer = window.setTimeout(() => setCount((c) => c + 1), TYPE_MS);
    else if (!erasing) timer = window.setTimeout(() => setErasing(true), HOLD_MS);
    else if (count > 0) timer = window.setTimeout(() => setCount((c) => c - 1), ERASE_MS);
    else
      timer = window.setTimeout(() => {
        setErasing(false);
        setLine((l) => (l + 1) % TYPED_LINES.length);
      }, NEXT_MS);
    return () => window.clearTimeout(timer);
  }, [still, line, count, erasing]);

  return (
    <>
      <span className="sr-only">{TYPED_LINES[0]}</span>
      {/*
       * Toutes les phrases sont posées, invisibles, dans la même case : la case
       * prend la taille de la plus grande (une ou deux lignes selon l'écran) et
       * ne change plus. La phrase tapée s'écrit par-dessus : rien ne bouge autour.
       */}
      <span aria-hidden="true" className="grid">
        {TYPED_LINES.map((text) => (
          <span key={text} className="invisible col-start-1 row-start-1">
            {text}
          </span>
        ))}
        <span className="col-start-1 row-start-1">
          {still ? TYPED_LINES[0] : TYPED_LINES[line].slice(0, count)}
          {still ? null : <span className="typed-caret" />}
        </span>
      </span>
    </>
  );
}

/**
 * Page d'accueil des visiteurs sans compte : qui est Tamilya, ce qu'en disent ses
 * utilisateurs, et un champ pour lui parler tout de suite.
 * `onStart` lance la conversation (avec son animation, voir GuestHome).
 */
export function GuestLanding({
  reviews,
  announcement,
  leaving,
  hasDraft,
  onStart,
  onResume,
}: {
  /** Avis publiés par les comptes (Paramètres → Mon avis), les plus récents d'abord. */
  reviews: PublicReview[];
  /** Bandeau sous la barre du haut (administration → Bandeau) ; null : éteint. */
  announcement: Announcement | null;
  leaving: boolean;
  /** Une conversation d'essai existe déjà sur cet appareil. */
  hasDraft: boolean;
  onStart: (text: string) => void;
  onResume: () => void;
}) {
  const { openAuthDialog } = useAuth();
  const [text, setText] = useState("");
  // Champ : au repos (court), ouvert (étiré), ou qui se referme.
  // La barre du haut prend sa bordure une fois la page défilée.
  const [scrolled, setScrolled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Largeur réelle du titre (sa ligne la plus longue) : le champ ouvert ne la dépasse pas.
  const title = useRef<HTMLSpanElement>(null);
  const [titleWidth, setTitleWidth] = useState<number>();
  useEffect(() => {
    const el = title.current;
    if (!el) return;
    const measure = () => setTitleWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, []);
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
      <LandingNav scrolled={scrolled} onHome={talkAgain} />

      <main className="landing-content relative">
        {/* Bandeau + accueil remplissent l'écran sous la barre (3 rem au téléphone, 2,75 rem sur ordinateur) : l'accueil se centre dans l'espace restant. */}
        <div className="flex min-h-[calc(100dvh-3rem-env(safe-area-inset-top))] flex-col md:min-h-[calc(100dvh-2.75rem-env(safe-area-inset-top))]">
          {announcement ? <AnnouncementBar announcement={announcement} /> : null}

          {/* Accueil : Tamilya et le champ pour lui parler, marges égales en haut et en bas. */}
          <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-10 text-center">
            <div aria-hidden="true" className="landing-aurora" />
            <div className="landing-rise">
              <AwaBlob label="Parler à Tamilya" onActivate={() => input.current?.focus()} size="min(32vw, 8rem)" goo={8} />
            </div>

            <h1 className="landing-rise landing-title mt-9 [animation-delay:120ms]">
              <span ref={title}>
                Parle <span className="landing-accent">shimaoré</span> avec Tamilya
              </span>
            </h1>
            <p className="landing-rise mx-auto mt-5 max-w-md text-base leading-relaxed text-pretty text-fg-muted [animation-delay:200ms] sm:text-lg">
              <TypedLine />
            </p>

            {/* Champ sobre (hauteur de la barre du haut, fond doux sans contour) qui s'allonge en douceur au clic. */}
            <div className="landing-rise mt-2 flex justify-center [animation-delay:280ms]">
              <form
                onSubmit={submit}
                data-filled={text ? "" : undefined}
                className="landing-input relative"
                style={titleWidth ? ({ "--title-w": `${titleWidth}px` } as CSSProperties) : undefined}
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
                  placeholder={EXAMPLE}
                  className="h-11 text-ellipsis w-full rounded-full bg-white pr-12 pl-4 text-[15px] shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_10px_28px_-14px_rgb(0_0_0/0.3)] outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-fg-muted hover:shadow-[0_0_0_1px_rgb(0_0_0/0.13),0_10px_28px_-14px_rgb(0_0_0/0.35)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--persona,var(--accent))_45%,transparent),0_0_0_4px_color-mix(in_srgb,var(--persona,var(--accent))_14%,transparent)] dark:bg-white/[0.08] dark:shadow-none dark:hover:bg-white/[0.1] dark:hover:shadow-none dark:focus:bg-white/[0.1] dark:focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--persona,var(--accent))_18%,transparent)]"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || leaving}
                  aria-label="Parler à Tamilya"
                  className="btn-rose btn-rose--icon absolute top-1/2 right-1.5 size-8 -translate-y-1/2"
                >
                  <IconSend width={16} height={16} />
                </button>
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
        </div>

        {/* Ce qu'il faut savoir sur Tamilya : fond d'eau rose floutée (.landing-eau), une conversation d'exemple et trois cartes. */}
        {/* Ordinateur : tout tient sur un écran sous la barre du haut (2,75 rem) ; la conversation prend la place qui reste. */}
        <section id="shimaore" className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden pt-12 md:h-dvh md:min-h-[36rem] md:pt-11">
          <div aria-hidden="true" className="landing-eau" />
          <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-12 md:h-full md:py-8">
            {/* Même grille que les cartes du dessous : la conversation tombe pile au-dessus de la troisième carte. */}
            <div className="grid gap-10 md:min-h-0 md:flex-1 md:grid-cols-3 md:grid-rows-1 md:gap-4">
              <Reveal className="md:col-span-2 md:self-center md:pr-12">
                <h2 className="landing-h2">Une IA qui apprend le shimaoré, pour de vrai</h2>
                <p className="mt-5 max-w-sm leading-relaxed text-fg-muted">
                  Tamilya est créée à Mayotte par GROUPE BTM. Pour l&apos;instant, elle se consacre à une seule chose : la langue de l&apos;île.
                </p>
              </Reveal>
              <Reveal delay={80} className="md:h-full md:min-h-0">
                <ChatDemo />
              </Reveal>
            </div>

            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              {POINTS.map((point, i) => (
                <li key={point.title}>
                  <Reveal delay={i * 70} className="landing-glass flex h-full flex-col rounded-3xl p-5 md:p-4">
                    <span aria-hidden="true" className="landing-index">
                      0{i + 1}
                    </span>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight md:text-base">{point.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-fg-muted md:text-sm">{point.text}</p>
                    <p className="mt-auto pt-3">
                      <span className="inline-block rounded-full bg-white/60 px-3 py-1 text-xs font-medium dark:bg-white/[0.08]">{point.tag}</span>
                    </p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Avis des utilisateurs */}
        <section id="avis" className="relative flex min-h-[calc(100dvh-4rem)] scroll-mt-16 flex-col justify-center overflow-hidden border-t border-border landing-soft">
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
              <button type="button" onClick={giveReview} className="btn-rose mt-7 rounded-full px-5 py-2.5 text-sm font-semibold">
                Donner mon avis
              </button>
            </Reveal>

            <Reveal delay={80}>
              <ReviewsWall reviews={reviews} onReview={giveReview} />
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="landing-content relative z-10 border-t border-border landing-soft">
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
