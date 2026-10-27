"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PersonalityCard } from "@/lib/ai/personalities";
import { PersonalityPicker } from "./PersonalityPicker";

/**
 * Première connexion d'un compte validé : choix obligatoire de la personnalité
 * d'Awa. S'affiche tant que le serveur indique qu'aucun choix n'a été fait
 * (`personality === null` ; `undefined` = pas encore connu, on n'affiche rien).
 */
export function PersonalityDialog({ cards }: { cards: PersonalityCard[] }) {
  const { user } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const open = Boolean(user && user.personality === null && savedFor !== user.id && cards.length > 0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Choix obligatoire : Échap ne ferme pas la fenêtre.
      onCancel={(event) => event.preventDefault()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl scrollbar-none overflow-y-auto rounded-3xl border border-border bg-bg p-0 text-fg shadow-2xl backdrop:backdrop-blur-sm"
    >
      {open && user ? (
        <div className="p-6 sm:p-8">
          <div className="mx-auto max-w-xl text-center">
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ton compte est prêt ! 🎉
            </h2>
            <p className="mt-2 text-fg-muted">
              Je suis Awa. Avant qu&apos;on commence : tu me préfères comment ? Tu pourras changer d&apos;avis à tout
              moment dans les Paramètres.
            </p>
          </div>
          <div className="mt-7">
            <PersonalityPicker
              cards={cards}
              current={null}
              layout="row"
              submitLabel="C'est parti"
              onSaved={() => setSavedFor(user.id)}
            />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
