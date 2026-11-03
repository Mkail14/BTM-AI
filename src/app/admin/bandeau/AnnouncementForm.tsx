"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, AdminCard, Counter, Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { AnnouncementBar } from "@/components/landing/AnnouncementBar";
import type { ActionResult } from "@/lib/admin/action-auth";
import { ANNOUNCEMENT_LIMITS, isSafeAnnouncementLink, type Announcement } from "@/lib/site/announcement-rules";
import { saveAnnouncementAction } from "./actions";

const same = (a: Announcement, b: Announcement) =>
  a.enabled === b.enabled && a.text === b.text && a.linkLabel === b.linkLabel && a.linkUrl === b.linkUrl;

export function AnnouncementForm({ saved }: { saved: Announcement }) {
  const router = useRouter();
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const dirty = !same(draft, saved);
  const badLink = !isSafeAnnouncementLink(draft.linkUrl.trim());

  const set = <K extends keyof Announcement>(key: K, value: Announcement[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };

  function save() {
    startSaving(async () => {
      const result = await saveAnnouncementAction(draft);
      setStatus(result);
      if (!result.ok) return;
      // Le serveur enregistre les textes sans espaces au bout : le brouillon suit, sinon il resterait « modifié ».
      setDraft((d) => ({ ...d, text: d.text.trim(), linkLabel: d.linkLabel.trim(), linkUrl: d.linkUrl.trim() }));
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      <AdminCard
        title="Aperçu"
        aside={
          <span className={`text-xs font-medium ${saved.enabled ? "text-success" : "text-fg-muted"}`}>
            {saved.enabled ? "● En ligne" : "Éteint"}
          </span>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          {/* Barre du haut simplifiée, pour voir le bandeau à sa place. */}
          <div aria-hidden="true" className="flex h-9 items-center justify-between border-b border-border px-4 text-[11px] text-fg-muted">
            <span className="font-semibold text-fg">btm</span>
            <span className="hidden gap-5 sm:flex">
              <span>Tamilya</span>
              <span>Nos partenaires</span>
              <span>Groupe BTM</span>
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-white">Essayer</span>
          </div>
          {draft.text.trim() ? (
            <div className={draft.enabled ? "" : "opacity-45"}>
              <AnnouncementBar announcement={{ ...draft, text: draft.text.trim(), linkUrl: badLink ? "" : draft.linkUrl.trim() }} />
            </div>
          ) : (
            <p className="px-4 py-3 text-center text-sm text-fg-muted">Écris un texte pour voir le bandeau.</p>
          )}
          <div aria-hidden="true" className="h-10" />
        </div>
        {draft.enabled ? null : <p className="mt-2 text-xs text-fg-muted">Bandeau éteint : les visiteurs ne le voient pas.</p>}
      </AdminCard>

      <AdminCard title="Contenu">
        <div className="flex flex-col gap-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-bg-subtle px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Afficher le bandeau</span>
              <span className="block text-xs text-fg-muted">Sur la page d&apos;accueil, pour les visiteurs</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-10 shrink-0 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
            />
          </label>

          <Field label="Texte" hint="Une phrase courte : alerte, bon plan, publicité…" htmlFor="announcement-text">
            <textarea
              id="announcement-text"
              rows={2}
              value={draft.text}
              maxLength={ANNOUNCEMENT_LIMITS.text}
              onChange={(e) => set("text", e.target.value)}
              placeholder="Nouveau : Tamilya connaît maintenant les jours de la semaine."
              className={`${inputClass} resize-none`}
            />
            <Counter value={draft.text} max={ANNOUNCEMENT_LIMITS.text} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-[1fr_1.4fr]">
            <Field label="Texte du lien" hint="Facultatif. Par défaut : « En savoir plus »." htmlFor="announcement-label">
              <input
                id="announcement-label"
                value={draft.linkLabel}
                maxLength={ANNOUNCEMENT_LIMITS.linkLabel}
                onChange={(e) => set("linkLabel", e.target.value)}
                placeholder="En savoir plus"
                className={inputClass}
              />
            </Field>
            <Field label="Adresse du lien" hint="Facultatif. Une page du site (/partenaires) ou https://…" htmlFor="announcement-url">
              <input
                id="announcement-url"
                value={draft.linkUrl}
                maxLength={ANNOUNCEMENT_LIMITS.linkUrl}
                onChange={(e) => set("linkUrl", e.target.value)}
                placeholder="/partenaires"
                inputMode="url"
                autoComplete="off"
                aria-invalid={badLink || undefined}
                className={`${inputClass} ${badLink ? "border-danger" : ""}`}
              />
              {badLink ? <p className="mt-1 text-xs text-danger">Commence par / (page du site) ou https://</p> : null}
            </Field>
          </div>
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-3">
        <ActionStatus result={status} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setDraft(saved)} disabled={!dirty || saving} className={secondaryButton}>
            Annuler
          </button>
          <button type="submit" disabled={!dirty || saving || badLink} className={primaryButton}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </form>
  );
}
