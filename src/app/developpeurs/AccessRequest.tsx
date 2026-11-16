"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass } from "@/components/admin/form";
import { lostOk } from "@/lib/safe-action";
import { acceptTermsAction } from "./actions";

const field = `${inputClass} h-10 rounded-full px-4`;

type Profile = { fullName: string; organization: string; website: string; usage: string };

/**
 * Fiche du développeur (ce qu'il va faire de Tamilya), puis engagement à
 * garder son identité : un seul envoi, et l'accès est ouvert aussitôt.
 */
export function AccessRequest({ initial }: { initial?: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(initial ?? { fullName: "", organization: "", website: "", usage: "" });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Profile) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await acceptTermsAction({ ...form, accepted }).catch(lostOk);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm font-medium">1. Votre fiche</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Nom et prénom
          <input value={form.fullName} onChange={set("fullName")} maxLength={80} required autoComplete="name" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Structure
          <input value={form.organization} onChange={set("organization")} maxLength={120} required placeholder="Entreprise, association ou « Particulier »" className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Site ou application
        <input value={form.website} onChange={set("website")} maxLength={200} required placeholder="mon-site.yt" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Ce que vous allez faire de Tamilya
        <textarea
          value={form.usage}
          onChange={set("usage")}
          rows={4}
          maxLength={2000}
          required
          placeholder="ex. Sur le site de mon agence de voyage, Tamilya répondra aux questions des clients sur nos excursions et leur apprendra quelques mots de shimaoré."
          className={`${inputClass} rounded-2xl px-4 py-2`}
        />
      </label>

      <p className="mt-2 text-sm font-medium">2. Votre engagement</p>
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 size-4 shrink-0" />
        <span>
          Je m&apos;engage à ne jamais changer <strong>le nom</strong>, <strong>le shimaoré</strong> ni{" "}
          <strong>la personnalité</strong> de Tamilya, et j&apos;accepte la{" "}
          <Link href="/developpeurs/charte" target="_blank" className="underline underline-offset-4">
            charte d&apos;utilisation
          </Link>
          . Je sais qu&apos;une tentative bloque la requête et suspend mon accès.
        </span>
      </label>
      <button type="submit" disabled={pending || !accepted} className="btn-rose mt-1 h-10 self-start rounded-full px-5 text-sm font-medium">
        {pending ? "Un instant…" : initial ? "Enregistrer ma fiche" : "Je m'engage, ouvrir mon accès"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
