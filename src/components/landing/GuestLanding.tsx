"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AwaBlob } from "@/components/chat/AwaBlob";
import { IconSend } from "@/components/ui/icons";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import type { AwaProgress } from "@/lib/landing/progress";

const PERSONA = "var(--persona,var(--accent))";

/** Exemples qui défilent dans le champ « Parle à Awa ». */
const EXAMPLES = [
  "Où passer le code de la route près de chez moi ?",
  "Comment dit-on « merci » en shimaoré ?",
  "Quelles offres d'emploi à Mayotte en ce moment ?",
  "Quoi de neuf à Mayotte aujourd'hui ?",
  "Aide-moi à écrire une lettre de motivation",
];

const USES = [
  { emoji: "🚗", title: "Le code de la route", text: "Le bureau La Poste le plus proche de chez toi et les places libres, jour par jour." },
  { emoji: "🗣️", title: "Le shimaoré", text: "Awa apprend la langue de Mayotte chaque jour avec des locuteurs de GROUPE BTM, et te répond dans ta langue." },
  { emoji: "💼", title: "L'emploi", text: "Les offres du moment à Mayotte, trouvées et résumées pour toi." },
  { emoji: "📰", title: "L'actualité", text: "Ce qui se passe sur l'île aujourd'hui, en quelques phrases." },
  { emoji: "📄", title: "Les démarches", text: "Administration, santé, transports : des réponses claires, vérifiées par l'équipe." },
  { emoji: "🌙", title: "Tout le temps", text: "Le soir, le week-end, depuis ton téléphone : Awa est toujours là pour toi." },
];

const STEPS = [
  { n: 1, title: "Pose ta question", text: "En français, en shimaoré, comme tu parles : Awa comprend." },
  { n: 2, title: "Awa te répond", text: "Clairement, avec ce qui est utile à Mayotte. Si elle ne sait pas, elle le dit." },
  { n: 3, title: "Garde tes conversations", text: "Crée ton compte gratuit pour continuer et retrouver tout ce qu'elle t'a dit." },
];

const numberFormat = new Intl.NumberFormat("fr-FR");

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

/** Chiffre qui compte jusqu'à sa valeur quand il apparaît. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / 1400);
        setShown(Math.round(value * (1 - (1 - k) ** 3)));
        if (k < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <span ref={ref} className="tabular-nums">
      {numberFormat.format(shown)}
    </span>
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
 * Page d'accueil des visiteurs sans compte : qui est Awa, ce qu'elle fait
 * pour Mayotte, où elle en est, et un champ pour lui parler tout de suite.
 * `onStart` lance la conversation (avec son animation, voir GuestHome).
 */
