"use client";

import type { AuthError } from "@supabase/supabase-js";
import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { IconClose } from "@/components/ui/icons";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { addressFieldErrors } from "@/lib/address";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/auth/disposable-email";
import {
  isPasswordValid,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
  normalizeEmail,
  passwordChecks,
  suggestEmailCorrection,
} from "@/lib/auth/signup";
import { hasNativeGoogle, nativeGoogleSignIn, renderGoogleButton, subscribeNativeGoogle, watchGoogleButton } from "@/lib/auth/google-identity";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthUser } from "./AuthProvider";


export type AuthDialogOptions = {
  /** Explique pourquoi un compte est nécessaire (affiché en tête). */
  reason?: string;
  /** Chemin interne vers lequel revenir après connexion. */
  next?: string;
  mode?: "signin" | "signup";
  /** Connexion seule : pas de lien vers l'inscription (maintenance). */
  signupClosed?: boolean;
};

type View = "signin" | "signup" | "confirm";
type SignedInHandler = (user: AuthUser, next?: string) => void;

const RESEND_COOLDOWN_SECONDS = 60;
/*
 * Champs sobres : blanc à fin contour en clair, verre fumé en sombre, halo rose au
 * focus, coins peu arrondis. text-base (16 px) au téléphone : en dessous, Safari sur
 * iPhone zoome sur le champ touché ; 14 px sur ordinateur.
 */
const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base outline-none transition-[border-color,box-shadow] placeholder:text-fg-muted/70 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 aria-[invalid=true]:border-danger dark:border-white/10 dark:bg-white/[0.06] sm:text-sm";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-fg-muted";

function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Ton adresse e-mail n'est pas encore confirmée. Clique sur le lien reçu par e-mail.";
    case "user_already_exists":
    case "email_exists":
      return "Un compte existe déjà avec cette adresse. Connecte-toi ou réinitialise ton mot de passe.";
    case "weak_password":
      return "Ce mot de passe est trop faible. Choisis-en un plus long ou plus varié.";
    case "email_address_invalid":
      return "Cette adresse e-mail n'est pas valide.";
    // Limite globale du service d'e-mails de Supabase (tous utilisateurs
    // confondus), pas une faute de la personne.
    case "over_email_send_rate_limit":
      return "L'envoi d'e-mails est momentanément saturé. Réessaie un peu plus tard.";
    case "over_request_rate_limit":
      return "Trop de tentatives depuis cette connexion. Patiente quelques minutes avant de réessayer.";
    case "signup_disabled":
      return "Les inscriptions sont momentanément fermées.";
    default:
      return "La demande n'a pas abouti. Vérifie tes informations et réessaie.";
  }
}

