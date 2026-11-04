"use client";

import { useState } from "react";

const TABS = ["Réponse", "À envoyer", "Erreurs"] as const;
type Tab = (typeof TABS)[number];

const FIELDS: [string, string][] = [
  ["Authorization", "Bearer suivi de votre code d'accès (tml_…)."],
  ["X-Gemini-Key", "Votre clé Gemini."],
  ["messages", "La conversation : jusqu'à 40 messages, rôle « user » ou « assistant »."],
  ["context", "Facultatif. Ce que fait votre application, pour situer Tamilya."],
];

const ERRORS: [string, string][] = [
  ["401 invalid_access_code", "Code absent, faux ou supprimé."],
  ["400 missing_gemini_key", "L'en-tête X-Gemini-Key manque."],
  ["401 invalid_gemini_key", "Google refuse votre clé."],
  ["429 gemini_quota", "Votre clé Gemini n'a plus de quota."],
  ["429 rate_limited", "Trop de questions : attendez (Retry-After)."],
  ["400 invalid_request", "La requête n'a pas le bon format."],
  ["503 unavailable", "Tamilya est momentanément arrêtée."],
];

/** Réponse, champs à envoyer et erreurs, en onglets : tout tient dans un seul cadre. */
export function ApiReference({ className = "" }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("Réponse");

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_18px_40px_-30px_rgb(0_0_0/0.35)] ${className}`}>
      <div role="tablist" aria-label="Détails" className="flex shrink-0 border-b border-border px-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              tab === name ? "border-[var(--persona,var(--accent))] text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-4 text-sm">
        {tab === "Réponse" ? (
          <div className="flex flex-col gap-3">
            <p className="text-fg-muted">Tamilya répond en JSON, avec un seul champ :</p>
            <pre className="overflow-x-auto rounded-xl bg-bg-subtle p-4 font-mono text-[12.5px] leading-relaxed">
              {`{\n  "reply": "Merci se dit « Marahaba » !"\n}`}
            </pre>
            <p className="text-fg-muted">
              En cas de problème, vous recevez <code className="font-mono text-xs text-fg">{`{ "error": "…" }`}</code> : voir
              l&apos;onglet Erreurs.
            </p>
          </div>
        ) : tab === "À envoyer" ? (
          <dl className="flex flex-col gap-3">
            {FIELDS.map(([name, text]) => (
              <div key={name}>
                <dt className="font-mono text-xs text-fg">{name}</dt>
                <dd className="mt-0.5 text-fg-muted">{text}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {ERRORS.map(([code, text]) => (
              <li key={code}>
                <code className="font-mono text-xs text-fg">{code}</code>
                <span className="block text-fg-muted">{text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