export function GuestLanding({
  progress,
  leaving,
  hasDraft,
  onStart,
  onResume,
}: {
  progress: AwaProgress;
  leaving: boolean;
  /** Une conversation d'essai existe déjà sur cet appareil. */
  hasDraft: boolean;
  onStart: (text: string, origin: { x: number; y: number }) => void;
  onResume: (origin: { x: number; y: number }) => void;
}) {
  const { openAuthDialog } = useAuth();
  const [text, setText] = useState("");
  // Champ : au repos (court), ouvert (étiré), ou qui se referme.
  const [stretch, setStretch] = useState<"rest" | "open" | "closed">("rest");
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const percent = progress.curriculum.total ? Math.round((progress.curriculum.learned / progress.curriculum.total) * 100) : 0;

  const originOf = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  };
  const start = (message: string, from: Element | null) => {
    const clean = message.trim();
    if (!clean || leaving) return;
    onStart(clean.slice(0, CHAT_LIMITS.maxUserMessageChars), originOf(from));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(text, form.current);
  };
  const talkAgain = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    input.current?.focus({ preventScroll: true });
  };

  return (
    <div
      role="region"
      aria-label="Bienvenue sur BTM AI"
      data-leaving={leaving || undefined}
      className="landing fixed inset-0 z-[55] overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-fg"
    >
      <div aria-hidden="true" className="landing-aurora" />

      {/* Navigation : deux pilules flottantes côte à côte, fixées en bas (liens à gauche, compte à droite). */}
      <div className="landing-dock fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center gap-2 px-3">
        <nav aria-label="Navigation" className="flex items-center gap-0.5 rounded-full border border-border bg-bg/75 py-1.5 pr-1.5 pl-4 whitespace-nowrap shadow-[0_18px_50px_-15px_rgb(0_0_0/0.55)] backdrop-blur-xl">
          <BrandLogo size="sm" />
          <span className="ml-2 hidden items-center gap-0.5 text-sm text-fg-muted md:flex">
            {[
              ["#utile", "Ce qu'elle fait"],
              ["#progres", "Ses progrès"],
              ["#comment", "Comment ça marche"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 transition hover:bg-bg-muted hover:text-fg">
                {label}
              </a>
            ))}
          </span>
        </nav>
        <div className="flex items-center gap-1 rounded-full border border-border bg-bg/75 p-1.5 whitespace-nowrap shadow-[0_18px_50px_-15px_rgb(0_0_0/0.55)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => openAuthDialog({ mode: "signin" })}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-bg-muted hover:text-fg"
          >
            Se connecter
          </button>
          <button
            type="button"
            onClick={() => openAuthDialog({ mode: "signup", reason: "Crée ton compte gratuit pour parler à Awa sans limite." })}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ background: PERSONA }}
          >
            Créer un compte
          </button>
        </div>
      </div>

      <main className="landing-content relative z-10 pb-24">
        {/* Accueil : Awa et le champ pour lui parler */}
        <section className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-28 text-center">
          <div className="landing-rise">
            <AwaBlob label="Parler à Awa" onActivate={() => input.current?.focus()} size="min(38vw, 9.5rem)" goo={8} />
          </div>

          <h1 className="landing-rise mt-8 text-4xl leading-[1.05] font-bold tracking-tight [animation-delay:120ms] sm:text-6xl">
            Awa, l&apos;IA qui parle <span style={{ color: PERSONA }}>Mahorais</span>
          </h1>
          <p className="landing-rise mt-4 text-base text-fg-muted [animation-delay:200ms] sm:text-lg">En français ou en shimaoré, pose-lui ta question.</p>

          {/* Le champ s'étire comme un élastique au clic (data-stretch), et reprend sa taille en rebondissant. */}
          <div className="landing-rise mt-8 flex justify-center [animation-delay:280ms]">
          <form
            ref={form}
            onSubmit={submit}
            data-stretch={stretch}
            onFocus={() => setStretch("open")}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !text) setStretch("closed");
            }}
            className="landing-input relative"
          >
            <label htmlFor="landing-message" className="sr-only">
              Ton message à Awa
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
              aria-label="Parler à Awa"
              className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40"
              style={{ background: PERSONA }}
            >
              <IconSend width={16} height={16} />
            </button>
            <span aria-hidden="true" className="landing-input-glow" />
          </form>
          </div>



          <p className="landing-rise mt-5 text-xs text-fg-muted [animation-delay:480ms]">
            {CHAT_LIMITS.guestTrialMessages} messages offerts, sans compte ·{" "}
            {hasDraft ? (
              <button type="button" onClick={(e) => onResume(originOf(e.currentTarget))} className="font-semibold text-fg underline-offset-4 hover:underline">
                Reprendre ma conversation →
              </button>
            ) : (
              "gratuit"
            )}
          </p>


        </section>

        {/* Ce qu'Awa fait pour Mayotte */}
        <section id="utile" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ce qu&apos;Awa fait pour Mayotte</h2>
            <p className="mt-3 text-fg-muted">Une assistante pensée pour l&apos;île, ses habitants et ses entreprises.</p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USES.map((use, i) => (
              <Reveal key={use.title} delay={i * 70}>
                <div className="landing-card group h-full rounded-3xl border border-border bg-bg/70 p-6 backdrop-blur">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-[var(--persona-soft,var(--bg-muted))] text-2xl transition group-hover:scale-110 group-hover:rotate-6">
                    {use.emoji}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{use.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{use.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Où en est Awa */}
        <section id="progres" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-20">
          <Reveal>
            <div className="landing-progress overflow-hidden rounded-[2rem] border border-border p-6 sm:p-10">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Elle apprend le shimaoré, mot après mot</h2>
                  <p className="mt-3 text-fg-muted">
                    Chaque mot est appris auprès de locuteurs de Mayotte et vérifié par l&apos;équipe de GROUPE BTM. Awa n&apos;invente pas : quand elle
                    ne connaît pas un mot, elle le dit et demande qu&apos;on le lui apprenne.
                  </p>
                  <dl className="mt-8 grid grid-cols-3 gap-3">
                    {[
                      { label: "mots de shimaoré", value: progress.words },
                      { label: "expressions validées", value: progress.expressions },
                      { label: "fiches sur Mayotte", value: progress.knowledge },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-bg/70 p-4 backdrop-blur">
                        <dd className="text-2xl font-bold tracking-tight sm:text-4xl">
                          <CountUp value={stat.value} />
                        </dd>
                        <dt className="mt-1 text-xs text-fg-muted">{stat.label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-3xl bg-bg/70 p-6 backdrop-blur">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">Programme des mots essentiels</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: PERSONA }}>
                      {percent} %
                    </p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-bg-muted">
                    <div className="landing-bar h-full rounded-full" style={{ width: `${percent}%`, background: PERSONA }} />
                  </div>
                  <p className="mt-2 text-xs text-fg-muted">
                    {numberFormat.format(progress.curriculum.learned)} mots sur {numberFormat.format(progress.curriculum.total)} : salutations, famille,
                    nourriture, nombres…
                  </p>
                  {progress.themes.length ? (
                    <ul className="mt-6 space-y-3">
                      {progress.themes.map((theme) => {
                        const p = Math.round((theme.learned / theme.total) * 100);
                        return (
                          <li key={theme.label}>
                            <div className="flex justify-between text-sm">
                              <span>{theme.label}</span>
                              <span className="tabular-nums text-fg-muted">{p} %</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                              <div className="landing-bar h-full rounded-full" style={{ width: `${p}%`, background: `oklch(0.68 0.16 ${theme.hue})` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Comment ça marche */}
        <section id="comment" className="mx-auto max-w-5xl scroll-mt-6 px-5 py-20">
          <Reveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple comme bonjour</h2>
            <p className="mt-2 text-fg-muted">« Jéjé », comme on dit ici.</p>
          </Reveal>
          <ol className="mt-12 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 90}>
                <li className="h-full rounded-3xl border border-border bg-bg/70 p-6 backdrop-blur">
                  <span className="grid size-10 place-items-center rounded-full text-sm font-bold text-white" style={{ background: PERSONA }}>
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Dernier appel */}
        <section className="mx-auto max-w-3xl px-5 pt-10 pb-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Prêt à parler à <span style={{ color: PERSONA }}>Awa</span> ?
            </h2>
            <p className="mt-3 text-fg-muted">{CHAT_LIMITS.guestTrialMessages} messages offerts, sans compte. Ensuite, c&apos;est gratuit avec ton compte.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={talkAgain}
                className="rounded-full px-6 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
                style={{ background: PERSONA }}
              >
                Parler à Awa
              </button>
              <button
                type="button"
                onClick={() => openAuthDialog({ mode: "signup", reason: "Crée ton compte gratuit pour parler à Awa sans limite." })}
                className="rounded-full border border-border bg-bg/70 px-6 py-3 font-semibold transition hover:bg-bg-muted"
              >
                Créer mon compte
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing-content relative z-10 border-t border-border px-5 py-8 text-center text-xs text-fg-muted">
        © {new Date().getFullYear()} GROUPE BTM · Bâtir la Technologie de Mayotte
      </footer>
    </div>
  );
}