/** Lien de retour après confirmation ; `bienvenue=1` affiche un message d'accueil. */
function confirmationRedirect(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}&bienvenue=1`;
}

export function AuthDialog({
  options,
  authAvailable,
  onClose,
  onSignedIn,
}: {
  options: AuthDialogOptions | null;
  authAvailable: boolean;
  onClose: () => void;
  onSignedIn: SignedInHandler;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = options !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() place le focus sur le premier bouton (Fermer), qui s'entoure
      // alors d'un anneau sans qu'on l'ait choisi. On le déplace sur le premier
      // champ du formulaire (souris et clavier seulement : sur écran tactile, le
      // clavier surgirait et masquerait la moitié de la fenêtre), sinon sur la
      // fenêtre elle-même : le lecteur d'écran annonce son titre, Tab mène ensuite au premier bouton.
      const field = window.matchMedia("(pointer: fine)").matches
        ? dialog.querySelector<HTMLElement>("[data-active] [data-autofocus]")
        : null;
      (field ?? dialog).focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Fenêtre ouverte : la page derrière ne défile pas.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Focusable par le script seulement (voir plus haut), sans contour : ce n'est pas un bouton.
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      // Téléphone : panneau qui monte du bas, pleine largeur. Ordinateur : fenêtre centrée, même
      // largeur pour la connexion et l'inscription. La page derrière est assombrie et floutée, et
      // rien ne défile : tout tient sur un écran (inscription en deux colonnes sur ordinateur).
      className="auth-sheet mx-0 mt-auto mb-0 max-h-dvh w-full max-w-none overflow-y-auto rounded-t-[26px] outline-none border-t border-black/5 bg-bg-subtle p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-md [scrollbar-width:none] dark:border-white/10 sm:m-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-2rem)] sm:max-w-[460px] sm:rounded-[28px] sm:border sm:pb-0"
    >
      {open ? (
        <AuthPanel
          key={`${options.mode ?? "signin"}-${options.reason ?? ""}`}
          options={options}
          titleId={titleId}
          authAvailable={authAvailable}
          onClose={onClose}
          onSignedIn={onSignedIn}
        />
      ) : null}
    </dialog>
  );
}

function AuthPanel({
  options,
  titleId,
  authAvailable,
  onClose,
  onSignedIn,
}: {
  options: AuthDialogOptions;
  titleId: string;
  authAvailable: boolean;
  onClose: () => void;
  onSignedIn: SignedInHandler;
}) {
  const [view, setView] = useState<View>(options.mode ?? "signin");
  // Comme sur btm.yt : un écran d'accueil (logo, titre, croquis), puis le formulaire.
  const [welcome, setWelcome] = useState(authAvailable);
  // L'adresse est partagée entre les écrans : pas besoin de la retaper.
  const [email, setEmail] = useState("");
  const next = options.next ?? "/";
  const isSignup = view === "signup";
  // Passage d'un écran à l'autre : le focus suit (le bouton touché disparaît avec son écran).
  // « Continuer avec l'e-mail » mène au premier champ ; « Autres options », au bouton e-mail.
  const formRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const shownWelcome = useRef(welcome);
  useEffect(() => {
    if (shownWelcome.current === welcome) return;
    shownWelcome.current = welcome;
    const target = welcome
      ? welcomeRef.current?.querySelector<HTMLElement>("[data-email-choice]")
      : formRef.current?.querySelector<HTMLElement>("[data-active] [data-autofocus]");
    target?.focus();
  }, [welcome]);

  const titles: Record<View, string> = {
    signin: "Connexion",
    signup: "Créer un compte",
    confirm: "Confirme ton adresse e-mail",
  };

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="zone-appui absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-black/[0.05] text-fg transition hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.13]"
      aria-label="Fermer"
    >
      <IconClose width={16} height={16} />
    </button>
  );

  const switchLine = options.signupClosed ? null : (
    <p className="text-center text-sm text-fg-muted">
      {isSignup ? "Déjà un compte ? " : "Pas encore de compte ? "}
      <button
        type="button"
        onClick={() => setView(isSignup ? "signin" : "signup")}
        className="font-semibold text-accent hover:underline"
      >
        {isSignup ? "Se connecter" : "Créer un compte"}
      </button>
    </p>
  );

  if (welcome) {
    return (
      // Même taille que la carte de btm.yt : 460 × 780 px sur ordinateur (moins si l'écran est plus bas),
      // presque tout l'écran sur téléphone.
      <div ref={welcomeRef} className="relative isolate flex min-h-[calc(100dvh-env(safe-area-inset-top)-44px)] flex-col items-center overflow-hidden px-6 pt-9 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center sm:min-h-[min(780px,calc(100dvh-3rem))] sm:px-9 sm:pt-10 sm:pb-8">
        <LagonSketch />
        {/* Poignée du panneau, sur téléphone seulement */}
        <div aria-hidden="true" className="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-fg/15 sm:hidden" />
        {closeButton}
        <div className="mt-[clamp(0px,3vh,40px)] flex flex-col items-center gap-[clamp(10px,2.2vh,20px)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icone-192.png"
            alt=""
            width={78}
            height={78}
            className="size-[clamp(60px,9vh,78px)] rounded-[clamp(18px,2.6vh,24px)] shadow-[0_14px_30px_rgba(17,17,17,0.25)]"
          />
          <h2 id={titleId} className="text-[clamp(2.2rem,6.2vh,3.2rem)] leading-[0.95] font-bold tracking-tight">
            {isSignup ? "Rejoins" : "Bienvenue chez"}
            <br />
            BTM AI
          </h2>
        </div>
        <p className="mt-[clamp(16px,4vh,40px)] text-[15px] leading-relaxed text-fg-muted">
          Pose tes questions à Tamilya.
          <br />
          Retrouve tes conversations partout.
        </p>
        {options.reason ? (
          <p className="mt-4 w-full rounded-xl border border-border bg-accent-soft px-3.5 py-2.5 text-left text-sm font-medium">
            {options.reason}
          </p>
        ) : null}
        <div className="mt-auto w-full max-w-[400px] pt-[clamp(14px,3vh,30px)]">
          <button
            type="button"
            onClick={() => setWelcome(false)}
            data-email-choice=""
            className="btn-rose h-11 w-full rounded-full px-5 text-sm font-semibold"
          >
            {isSignup ? "S'inscrire avec l'e-mail" : "Continuer avec l'e-mail"}
          </button>
          <GoogleButton next={next} isSignup={isSignup} onSignedIn={onSignedIn} />
        </div>
        <div className="mt-[clamp(12px,2.4vh,22px)]">{switchLine}</div>
        <p className="mt-2.5 max-w-[320px] text-xs leading-normal text-fg-muted">
          En continuant, tu acceptes les{" "}
          <Link href="/confidentialite" target="_blank" className="underline underline-offset-2">
            règles de confidentialité
          </Link>{" "}
          de BTM AI.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={formRef}
      data-view={view}
      className="relative px-5 pt-[4.5rem] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-9 sm:pt-[4.5rem] sm:pb-8"
    >
      {/* Poignée du panneau, sur téléphone seulement */}
      <div aria-hidden="true" className="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-fg/15 sm:hidden" />
      {authAvailable && view !== "confirm" ? (
        <button
          type="button"
          onClick={() => setWelcome(true)}
          className="absolute top-4 left-4 z-10 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/[0.05] pr-4 pl-3 text-sm font-semibold transition hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.13]"
        >
          <span aria-hidden="true" className="text-base leading-none">‹</span> Autres options
        </button>
      ) : null}
      {closeButton}

      <h2 id={titleId} className="text-[1.9rem] leading-tight font-bold tracking-tight">
        {titles[view]}
      </h2>
      {view !== "confirm" ? (
        <p className="mt-1 text-sm leading-snug text-fg-muted">
          {options.reason ??
            (isSignup ? "Gratuit. Retrouve tes conversations sur tous tes appareils." : "Retrouve tes conversations avec Tamilya.")}
        </p>
      ) : null}

      {!authAvailable ? (
        <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm" role="status">
          Les comptes ne sont pas encore disponibles sur ce serveur : Supabase n&apos;est pas configuré.
        </p>
      ) : view === "confirm" ? (
        <ConfirmationSent
          email={email}
          next={next}
          onChangeEmail={() => setView("signup")}
          onGoToSignIn={() => setView("signin")}
        />
      ) : (
        <>
          {/*
           * Les deux formulaires restent montés (ce qu'on y a tapé est gardé), mais seul celui
           * affiché prend de la place : la connexion, courte, ne laisse plus de grand vide.
           */}
          <div>
            {(["signin", "signup"] as const).map((value) => {
              const active = view === value;
              return (
                <div
                  key={value}
                  data-active={active || undefined}
                  inert={!active}
                  className={active ? "flex flex-col" : "hidden"}
                >
                  {value === "signin" ? (
                    <SignInForm email={email} onEmailChange={setEmail} next={next} onClose={onClose} onSignedIn={onSignedIn} />
                  ) : (
                    <SignUpForm
                      email={email}
                      onEmailChange={setEmail}
                      next={next}
                      onClose={onClose}
                      onSignedIn={onSignedIn}
                      onConfirmationSent={() => setView("confirm")}
                      onGoToSignIn={() => setView("signin")}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-6">{switchLine}</div>
        </>
      )}
    </div>
  );
}

/**
 * Connexion ou inscription avec Google, comme sur btm.yt : le bouton de Google
 * ouvre sa fenêtre par-dessus le site, et le jeton rendu ouvre la session ici
 * (signInWithIdToken). Le compte est créé à la première venue (prénom pris chez
 * Google). Si le script de Google ne se charge pas (bloqueur…), notre bouton
 * prend le relais par redirection (/auth/callback).
 */
function GoogleButton({ next, isSignup, onSignedIn }: { next: string; isSignup: boolean; onSignedIn: SignedInHandler }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bouton de Google en état de marche : le nôtre, identique, s'efface.
  const [ready, setReady] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const handler = useRef(onSignedIn);
  useEffect(() => {
    handler.current = onSignedIn;
  });

  // Application Android : notre bouton seul, qui ouvre le sélecteur de compte du téléphone (on ne quitte pas l'app).
  const native = useSyncExternalStore(subscribeNativeGoogle, hasNativeGoogle, () => false);

  useEffect(() => {
    const element = slot.current;
    if (!element || native) return;
    let cancelled = false;
    let stopWatching = () => {};
    renderGoogleButton(element, {
      signup: isSignup,
      dark: document.documentElement.dataset.theme === "dark",
      isStale: () => cancelled,
      onToken: async (token, nonce) => {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        setPending(true);
        setFailed(false);
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
          if (error || !data.user) {
            console.warn("[google] Supabase a refusé le jeton :", error?.code, error?.message);
            setFailed(true);
            return;
          }
          const meta = data.user.user_metadata ?? {};
          const name = meta.display_name ?? meta.given_name;
          handler.current({ id: data.user.id, email: data.user.email ?? null, displayName: typeof name === "string" ? name : null }, next);
        } catch {
          setFailed(true);
        } finally {
          setPending(false);
        }
      },
    })
      .then(() => {
        if (!cancelled) stopWatching = watchGoogleButton(element, () => setReady(true));
      })
      .catch(() => {
        // Script de Google bloqué : notre bouton reste, par redirection.
      });
    return () => {
      cancelled = true;
      stopWatching();
      // Le bouton web part (le pont du téléphone vient d'arriver, ou il va être redessiné) : notre bouton
      // reprend sa place, sinon un bouton Google qui ne marche pas dans l'app resterait à l'écran.
      element.replaceChildren();
      setReady(false);
    };
  }, [isSignup, next, native]);

  async function startNative() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPending(true);
    setFailed(false);
    try {
      const picked = await nativeGoogleSignIn();
      if (picked === "cancelled") return;
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: picked.token, nonce: picked.nonce });
      if (error || !data.user) {
        console.warn("[google] Supabase a refusé le jeton :", error?.code, error?.message);
        setFailed(true);
        return;
      }
      const meta = data.user.user_metadata ?? {};
      const name = meta.display_name ?? meta.given_name;
      handler.current({ id: data.user.id, email: data.user.email ?? null, displayName: typeof name === "string" ? name : null }, next);
    } catch (error) {
      console.warn("[google] sélecteur de compte :", error instanceof Error ? error.message : error);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function start() {
    if (native) return startNative();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      // Sans erreur, le navigateur part chez Google : on laisse « patienter » affiché.
      if (error) {
        console.warn("[google] Supabase a refusé la demande :", error.code, error.message);
        setFailed(true);
        setPending(false);
      }
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      {/* Bouton de Google (dessiné par lui), à la place du nôtre dès qu'il est prêt. */}
      <div
        ref={slot}
        aria-hidden={!ready || pending}
        className={ready && !pending ? "mt-2.5 flex h-11 w-full justify-center overflow-hidden" : "pointer-events-none h-0 w-full overflow-hidden opacity-0"}
      />
      <button
        type="button"
        onClick={start}
        disabled={pending}
        hidden={ready && !pending}
        className="mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-black/10 bg-white px-5 text-sm font-semibold text-[#1f1f1f] transition hover:bg-black/[0.03] disabled:opacity-70 dark:border-white/15 dark:bg-white/[0.06] dark:text-fg dark:hover:bg-white/[0.1]"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" width={18} height={18}>
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
        </svg>
        {pending ? "Patiente…" : isSignup ? "S'inscrire avec Google" : "Continuer avec Google"}
      </button>
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          La connexion avec Google n&apos;est pas disponible pour le moment.
        </p>
      ) : null}
    </>
  );
}

// Courbes du fond « lagon » de Tamilya (public/fond/lagon.svg), lues une fois puis gardées.
let lagonCurves: Promise<string[]> | null = null;
function loadLagonCurves() {
  lagonCurves ??= fetch("/fond/lagon.svg")
    .then((response) => response.text())
    .then((svg) => (svg.match(/ d="([^"]+)"/)?.[1] ?? "").split(/(?=M)/).filter(Boolean))
    .catch(() => []);
  return lagonCurves;
}

/**
 * Fond de l'accueil : les courbes du lagon de Tamilya, qui se dessinent une à une
 * à chaque ouverture de la fenêtre (chaque courbe est un tracé à part).
 */
function LagonSketch() {
  const gradientId = useId();
  const [curves, setCurves] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadLagonCurves().then((list) => {
      if (alive) setCurves(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <svg
      className="auth-lagon"
      viewBox="0 0 640 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="15%" style={{ stopColor: "var(--persona, var(--accent))" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in oklab, var(--persona, var(--accent)) 40%, var(--lagon))" }} />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradientId})`}>
        {curves.map((d, index) => (
          <path key={index} d={d} pathLength={1} style={{ animationDelay: `${(index % 15) * 60}ms` }} />
        ))}
      </g>
    </svg>
  );
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {hint ? <span className="ml-1 font-normal">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] leading-snug text-danger">
      {children}
    </div>
  );
}

