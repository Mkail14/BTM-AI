"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { IconLock, IconMail } from "@/components/ui/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base outline-none transition-[border-color,box-shadow] placeholder:text-fg-muted/70 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.06] sm:text-sm";
const CARD_CLASS = "mx-auto max-w-md rounded-2xl border border-border bg-bg p-6 shadow-sm sm:p-8";
const LINK_CLASS = "font-medium text-accent underline-offset-2 hover:underline";

/** Supabase n'accepte qu'un e-mail par minute pour une même adresse. */
const RESEND_DELAY_SECONDS = 60;

export function ForgotPasswordForm() {
  const { user, openAuthDialog } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // « origine=oubli » : l’e-mail de confirmation dira « nouveau mot de passe créé ».
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/nouveau-mot-de-passe?origine=oubli")}`,
      });
      if (resetError?.code === "over_email_send_rate_limit" || resetError?.code === "over_request_rate_limit") {
        setError("Un e-mail vient déjà de partir. Patiente une minute avant d'en redemander un.");
        setCooldown(RESEND_DELAY_SECONDS);
      } else {
        // Même message que l'adresse existe ou non (pas d'énumération des comptes).
        setSent(true);
        setCooldown(RESEND_DELAY_SECONDS);
      }
    } catch {
      setError("Connexion au service impossible. Vérifie ta connexion internet.");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendLink();
  }

  const backToSignIn = (
    <button type="button" onClick={() => openAuthDialog({ mode: "signin" })} className={LINK_CLASS}>
      ← Retour à la connexion
    </button>
  );

  if (!isSupabaseConfigured) {
    return <p className="rounded-lg bg-warning-soft p-3 text-sm">Les comptes ne sont pas encore disponibles sur ce serveur.</p>;
  }

  if (sent) {
    return (
      <div role="status" className={CARD_CLASS}>
        <Badge>
          <IconMail width={22} height={22} />
        </Badge>
        <h2 className="mt-4 text-center text-lg font-semibold">Vérifie ta boîte mail</h2>
        <p className="mt-2 text-center text-sm text-fg-muted">
          Si un compte existe pour <strong className="text-fg">{email.trim()}</strong>, tu vas recevoir un lien pour
          choisir un nouveau mot de passe.
        </p>
        <ul className="mt-5 space-y-2 rounded-xl bg-bg-subtle p-4 text-[13px] leading-snug text-fg-muted">
          <li>• L&apos;e-mail arrive en général en moins d&apos;une minute, envoyé par contact@btm.yt.</li>
          <li>• Rien reçu ? Regarde dans les courriers indésirables (spam).</li>
          <li>• Le lien ne sert qu&apos;une fois et expire au bout d&apos;un moment.</li>
        </ul>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={pending || cooldown > 0}
          className="mt-5 h-11 w-full rounded-full border border-border text-sm font-medium hover:bg-bg-muted disabled:opacity-60"
        >
          {pending ? "Envoi…" : cooldown > 0 ? `Renvoyer l'e-mail (${cooldown} s)` : "Renvoyer l'e-mail"}
        </button>
        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
            className={LINK_CLASS}
          >
            Changer d&apos;adresse
          </button>
          {backToSignIn}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={CARD_CLASS}>
      <Badge>
        <IconLock width={22} height={22} />
      </Badge>
      <p className="mt-4 text-center text-sm text-fg-muted">
        Ça arrive à tout le monde. Donne l&apos;adresse e-mail de ton compte : on t&apos;envoie un lien pour choisir un
        nouveau mot de passe.
      </p>
      <div className="mt-6">
        <label htmlFor="reset-email" className="mb-1 block text-xs font-medium text-fg-muted">
          Adresse e-mail
        </label>
        <input
          id="reset-email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          placeholder="toi@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <button
        type="submit"
        disabled={pending || cooldown > 0}
        className="btn-rose mt-5 h-12 w-full rounded-full px-5 text-sm font-semibold"
      >
        {pending ? "Envoi…" : cooldown > 0 ? `Patiente ${cooldown} s` : "Recevoir le lien"}
      </button>
      <p className="mt-5 text-center text-sm">{backToSignIn}</p>
    </form>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{children}</div>;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-[13px] leading-snug text-danger">
      {children}
    </div>
  );
}
