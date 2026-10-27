"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/nouveau-mot-de-passe`,
      });
      if (resetError?.code === "over_email_send_rate_limit" || resetError?.code === "over_request_rate_limit") {
        setError("L'envoi d'e-mails est momentanément saturé. Réessayez un peu plus tard.");
      } else {
        // Même message que l'adresse existe ou non (pas d'énumération des comptes).
        setSent(true);
      }
    } catch {
      setError("Connexion au service impossible. Vérifiez votre connexion internet.");
    } finally {
      setPending(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="rounded-lg bg-warning-soft p-3 text-sm">Les comptes ne sont pas encore disponibles sur ce serveur.</p>;
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg bg-accent-soft p-4 text-sm">
        Si un compte existe pour <strong>{email}</strong>, un e-mail contenant un lien de réinitialisation vient
        d&apos;être envoyé. Le lien est valable pour une durée limitée.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-bg p-5">
      <p className="text-sm text-fg-muted">
        Indiquez l&apos;adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
      </p>
      <div>
        <label htmlFor="reset-email" className="block text-sm font-medium">
          Adresse e-mail
        </label>
        <input
          id="reset-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer le lien"}
      </button>
    </form>
  );
}