/** Bouton rose plein du site (.btn-rose). */
function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-rose mt-1 h-12 w-full rounded-full px-5 text-sm font-semibold"
    >
      {pending ? "Patiente…" : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Connexion                                                                  */
/* -------------------------------------------------------------------------- */

function SignInForm({
  email,
  onEmailChange,
  next,
  onClose,
  onSignedIn,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  next: string;
  onClose: () => void;
  onSignedIn: SignedInHandler;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthError | "network" | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPending(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (signInError) {
        setError(signInError);
      } else {
        const name = data.user.user_metadata?.display_name;
        onSignedIn(
          { id: data.user.id, email: data.user.email ?? null, displayName: typeof name === "string" ? name : null },
          next,
        );
      }
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-3">
      <Field id="signin-email" label="Adresse e-mail">
        <input
          id="signin-email"
          data-autofocus
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="signin-password" className={LABEL_CLASS}>
            Mot de passe
          </label>
          <Link
            href="/auth/mot-de-passe-oublie"
            onClick={onClose}
            className="-my-2 py-2 pr-1 text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <PasswordInput
          id="signin-password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      {error ? (
        <ErrorMessage>
          {error === "network"
            ? "Connexion au service impossible. Vérifie ta connexion internet."
            : describeAuthError(error)}
          {error !== "network" && error.code === "email_not_confirmed" ? (
            <div className="mt-2">
              <ResendConfirmation email={email} next={next} initialCooldown={0} />
            </div>
          ) : null}
        </ErrorMessage>
      ) : null}

      <div className="pt-1">
        <SubmitButton pending={pending} label="Se connecter" />
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Inscription                                                                */
/* -------------------------------------------------------------------------- */

function SignUpForm({
  email,
  onEmailChange,
  next,
  onClose,
  onSignedIn,
  onConfirmationSent,
  onGoToSignIn,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  next: string;
  onClose: () => void;
  onSignedIn: SignedInHandler;
  onConfirmationSent: () => void;
  onGoToSignIn: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; showSignIn?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const checks = passwordChecks(password, email);
  const passwordOk = isPasswordValid(password, email);
  const suggestion = suggestEmailCorrection(email);
  const disposable = isDisposableEmail(email);
  const addressErrors = addressFieldErrors(address);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    const name = normalizeDisplayName(displayName);
    if (!name) {
      setError({ message: "Indique comment tu veux qu'on t'appelle." });
      return;
    }
    if (disposable) {
      setError({ message: DISPOSABLE_EMAIL_MESSAGE });
      return;
    }
    if (addressErrors.commune || addressErrors.line) {
      setError({ message: addressErrors.commune ?? addressErrors.line ?? "" });
      return;
    }
    if (!passwordOk) {
      setError({ message: "Le mot de passe ne respecte pas encore tous les critères." });
      return;
    }
    if (!consent) {
      setError({ message: "Accepte les règles de confidentialité pour créer ton compte." });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPending(true);
    try {
      // Visible dans la console du navigateur (F12) pour diagnostiquer un refus de Supabase.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          emailRedirectTo: confirmationRedirect(next),
          // Recopiés dans le profil par la base (handle_new_user), qui les revérifie.
          data: { display_name: name, address_commune: address.commune, address_line: address.line.replace(/s+/g, " ").trim() },
        },
      });
      if (signUpError) {
        console.warn("[inscription] Supabase a refusé la demande :", signUpError.code, signUpError.message);
        setError({
          message: describeAuthError(signUpError),
          showSignIn: signUpError.code === "user_already_exists" || signUpError.code === "email_exists",
        });
      } else if (data.session && data.user) {
        // Confirmation par e-mail désactivée dans Supabase : session immédiate.
        onSignedIn({ id: data.user.id, email: data.user.email ?? null, displayName: name }, next);
      } else {
        // Même écran que l'adresse soit déjà utilisée ou non (pas d'énumération des comptes).
        onConfirmationSent();
      }
    } catch {
      setError({ message: "Connexion au service impossible. Vérifie ta connexion internet." });
    } finally {
      setPending(false);
    }
  }

  return (
    // Ordinateur : deux colonnes (nom | e-mail, commune | adresse, puis mot de passe sur toute la largeur).
    // Écran peu haut : espacements resserrés, pour que tout tienne sans défiler.
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 sm:grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-3 sm:space-y-0 [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:space-y-2"
      noValidate
    >
      <Field id="signup-name" label="Ton prénom">
        <input
          id="signup-name"
          data-autofocus
          type="text"
          required
          aria-invalid={submitted && !normalizeDisplayName(displayName) ? true : undefined}
          autoComplete="given-name"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field id="signup-email" label="Adresse e-mail">
        <input
          id="signup-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          aria-describedby={suggestion ? "signup-email-suggestion" : undefined}
          className={INPUT_CLASS}
        />
        {disposable ? (
          <p className="mt-1 pl-1 text-xs text-danger" aria-live="polite">
            {DISPOSABLE_EMAIL_MESSAGE}
          </p>
        ) : suggestion ? (
          <p id="signup-email-suggestion" className="mt-1 pl-1 text-xs text-fg-muted" aria-live="polite">
            Tu voulais dire{" "}
            <button
              type="button"
              onClick={() => onEmailChange(suggestion)}
              className="font-medium text-accent underline underline-offset-2"
            >
              {suggestion}
            </button>{" "}
            ?
          </p>
        ) : null}
      </Field>

      {/* Commune et adresse côte à côte, même sur téléphone. Elle sert aux services BTM (livraisons…)
          et sera redemandée, corrigeable, à chaque livraison. */}
      <fieldset className="sm:col-span-2 [&>div]:grid [&>div]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>div]:gap-3 [&>div]:space-y-0">
        <legend className="sr-only">Ton adresse, pour les livraisons BTM</legend>
        <AddressFields
          id="signup-address"
          value={address}
          onChange={setAddress}
          errors={submitted ? addressErrors : { commune: null, line: null }}
          inputClass={`${INPUT_CLASS} truncate`}
          labelClass={LABEL_CLASS}
        />
      </fieldset>

      <div className="sm:col-span-2">
        <label htmlFor="signup-password" className={LABEL_CLASS}>
          Mot de passe
        </label>
        <PasswordInput
          id="signup-password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="signup-password-rules"
          aria-invalid={submitted && !passwordOk ? true : undefined}
          className={INPUT_CLASS}
        />
        {/* Règles affichées dès qu'on tape (ou après un essai) : la fenêtre reste courte tant que le champ est vide. */}
        <ul
          id="signup-password-rules"
          className={`mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 pl-1 text-[11px] ${password || submitted ? "" : "sr-only"}`}
        >
          {checks.map((check) => (
            <li
              key={check.id}
              className={`flex items-center gap-1.5 ${
                check.ok ? "text-accent" : submitted ? "text-danger" : "text-fg-muted"
              }`}
            >
              <span aria-hidden="true" className="grid w-3.5 place-items-center">
                {check.ok ? <Check className="size-3.5" strokeWidth={3} /> : "•"}
              </span>
              {check.label}
              <span className="sr-only">{check.ok ? " : respecté" : " : non respecté"}</span>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 pl-1 text-xs leading-snug sm:col-span-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={submitted && !consent ? true : undefined}
          className="size-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-fg-muted">
          J&apos;ai lu et j&apos;accepte les{" "}
          <Link
            href="/confidentialite"
            target="_blank"
            className="text-fg underline underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            règles de confidentialité
          </Link>{" "}
          de BTM AI.
        </span>
      </label>

      {error ? (
        <div className="sm:col-span-2">
          <ErrorMessage>
            {error.message}
            {error.showSignIn ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                <button type="button" onClick={onGoToSignIn} className="underline underline-offset-2">
                  Se connecter
                </button>
                <Link href="/auth/mot-de-passe-oublie" onClick={onClose} className="underline underline-offset-2">
                  Mot de passe oublié
                </Link>
              </div>
            ) : null}
          </ErrorMessage>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton pending={pending} label="Créer mon compte" />
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation envoyée                                                       */
/* -------------------------------------------------------------------------- */

function ConfirmationSent({
  email,
  next,
  onChangeEmail,
  onGoToSignIn,
}: {
  email: string;
  next: string;
  onChangeEmail: () => void;
  onGoToSignIn: () => void;
}) {
  return (
    <div className="mt-3 text-sm" role="status">
      <p>
        Clique sur le lien envoyé à <strong className="break-all">{normalizeEmail(email)}</strong>.
      </p>
      <p className="mt-1 text-fg-muted">Pense à regarder dans tes spams.</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
        <ResendConfirmation email={email} next={next} initialCooldown={RESEND_COOLDOWN_SECONDS} variant="link" />
        <button type="button" onClick={onChangeEmail} className="font-medium text-fg-muted hover:text-fg">
          Changer d&apos;adresse
        </button>
        <button type="button" onClick={onGoToSignIn} className="ml-auto font-medium text-accent hover:underline">
          Se connecter
        </button>
      </div>
    </div>
  );
}

function ResendConfirmation({
  email,
  next,
  initialCooldown,
  variant = "button",
}: {
  email: string;
  next: string;
  initialCooldown: number;
  /** « link » : simple lien texte, pour les écrans épurés. */
  variant?: "button" | "link";
}) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !email) return;
    setStatus("sending");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizeEmail(email),
        options: { emailRedirectTo: confirmationRedirect(next) },
      });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  const label =
    status === "sending"
      ? "Envoi…"
      : status === "sent" && cooldown > 0
        ? "E-mail renvoyé"
        : status === "error" && cooldown > 0
          ? "Échec, réessaie plus tard"
          : cooldown > 0
            ? `Renvoyer (${cooldown} s)`
            : "Renvoyer l'e-mail";

  return (
    <button
      type="button"
      onClick={resend}
      disabled={cooldown > 0 || status === "sending"}
      className={
        variant === "link"
          ? `font-medium disabled:cursor-default ${status === "error" ? "text-danger" : "text-fg-muted hover:text-fg"} disabled:hover:text-fg-muted`
          : "btn-rose rounded-md px-3 py-1.5 text-xs font-medium"
      }
    >
      {label}
    </button>
  );
}
