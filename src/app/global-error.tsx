"use client";

import { useEffect } from "react";

/**
 * Erreur dans la mise en page racine : elle remplace toute la page, donc le CSS global
 * peut manquer. Styles écrits ici, clairs ou sombres selon l'appareil.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[site] Erreur globale", error);
  }, [error]);

  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Quelque chose n&apos;a pas marché</title>
        <style>{`
          :root { color-scheme: light dark; --bg: #f7f7f5; --fg: #16191b; --muted: #5d6468; --accent: #c8295f; }
          @media (prefers-color-scheme: dark) { :root { --bg: #131516; --fg: #ecedee; --muted: #9ba3a7; --accent: #f06a9b; } }
          body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
            background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); box-sizing: border-box; }
          main { max-width: 26rem; text-align: center; }
          h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
          p { color: var(--muted); font-size: 0.9375rem; line-height: 1.5; margin: 0 0 1.5rem; }
          .actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center; }
          button { min-height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: #c8295f; color: #fff;
            font: inherit; font-weight: 600; cursor: pointer; }
          a { min-height: 44px; display: inline-flex; align-items: center; padding: 0 8px; color: var(--accent); font-weight: 600; }
          button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Quelque chose n&apos;a pas marché</h1>
          <p role="alert">Le site n&apos;a pas pu s&apos;afficher. Vérifie ta connexion, puis réessaie.</p>
          <div className="actions">
            <button type="button" onClick={reset}>
              Réessayer
            </button>
            {/* Lien classique : recharge tout le site, même si l'application est cassée. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Revenir à l&apos;accueil</a>
          </div>
        </main>
      </body>
    </html>
  );
}
