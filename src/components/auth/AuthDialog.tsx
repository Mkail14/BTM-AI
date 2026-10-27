"use client";

import type { AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconClose } from "@/components/ui/icons";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  isPasswordValid,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
  normalizeEmail,
  passwordChecks,
  suggestEmailCorrection,
} from "@/lib/auth/signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthUser } from "./AuthProvider";

export type AuthDialogOptions = {
  /** Explique pourquoi un compte est nécessaire (affiché en tête). */
  reason?: string;
  /** Chemin interne vers lequel revenir après connexion. */
  next?: string;
  mode?: "signin" | "signup";
};

type View = "signin" | "signup" | "confirm";
type SignedInHandler = (user: AuthUser, next?: string) => void;

const RESEND_COOLDOWN_SECONDS = 60;
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-base outline-none focus:border-accent";

function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Votre adresse e-mail n'est pas encore confirmée. Cliquez sur le lien reçu par e-mail.";
    case "user_already_exists":
    case "email_exists":
      return "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe.";
    case "weak_password":
      return "Ce mot de passe est trop faible. Choisissez-en un plus long ou plus varié.";
    case "email_address_invalid":
      return "Cette adresse e-mail n'est pas valide.";
    // Limite globale du service d'e-mails de Supabase (tous utilisateurs
    // confondus), pas une faute de la personne.
    case "over_email_send_rate_limit":
      return "L'envoi d'e-mails est momentanément saturé. Réessayez un peu plus tard.";
    case "over_request_rate_limit":
      return "Trop de tentatives depuis cette connexion. Patientez quelques minutes avant de réessayer.";
    case "signup_disabled":
      return "Les inscriptions sont momentanément fermées.";
    default:
      return "La demande n'a pas abouti. Vérifiez vos informations et réessayez.";
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
      // showModal() place le focus sur le premier bouton (Fermer) : on le
      // déplace sur le premier champ du formulaire.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md scrollbar-none overflow-y-auto rounded-2xl border border-border bg-bg p-0 text-fg shadow-xl"
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
  // L'adresse est partagée entre les écrans : pas besoin de la retaper.
  const [email, setEmail] = useState("");
  const next = options.next ?? "/";

  const titles: Record<View, string> = {
    signin: "Se connecter",
    signup: "Créer un compte",
    confirm: "Confirmez votre adresse e-mail",
  };

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <BrandLogo size="sm" />
        <button
          type="button"
          onClick={onClose}
          className="-m-2 rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
          aria-label="Fermer"
        >
          <IconClose />
        </button>
      </div>

      <h2 id={titleId} className="mt-4 text-xl font-semibold">
        {titles[view]}
      </h2>
      {view !== "confirm" ? (
        <p className="mt-1.5 text-sm text-fg-muted">
          {options.reason ??
            (view === "signup"
              ? "Gratuit. Enregistrez vos conversations et retrouvez-les sur tous vos appareils."
              : "Retrouvez vos conversations enregistrées.")}
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
          <div className="mt-4 grid grid-cols-2 rounded-lg bg-bg-muted p-1 text-sm" role="group" aria-label="Type de formulaire">
            {(["signin", "signup"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  view === value ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {value === "signin" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          {view === "signin" ? (
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
        </>
      )}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {hint ? <span className="ml-1 font-normal text-fg-muted">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Veuillez patienter…" : label}
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
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
          className={`mt-1.5 ${INPUT_CLASS}`}
        />
      </Field>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="signin-password" className="block text-sm font-medium">
            Mot de passe
          </label>
          <Link
            href="/auth/mot-de-passe-oublie"
            onClick={onClose}
            className="text-sm text-accent underline-offset-2 hover:underline"
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
            ? "Connexion au service impossible. Vérifiez votre connexion internet."
            : describeAuthError(error)}
          {error !== "network" && error.code === "email_not_confirmed" ? (
            <div className="mt-2">
              <ResendConfirmation email={email} next={next} initialCooldown={0} />
            </div>
          ) : null}
        </ErrorMessage>
      ) : null}

      <SubmitButton pending={pending} label="Se connecter" />
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
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; showSignIn?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const checks = passwordChecks(password, email);
  const passwordOk = isPasswordValid(password, email);
  const suggestion = suggestEmailCorrection(email);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    const name = normalizeDisplayName(displayName);
    if (!name) {
      setError({ message: "Indiquez comment vous souhaitez qu'on vous appelle." });
      return;
    }
    if (!passwordOk) {
      setError({ message: "Le mot de passe ne respecte pas encore tous les critères." });
      return;
    }
    if (!consent) {
      setError({ message: "Veuillez accepter les règles de confidentialité pour créer un compte." });
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
          data: { display_name: name },
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
      setError({ message: "Connexion au service impossible. Vérifiez votre connexion internet." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
      <Field id="signup-name" label="Comment souhaitez-vous qu'on vous appelle ?">
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
          className={`mt-1.5 ${INPUT_CLASS}`}
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
          className={`mt-1.5 ${INPUT_CLASS}`}
        />
        {suggestion ? (
          <p id="signup-email-suggestion" className="mt-1.5 text-sm text-fg-muted" aria-live="polite">
            Vouliez-vous dire{" "}
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

      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium">
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
        <ul id="signup-password-rules" className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {checks.map((check) => (
            <li
              key={check.id}
              className={`flex items-center gap-1.5 ${
                check.ok ? "text-accent" : submitted ? "text-danger" : "text-fg-muted"
              }`}
            >
              <span aria-hidden="true" className="w-3 text-center">
                {check.ok ? "✓" : "•"}
              </span>
              {check.label}
              <span className="sr-only">{check.ok ? " : respecté" : " : non respecté"}</span>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={submitted && !consent ? true : undefined}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
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
      ) : null}

      <SubmitButton pending={pending} label="Créer mon compte" />
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
        Cliquez sur le lien envoyé à <strong className="break-all">{normalizeEmail(email)}</strong>.
      </p>
      <p className="mt-1 text-fg-muted">Pensez à regarder dans vos spams.</p>
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
        ? "E-mail renvoyé ✓"
        : status === "error" && cooldown > 0
          ? "Échec, réessayez plus tard"
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
          : "rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}
