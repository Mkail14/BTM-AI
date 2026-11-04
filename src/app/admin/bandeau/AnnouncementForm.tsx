"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, Counter, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { AnnouncementBar } from "@/components/landing/AnnouncementBar";
import type { ActionResult } from "@/lib/admin/action-auth";
import { ANNOUNCEMENT_LIMITS, isSafeAnnouncementLink, type Announcement } from "@/lib/site/announcement-rules";
import { saveAnnouncementAction } from "./actions";

const same = (a: Announcement, b: Announcement) =>
  a.enabled === b.enabled && a.text === b.text && a.linkLabel === b.linkLabel && a.linkUrl === b.linkUrl;

const LABEL = "block text-xs font-medium text-fg-muted";

/** Tout sur une seule carte : interrupteur, aperçu, texte, lien, enregistrer. */
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
      className="overflow-hidden rounded-2xl border border-border bg-bg shadow-sm"
    >
      {/* En-tête : titre et interrupteur */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">Bandeau d&apos;accueil</h1>
          <p className="text-sm text-fg-muted">Une phrase sous la barre du haut de l&apos;accueil.</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2.5">
          <span className={`text-sm font-medium ${draft.enabled ? "text-success" : "text-fg-muted"}`}>
            {draft.enabled ? "Affiché" : "Masqué"}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Afficher le bandeau"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-10 shrink-0 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
          />
        </label>
      </div>

      {/* Aperçu en direct */}
      <div className="border-y border-border bg-bg-subtle px-5 py-4">
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          {draft.text.trim() ? (
            <div className={`transition-opacity ${draft.enabled ? "" : "opacity-40"}`}>
              <AnnouncementBar announcement={{ ...draft, text: draft.text.trim(), linkUrl: badLink ? "" : draft.linkUrl.trim() }} />
            </div>
          ) : (
            <p className="px-4 py-2.5 text-center text-sm text-fg-muted">L&apos;aperçu apparaît ici.</p>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-fg-muted">
          {saved.enabled ? "● En ligne en ce moment" : "Pas en ligne en ce moment"}
          {dirty ? " · modifications non enregistrées" : ""}
        </p>
      </div>

      {/* Champs */}
      <div className="flex flex-col gap-4 px-5 py-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="announcement-text" className={LABEL}>
              Texte
            </label>
            <Counter value={draft.text} max={ANNOUNCEMENT_LIMITS.text} />
          </div>
          <textarea
            id="announcement-text"
            rows={2}
            value={draft.text}
            maxLength={ANNOUNCEMENT_LIMITS.text}
            onChange={(e) => set("text", e.target.value)}
            placeholder="Nouveau : Tamilya connaît maintenant les jours de la semaine."
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <div>
            <label htmlFor="announcement-label" className={LABEL}>
              Texte du lien <span className="font-normal">(facultatif)</span>
            </label>
            <input
              id="announcement-label"
              value={draft.linkLabel}
              maxLength={ANNOUNCEMENT_LIMITS.linkLabel}
              onChange={(e) => set("linkLabel", e.target.value)}
              placeholder="En savoir plus"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="announcement-url" className={LABEL}>
              Adresse du lien <span className="font-normal">(facultatif)</span>
            </label>
            <input
              id="announcement-url"
              value={draft.linkUrl}
              maxLength={ANNOUNCEMENT_LIMITS.linkUrl}
              onChange={(e) => set("linkUrl", e.target.value)}
              placeholder="/partenaires ou https://…"
              inputMode="url"
              autoComplete="off"
              aria-invalid={badLink || undefined}
              className={`${inputClass} ${badLink ? "border-danger" : ""}`}
            />
            {badLink ? <p className="mt-1 text-xs text-danger">Commence par / (page du site) ou https://</p> : null}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <ActionStatus result={status} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(saved);
              setStatus(null);
            }}
            disabled={!dirty || saving}
            className={secondaryButton}
          >
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
