"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { IconCheck } from "@/components/ui/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const MIN_PASSWORD_LENGTH = 8;

const FIELD = "w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent";

/** Critère affiché sous le champ : gris tant qu'il n'est pas rempli, vert ensuite. */
function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-fg-muted"}`}>
      {ok ? <IconCheck width={14} height={14} /> : <span aria-hidden="true" className="mx-[5px] size-1 rounded-full bg-current" />}
      <span>
        {children}
        <span className="sr-only">{ok ? " : respecté" : " : pas encore respecté"}</span>
      </span>
    </li>
  );
}

/** `reason` : après un oubli (lien reçu par e-mail) ou une simple modification. */
export function UpdatePasswordForm({ reason }: { reason: "oubli" | "modification" }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le lien de l'e-mail n'est plus valable : on propose d'en redemander un.
  const [linkExpired, setLinkExpired] = useState(false);
  // Compte avec une application d'authentification (admins) : Supabase exige son code avant de changer le mot de passe.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = confirmation.length > 0 && password === confirmation;
  const exit = reason === "oubli" ? { href: "/", label: "Aller à la conversation" } : { href: "/parametres", label: "Retour aux paramètres" };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLinkExpired(false);
    if (!longEnough) {
      setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPending(true);
    try {
      if (needsCode) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const factor = factors?.totp.find((f) => f.status === "verified");
        if (!factor) {
          setError("Aucune application d'authentification liée à ce compte.");
          return;
        }
        const { error: codeError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
        if (codeError) {
          setError("Code faux ou expiré : tape le code affiché maintenant.");
          return;
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError?.code === "insufficient_aal") {
        setNeedsCode(true);
        setError(needsCode ? "Le code n'a pas été accepté. Réessaie." : null);
      } else if (updateError?.code === "same_password") {
        setError("Choisis un mot de passe différent de l'actuel.");
      } else if (updateError?.code === "weak_password") {
        setError("Ce mot de passe est trop facile à deviner. Mélange lettres, chiffres et signes.");
      } else if (updateError) {
        setError(
          reason === "oubli"
            ? "La mise à jour a échoué : le lien reçu par e-mail a sans doute expiré."
            : "La mise à jour a échoué. Réessaie dans un instant.",
        );
        setLinkExpired(reason === "oubli");
      } else {
        setDone(true);
        // E-mail de confirmation, envoyé par le serveur ; sans effet sur l’écran.
        void fetch("/api/auth/password-notice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }).catch(() => {});
      }
    } catch {
      setError("Connexion au service impossible. Vérifie ta connexion internet.");
    } finally {
      setPending(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="rounded-lg bg-warning-soft p-3 text-sm">Les comptes ne sont pas encore disponibles sur ce serveur.</p>;
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl border border-border bg-bg p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-success">
            <IconCheck />
          </span>
          <div className="text-sm">
            <p className="text-base font-medium">Mot de passe enregistré</p>
            <p className="mt-1 text-fg-muted">
              {reason === "oubli" ? "Ta session reste ouverte : tu peux continuer directement." : "Utilise-le dès ta prochaine connexion."}
            </p>
          </div>
        </div>
        <Link
          href={exit.href}
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover"
        >
          {exit.label}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-xl border border-border bg-bg p-5">
      <p className="text-sm text-fg-muted">
        {reason === "oubli"
          ? "Ton lien est valide. Choisis le mot de passe que tu utiliseras désormais pour te connecter."
          : "Ton nouveau mot de passe remplacera l'actuel sur tous tes appareils."}
      </p>

      <div>
        <label htmlFor="new-password" className="block text-sm font-medium">
          Nouveau mot de passe
        </label>
        <PasswordInput
          id="new-password"
          required
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          aria-describedby="new-password-rules"
          aria-invalid={error !== null && !longEnough}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <ul id="new-password-rules" className="mt-2 space-y-1 text-xs">
          <Rule ok={longEnough}>{`Au moins ${MIN_PASSWORD_LENGTH} caractères`}</Rule>
        </ul>
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium">
          Confirmer le mot de passe
        </label>
        <PasswordInput
          id="confirm-password"
          required
          autoComplete="new-password"
          aria-describedby="confirm-password-rules"
          aria-invalid={confirmation.length > 0 && !matches && confirmation.length >= password.length}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={FIELD}
        />
        <ul id="confirm-password-rules" className="mt-2 space-y-1 text-xs">
          <Rule ok={matches}>Identique au premier</Rule>
        </ul>
      </div>

      {needsCode ? (
        <div className="rounded-lg bg-accent-soft p-4">
          <label htmlFor="mfa-code" className="block text-sm font-medium">
            Code de l&apos;application d&apos;authentification
          </label>
          <p id="mfa-code-help" className="mt-1 text-xs text-fg-muted">
            Ton compte est protégé par un deuxième code. Ouvre ton application et tape les 6 chiffres affichés.
          </p>
          <input
            id="mfa-code"
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            aria-describedby="mfa-code-help"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`mt-2 ${FIELD} max-w-40 text-center text-lg tracking-[0.4em]`}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
          {linkExpired ? (
            <>
              {" "}
              <Link href="/auth/mot-de-passe-oublie" className="font-medium underline">
                Recevoir un nouveau lien
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || (needsCode && code.length !== 6)}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </button>
        {reason === "modification" ? (
          <Link href="/parametres" className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg">
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
