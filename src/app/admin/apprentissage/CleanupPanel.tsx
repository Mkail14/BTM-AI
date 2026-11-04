"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { Issue, IssueKind, LexEntry } from "@/lib/language/cleanup";
import {
  checkSpellingAction,
  deleteEntryAction,
  fixAllSpacesAction,
  ignoreIssueAction,
  updateEntryAction,
  type SpellingFix,
} from "./actions";

const KINDS: Record<IssueKind, { title: string; help: string; ignorable: boolean }> = {
  espaces: { title: "Espaces en trop", help: "Au début, à la fin, ou deux espaces de suite.", ignorable: false },
  doublon: { title: "En double", help: "La même traduction est enregistrée plusieurs fois : gardez-en une.", ignorable: false },
  "deux-traductions": {
    title: "Deux traductions différentes",
    help: "Le même mot français a plusieurs traductions : Tamilya ne sait pas laquelle prendre. Gardez la bonne, ou dites que les deux se disent.",
    ignorable: true,
  },
  copie: {
    title: "Faute de frappe ?",
    help: "Le shimaoré ressemble au français à une lettre près : souvent une faute en recopiant. Si c'est un mot emprunté au français, c'est voulu.",
    ignorable: true,
  },
};

const ORDER: IssueKind[] = ["deux-traductions", "copie", "doublon", "espaces"];

/** Une entrée, modifiable sur place. */
function EntryRow({ entry, onDone }: { entry: LexEntry; onDone: (result: ActionResult) => void }) {
  const [french, setFrench] = useState(entry.french);
  const [shimaore, setShimaore] = useState(entry.shimaore);
  const [pending, startTransition] = useTransition();
  const changed = french !== entry.french || shimaore !== entry.shimaore;

  const remove = async () => {
    if (!(await confirmDialog({ title: `Supprimer « ${entry.french} → ${entry.shimaore} » ?`, confirmLabel: "Supprimer", tone: "danger" }))) return;
    startTransition(async () => onDone(await deleteEntryAction({ table: entry.table, id: entry.id })));
  };

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
      <input value={french} onChange={(e) => setFrench(e.target.value)} aria-label="Français" className={inputClass} />
      <input
        value={shimaore}
        onChange={(e) => setShimaore(e.target.value)}
        aria-label="Shimaoré"
        spellCheck={false}
        className={`${inputClass} font-medium`}
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending || !changed}
          onClick={() => startTransition(async () => onDone(await updateEntryAction({ table: entry.table, id: entry.id, french, shimaore })))}
          className={primaryButton}
        >
          Corriger
        </button>
        <button type="button" disabled={pending} onClick={() => void remove()} className={`${secondaryButton} text-danger`}>
          Supprimer
        </button>
      </div>
    </div>
  );
}

export function CleanupPanel({ issues, total }: { issues: Issue[]; total: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [fixes, setFixes] = useState<SpellingFix[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, startTransition] = useTransition();

  const done = (result: ActionResult) => {
    setStatus(result);
    if (result.ok) router.refresh();
  };

  const check = async () => {
    setChecking(true);
    setStatus(null);
    const result = await checkSpellingAction().catch(() => ({ ok: false as const, message: "La relecture a échoué, réessayez." }));
    setChecking(false);
    if (result.ok) setFixes(result.fixes);
    else setStatus(result);
  };

  const spaces = issues.filter((i) => i.kind === "espaces").length;

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <p className="text-sm text-fg-muted">
        Tamilya apprend ce qu&apos;on lui donne, fautes comprises. Ici, ce qui ressemble à une erreur parmi les {total} mots et
        phrases appris.
      </p>

      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Relire le français</h3>
            <p className="text-sm text-fg-muted">L&apos;IA repère les fautes d&apos;orthographe côté français (« horraires », « le chauffer »…).</p>
          </div>
          <button type="button" disabled={checking} onClick={() => void check()} className={primaryButton}>
            {checking ? "Relecture… (jusqu'à 1 min)" : "Lancer la relecture"}
          </button>
        </div>
        {fixes ? (
          fixes.length === 0 ? (
            <p className="mt-3 text-sm text-success">Aucune faute trouvée dans le français. ✓</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {fixes.map((fix) => (
                <li key={fix.id} className="rounded-lg bg-bg-muted p-3 text-sm">
                  <p className="text-fg-muted line-through decoration-danger/60">{fix.french}</p>
                  <p className="font-medium">{fix.fix}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">Shimaoré : {fix.shimaore}</p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await updateEntryAction({ table: fix.table, id: fix.id, french: fix.fix, shimaore: fix.shimaore });
                          done(result);
                          if (result.ok) setFixes((list) => list?.filter((f) => f.id !== fix.id) ?? null);
                        })
                      }
                      className={primaryButton}
                    >
                      Appliquer
                    </button>
                    <button type="button" onClick={() => setFixes((list) => list?.filter((f) => f.id !== fix.id) ?? null)} className={secondaryButton}>
                      Laisser
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <ActionStatus result={status} />

      {issues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">
          Rien à nettoyer : le lexique est propre. ✓
        </p>
      ) : (
        ORDER.map((kind) => {
          const list = issues.filter((i) => i.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {KINDS[kind].title} <span className="text-sm font-normal text-fg-muted">({list.length})</span>
                </h3>
                {kind === "espaces" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => done(await fixAllSpacesAction()))}
                    className={secondaryButton}
                  >
                    Tout nettoyer ({spaces})
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">{KINDS[kind].help}</p>
              <ul className="mt-3 space-y-2">
                {list.map((issue) => (
                  <li key={`${issue.kind}|${issue.ref}`} className="space-y-2 rounded-xl border border-border p-3">
                    {issue.entries.map((entry) => (
                      <EntryRow key={`${entry.table}:${entry.id}`} entry={entry} onDone={done} />
                    ))}
                    {KINDS[kind].ignorable ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startTransition(async () => done(await ignoreIssueAction({ kind: issue.kind, ref: issue.ref })))}
                        className="text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                      >
                        C&apos;est voulu, ne plus le signaler
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
