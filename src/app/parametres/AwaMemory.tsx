"use client";

import { forgetMemoryAction } from "./actions";
import { Feedback, SECONDARY, useSave } from "./ContactForms";

const ICONS: Record<string, string> = { prenom: "👤", lieu: "🏠", travail: "💼", age: "🎂" };

/**
 * Ce qu'Awa a retenu de toi (prénom, commune, travail…), effaçable un par un
 * ou d'un coup. Awa ne s'en sert que pour mieux te répondre.
 */
export function AwaMemory({ facts }: { facts: { kind: string; content: string }[] }) {
  const { pending, state, run } = useSave();

  if (!facts.length) {
    return (
      <div className="space-y-2">
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
          Awa n&apos;a encore rien retenu de toi. Dis-lui par exemple ton prénom ou ta commune : elle s&apos;en souviendra.
        </p>
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {facts.map((fact) => (
          <li key={fact.kind} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden="true" className="text-lg">
              {ICONS[fact.kind] ?? "💬"}
            </span>
            <span className="min-w-0 flex-1 text-sm break-words">{fact.content}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => forgetMemoryAction(fact.kind))}
              aria-label={`Oublier : ${fact.content}`}
              className="rounded-lg px-2 py-1 text-xs font-medium text-fg-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              Oublier
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Faire tout oublier à Awa ? Elle ne se souviendra plus de rien te concernant.")) run(() => forgetMemoryAction());
          }}
          className={`${SECONDARY} text-danger hover:bg-danger-soft`}
        >
          Tout faire oublier
        </button>
        <Feedback state={state} />
      </div>
    </div>
  );
}
