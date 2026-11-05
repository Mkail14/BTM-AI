"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { currentQuality, subscribeQuality, type ConnectionQuality } from "@/lib/hooks/connection-quality";

const MESSAGES: Record<Exclude<ConnectionQuality, "good">, { icon: string; title: string; detail: string }> = {
  offline: { icon: "📵", title: "Pas de connexion", detail: "Vérifie ton réseau ou ton wifi. Tamilya reprend dès que ça revient." },
  weak: { icon: "📶", title: "Connexion faible", detail: "Les réponses et le vocal peuvent être plus lents." },
};

/**
 * Petite fenêtre en haut de l'écran quand la connexion change : hors ligne
 * (reste affichée), faible (se ferme d'un toucher), puis
 * « Connexion rétablie » quelques secondes.
 */
export function ConnectionNotice() {
  const quality = useSyncExternalStore(subscribeQuality, currentQuality, () => "good" as const);
  const [hidden, setHidden] = useState<ConnectionQuality | null>(null);
  const [back, setBack] = useState(false);
  const previous = useRef<ConnectionQuality>("good");

  useEffect(() => {
    const was = previous.current;
    previous.current = quality;
    if (quality !== "good" || (was !== "offline" && was !== "weak")) return;
    setBack(true);
    const timer = window.setTimeout(() => setBack(false), 3000);
    return () => window.clearTimeout(timer);
  }, [quality]);

  const message = quality === "good" ? null : MESSAGES[quality];
  const show = message && hidden !== quality;
  if (!show && !back) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex justify-center px-4">
      {show ? (
        <div
          role={quality === "offline" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm animate-[correct-fade_.18s_ease-out] items-start gap-3 rounded-2xl border bg-bg px-4 py-3 text-sm shadow-lg ${
            quality === "offline" ? "border-danger/40" : "border-warning/50"
          }`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {message.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{message.title}</span>
            <span className="block text-fg-muted">{message.detail}</span>
          </span>
          {quality !== "offline" ? (
            <button type="button" onClick={() => setHidden(quality)} aria-label="Fermer" className="text-fg-muted hover:text-fg">
              ✕
            </button>
          ) : null}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 rounded-full border border-border bg-bg px-4 py-2 text-sm font-medium shadow-lg">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" /> Connexion rétablie
        </p>
      )}
    </div>
  );
}
