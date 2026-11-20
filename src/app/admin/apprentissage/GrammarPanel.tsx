"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, Counter, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import { lostOk } from "@/lib/safe-action";
import { deleteGrammarAction, reorderGrammarAction, saveGrammarAction, suggestRulesAction, type SuggestedRule } from "./actions";
import { GRAMMAR_LIMITS, type GrammarRow } from "./limits";

type Draft = Omit<GrammarRow, "id"> & { id: string | null };

const EMPTY: Draft = { id: null, title: "", rule: "", examples: "", isActive: true };

/**
 * Guide pour construire la grammaire : chaque fiche donne les phrases FRANÇAISES à traduire, le
 * locuteur écrit le shimaoré. Aucune traduction n'est écrite ici : seul un locuteur la donne.
 */
const GUIDES: { title: string; hint: string; examples: string }[] = [
  {
    title: "Les pronoms (je, tu, il, nous…)",
    hint: "Une seule écriture pour chaque pronom.",
    examples: "je = \ntu = \nil / elle = \nnous = \nvous = \nils / elles = ",
  },
  {
    title: "Conjuguer au présent",
    hint: "Avec un verbe courant : le début (marque de la personne) change-t-il, et la fin du verbe ?",
    examples: "je mange = \ntu manges = \nil mange = \nnous mangeons = \nvous mangez = \nils mangent = ",
  },
  {
    title: "Parler au passé",
    hint: "Dis ce qui change par rapport au présent.",
    examples: "j'ai mangé = \ntu as mangé = \nil a mangé = \nnous avons mangé = \nils ont mangé = ",
  },
  {
    title: "Parler au futur",
    hint: "Dis ce qui change par rapport au présent.",
    examples: "je mangerai = \ntu mangeras = \nil mangera = \nnous mangerons = \nils mangeront = ",
  },
  {
    title: "Dire non (la négation)",
    hint: "Où se place le « non » ? Change-t-il selon le temps ?",
    examples: "je ne mange pas = \ntu ne manges pas = \nje n'ai pas mangé = \nje ne mangerai pas = \nje ne sais pas = ",
  },
  {
    title: "Poser une question",
    hint: "Avec un mot (où, quand…) et sans mot (oui ou non).",
    examples: "tu manges ? = \noù tu vas ? = \nquand tu viens ? = \ncomment tu t'appelles ? = \ncombien ça coûte ? = \npourquoi tu pleures ? = ",
  },
  {
    title: "Mon, ton, son (possessifs)",
    hint: "Le possessif change-t-il avec le nom (maison, enfants) ?",
    examples: "ma maison = \nta maison = \nsa maison = \nnotre maison = \nvotre maison = \nleur maison = \nmes enfants = ",
  },
  {
    title: "Le pluriel des noms",
    hint: "Qu'est-ce qui s'ajoute ou change devant le nom ?",
    examples: "un enfant = \ndes enfants = \nune maison = \ndes maisons = \nle taxi = \nles taxis = ",
  },
  {
    title: "Être et avoir",
    hint: "« Je suis fatigué », « j'ai faim », « il y a de l'eau » se disent-ils comme les autres verbes ?",
    examples: "je suis fatigué = \nil est grand = \nj'ai faim = \ntu as un frère = \nil y a de l'eau = ",
  },
];

