"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
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
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          updateError.code === "same_password"
            ? "Choisissez un mot de passe différent de l'actuel."
            : updateError.code === "weak_password"
              ? "Ce mot de passe est trop faible."
              : "La mise à jour a échoué. Le lien a peut-être expiré : refaites une demande.",
        );
      } else {
        setDone(true);
      }
    } catch {
      setError("Connexion au service impossible. Vérifiez votre connexion internet.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl border border-border bg-bg p-5 text-sm">
        <p className="font-medium">Votre mot de passe a été modifié.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-accent hover:underline">
          Revenir à BTM AI
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-bg p-5">
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium">
          Nouveau mot de passe
        </label>
        <PasswordInput
          id="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium">
          Confirmer le mot de passe
        </label>
        <PasswordInput
          id="confirm-password"
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
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
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
