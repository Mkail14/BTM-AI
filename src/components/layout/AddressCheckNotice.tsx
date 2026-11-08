"use client";

import { MapPin, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const KEY = "btm_address_check_seen";

/** Déjà fermé pour cette adresse sur cet appareil ? (Sans stockage : affiché.) */
function seen(line: string): boolean {
  try {
    return localStorage.getItem(KEY) === line;
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

/**
 * Rappel aux comptes dont l'adresse d'inscription a pu perdre ses « s »
 * (src/lib/auth/address-notice.ts). Se ferme d'un toucher ; disparaît pour de bon
 * quand l'adresse est réenregistrée dans Paramètres.
 */
export function AddressCheckNotice({ line }: { line: string }) {
  // Côté serveur : caché (le stockage du navigateur n'y est pas lisible), puis lu à l'affichage.
  const alreadySeen = useSyncExternalStore(noSubscribe, () => seen(line), () => true);
  const [closed, setClosed] = useState(false);

  if (alreadySeen || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(KEY, line);
    } catch {}
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
      <div role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-warning/50 bg-bg px-4 py-3 text-sm shadow-lg">
        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Vérifie ton adresse</span>
          <span className="block text-fg-muted">
            Un bug a pu enlever des lettres à l&apos;adresse donnée à ton inscription : « {line} ». Corrige-la pour tes livraisons.
          </span>
          <a href="/parametres?rubrique=adresse" className="mt-2 inline-block rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
            Vérifier mon adresse
          </a>
        </span>
        <button type="button" onClick={close} aria-label="Fermer le message" className="-my-2.5 -mr-2.5 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