export function GrammarPanel({ rows, unavailable }: { rows: GrammarRow[]; unavailable: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [suggested, setSuggested] = useState<SuggestedRule[]>([]);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action().catch(lostOk);
      setStatus(result);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });

  const suggest = () =>
    startTransition(async () => {
      const result = await suggestRulesAction().catch(lostOk);
      setStatus(result);
      setSuggested("rules" in result ? (result.rules ?? []) : []);
    });

  const move = (index: number, by: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    run(() => reorderGrammarAction(ids));
  };

  const remove = async (row: GrammarRow) => {
    if (!(await confirmDialog({ title: `Supprimer la règle « ${row.title} » ?`, confirmLabel: "Supprimer", tone: "danger" }))) return;
    run(() => deleteGrammarAction(row.id));
  };

  const done = new Set(rows.map((r) => r.title.trim().toLowerCase()));
  const todo = GUIDES.filter((g) => !done.has(g.title.toLowerCase()));
  const hint = GUIDES.find((g) => g.title === draft?.title)?.hint;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <p className="text-sm text-fg-muted">
        Des règles courtes, avec des exemples : Tamilya les reçoit à chaque message et s&apos;en sert pour construire ses
        phrases. Les plus importantes en haut.
      </p>

      {unavailable ? (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
          Appliquez la migration <code className="font-mono">20261125000000_apprentissage_shimaore.sql</code> dans Supabase
          pour enregistrer des règles.
        </p>
      ) : null}

      <ActionStatus result={status} />

      {todo.length > 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">
            {rows.length === 0 ? "Aucune règle pour l'instant." : "À écrire pour qu'elle sache construire des phrases :"} Choisis une fiche, remplis le
            shimaoré à côté de chaque phrase française, puis relis la règle.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {todo.map((guide) => (
              <button
                key={guide.title}
                type="button"
                onClick={() => setDraft({ ...EMPTY, title: guide.title, examples: guide.examples, rule: "" })}
                className="rounded-full border border-border px-3 py-1 text-sm hover:bg-bg-muted"
              >
                + {guide.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ol className="space-y-2">
        {rows.map((row, index) =>
          draft?.id === row.id ? null : (
            <li key={row.id} className={`rounded-xl border border-border p-4 ${row.isActive ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-bg-muted text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.title}
                    {row.isActive ? null : <span className="ml-2 text-xs font-normal text-fg-muted">(en pause)</span>}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-line">{row.rule}</p>
                  {row.examples ? <p className="mt-2 text-sm whitespace-pre-line text-fg-muted">{row.examples}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <button type="button" disabled={pending || index === 0} onClick={() => move(index, -1)} aria-label="Monter" className={secondaryButton}>
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Descendre"
                    className={secondaryButton}
                  >
                    ↓
                  </button>
                  <button type="button" disabled={pending} onClick={() => setDraft(row)} className={secondaryButton}>
                    Modifier
                  </button>
                  <button type="button" disabled={pending} onClick={() => void remove(row)} className={`${secondaryButton} text-danger`}>
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ol>

      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveGrammarAction(draft), () => setDraft(null));
          }}
          className="space-y-3 rounded-xl border border-accent/40 bg-bg p-4"
        >
          <label className="block">
            <span className="text-sm font-medium">Titre</span>
            <input
              value={draft.title}
              maxLength={GRAMMAR_LIMITS.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="ex. : Le pluriel des noms"
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">La règle, en mots simples</span>
            {hint ? <span className="block text-xs text-fg-muted">{hint}</span> : null}
            <textarea
              value={draft.rule}
              maxLength={GRAMMAR_LIMITS.rule}
              rows={3}
              onChange={(e) => set("rule", e.target.value)}
              placeholder="ex. : Au pluriel, « i » devant le nom devient « zi »."
              className={`${inputClass} mt-1.5`}
            />
            <Counter value={draft.rule} max={GRAMMAR_LIMITS.rule} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Exemples (français = shimaoré, un par ligne)</span>
            <textarea
              value={draft.examples}
              maxLength={GRAMMAR_LIMITS.examples}
              rows={Math.min(10, Math.max(3, draft.examples.split("\n").length))}
              onChange={(e) => set("examples", e.target.value)}
              placeholder={"le taxi = i taxi\nles offres = zi offres"}
              className={`${inputClass} mt-1.5 font-mono`}
            />
            <Counter value={draft.examples} max={GRAMMAR_LIMITS.examples} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            Active (décochez pour la mettre en pause)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !draft.title.trim() || !draft.rule.trim()} className={primaryButton}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className={secondaryButton}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={unavailable} onClick={() => setDraft(EMPTY)} className={primaryButton}>
            + Ajouter une règle
          </button>
          <button type="button" disabled={unavailable || pending} onClick={suggest} className={secondaryButton}>
            {pending ? "Recherche…" : "Proposer des règles d'après mes phrases"}
          </button>
        </div>
      )}

      {suggested.length > 0 ? (
        <ul className="space-y-2">
          {suggested.map((rule) => (
            <li key={rule.title} className="rounded-xl border border-dashed border-accent/50 p-4">
              <p className="font-semibold">{rule.title}</p>
              <p className="mt-1 text-sm whitespace-pre-line">{rule.rule}</p>
              {rule.examples ? <p className="mt-2 text-sm whitespace-pre-line text-fg-muted">{rule.examples}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...EMPTY, ...rule });
                    setSuggested((list) => list.filter((r) => r !== rule));
                  }}
                  className={secondaryButton}
                >
                  Relire et garder
                </button>
                <button type="button" onClick={() => setSuggested((list) => list.filter((r) => r !== rule))} className={secondaryButton}>
                  Écarter
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
