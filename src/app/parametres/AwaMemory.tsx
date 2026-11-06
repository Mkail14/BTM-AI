"use client";

import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { forgetMemoryAction } from "./actions";
import { DANGER, Feedback, QUIET, SettingsGroup, useSave } from "./ui";

/**
 * Ce que Tamilya a retenu de toi (prénom, commune, travail…), effaçable un par un
 * ou d'un coup. Tamilya ne s'en sert que pour mieux te répondre.
 */
export function AwaMemory({ facts }: { facts: { kind: string; content: string }[] }) {
  const { pending, state, run } = useSave();

  async function forgetAll() {
    const ok = await confirmDialog({
      title: "Tout faire oublier à Tamilya ?",
      message: "Elle ne se souviendra plus de rien te concernant.",
      confirmLabel: "Tout oublier",
      tone: "danger",
    });
    if (ok) run(() => forgetMemoryAction());
  }

  return (
    <SettingsGroup
      title="Ce qu'elle retient de toi"
      description="Tamilya s'en sert seulement pour mieux te répondre."
      footer={
        facts.length || state ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {facts.length ? (
              <button type="button" disabled={pending} onClick={forgetAll} className={DANGER}>
                Tout faire oublier
              </button>
            ) : null}
            <Feedback state={state} />
          </div>
        ) : null
      }
    >
      {facts.length ? (
        facts.map((fact) => (
          <div key={fact.kind} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 sm:pl-5">
            <p className="min-w-0 flex-1 text-sm break-words">{fact.content}</p>
            <button type="button" disabled={pending} onClick={() => run(() => forgetMemoryAction(fact.kind))} aria-label={`Oublier : ${fact.content}`} className={QUIET}>
              Oublier
            </button>
          </div>
        ))
      ) : (
        <p className="px-4 py-5 text-sm text-fg-muted sm:px-5">Tamilya n&apos;a encore rien retenu de toi. Dis-lui par exemple ton prénom ou ta commune : elle s&apos;en souviendra.</p>
      )}
    </SettingsGroup>
  );
}
