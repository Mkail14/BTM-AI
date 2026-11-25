"use client";

import { useEffect, useState } from "react";
import { openWithoutCodeAction } from "./actions";

/**
 * Code d'accès retiré : l'admin s'ouvre sans rien demander (un cookie ne peut
 * pas être posé pendant le rendu d'une page, d'où ce petit aller-retour).
 */
export function OpenWithoutCode({ next }: { next: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void openWithoutCodeAction()
      .catch(() => ({ ok: false }))
      .then((res) => (res.ok ? window.location.replace(next) : setFailed(true)));
  }, [next]);

  return (
    <main className="grid min-h-dvh place-items-center px-4 text-sm text-fg-muted">
      {failed ? <p role="alert">Ouverture impossible : recharge la page.</p> : <p role="status">Ouverture de l&apos;admin…</p>}
    </main>
  );
}
