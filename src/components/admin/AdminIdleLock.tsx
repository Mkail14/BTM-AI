"use client";

import { useEffect } from "react";
import { keepAdminOpenAction, lockAdminAction } from "@/app/admin/verrou/actions";

/** Au plus un aller-retour au serveur toutes les 4 minutes pendant l'utilisation. */
const KEEP_EVERY_MS = 4 * 60_000;
const INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Verrou de l'espace admin côté écran : souris, clavier ou défilement comptent
 * comme une utilisation et prolongent le verrou ; après `minutes` sans rien,
 * il se referme et la page du code s'affiche. Le serveur applique la même
 * limite de son côté (src/lib/admin/gate.ts).
 */
export function AdminIdleLock({ minutes }: { minutes: number }) {
  useEffect(() => {
    const idleMs = minutes * 60_000;
    let lastInput = Date.now();
    let lastKeep = Date.now();
    let locking = false;

    const lockNow = () => {
      if (locking) return;
      locking = true;
      const here = `${window.location.pathname}${window.location.search}`;
      void lockAdminAction()
        .catch(() => null)
        .finally(() => window.location.replace(`/admin/verrou?suite=${encodeURIComponent(here)}`));
    };

    const check = () => {
      if (Date.now() - lastInput >= idleMs) lockNow();
    };

    const onInput = () => {
      const now = Date.now();
      // Onglet resté en arrière-plan : les minuteries y sont ralenties, on vérifie avant de compter.
      if (now - lastInput >= idleMs) return lockNow();
      lastInput = now;
      if (now - lastKeep < KEEP_EVERY_MS) return;
      lastKeep = now;
      void keepAdminOpenAction()
        .then((res) => {
          if (!res.ok) lockNow();
        })
        .catch(() => null);
    };

    const onVisible = () => document.visibilityState === "visible" && check();
    for (const name of INPUTS) window.addEventListener(name, onInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 15_000);
    return () => {
      for (const name of INPUTS) window.removeEventListener(name, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [minutes]);

  return null;
}
