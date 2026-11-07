"use client";

import { BranchIcon, Pictogram } from "@/components/ui/Pictogram";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import type { BranchSuggestion } from "@/lib/language/branches";
import { lostOk } from "@/lib/safe-action";
import { X } from "lucide-react";
import { createBranchAction, suggestBranchAction } from "./actions";

const THOUGHTS = [
  "Tamilya repense à ses conversations…",
  "Elle cherche les mots qui lui ont manqué…",
  "Elle regarde ce qu'elle sait déjà dire…",
  "Elle prépare sa liste…",
];

/**
 * Création d'une branche avec Tamilya, en trois temps : elle réfléchit (orbe qui
 * respire, pensées qui défilent), elle propose (nom, sa raison, les mots qui
 * apparaissent un à un), puis la branche pousse sur la carte. On peut changer
 * le nom, retirer ou ajouter des mots, ou lui demander une autre idée.
 */
export function BranchCreator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [suggestion, setSuggestion] = useState<BranchSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(true);
  const [thought, setThought] = useState(0);
  const [label, setLabel] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [pending, start] = useTransition();
  const avoid = useRef<string[]>([]);
  const asked = useRef(false);

  const request = () =>
    suggestBranchAction(avoid.current).catch(lostOk).then((result) => {
      setThinking(false);
      if (!result.ok) return setError(result.message);
      setSuggestion(result.suggestion);
      setLabel(result.suggestion.label);
      setWords(result.suggestion.words);
      avoid.current = [...avoid.current, result.suggestion.label];
    });
  const ask = () => {
    setThinking(true);
    setError(null);
    void request();
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void request();
  });

  useEffect(() => {
    if (!thinking) return;
    const timer = window.setInterval(() => setThought((t) => (t + 1) % THOUGHTS.length), 1600);
    return () => window.clearInterval(timer);
  }, [thinking]);

  const addExtra = () => {
    const word = extra.trim().toLowerCase();
    if (word && !words.includes(word)) setWords((w) => [...w, word].slice(0, 30));
    setExtra("");
  };

  const grow = () =>
    start(async () => {
      const result = await createBranchAction({ label, emoji: suggestion?.emoji, reason: suggestion?.reason, words }).catch(lostOk);
      if (!result.ok) return setError(result.message);
      onCreated(result.id);
    });

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-white/60">Nouvelle branche</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="zone-appui relative grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {thinking ? (
        <div className="carte-apparait flex flex-col items-center py-10 text-center" aria-live="polite">
          <span className="branche-orbe relative grid size-24 place-items-center" aria-hidden="true">
            <span className="branche-onde absolute inset-0 rounded-full" />
            <span className="branche-onde absolute inset-0 rounded-full [animation-delay:0.8s]" />
            <span className="branche-coeur size-16 rounded-full" />
          </span>
          <p key={thought} className="branche-pensee mt-6 text-[15px] font-medium text-white/80">
            {THOUGHTS[thought]}
          </p>
        </div>
      ) : error && !suggestion ? (
        <div className="carte-apparait py-8 text-center">
          <p className="text-[15px] text-white/75">{error}</p>
          <button type="button" onClick={ask} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black active:scale-95">
            Réessayer
          </button>
        </div>
      ) : suggestion ? (
        <div key={suggestion.label} className="mt-2">
          <div className="branche-entree flex items-center gap-3">
            <span className="branche-emoji grid size-14 shrink-0 place-items-center rounded-2xl bg-white/[0.08] text-3xl ring-1 ring-white/10">
              <Pictogram of={suggestion.emoji} fallback={BranchIcon} />
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={30}
              aria-label="Nom de la branche"
              className="min-w-0 flex-1 rounded-xl bg-transparent px-1 py-1 text-3xl font-semibold tracking-tight text-white outline-none focus:bg-white/[0.06]"
            />
          </div>

          {suggestion.reason ? (
            <blockquote className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-[14px] leading-relaxed text-white/80">
              {suggestion.reason.split(" ").map((w, i) => (
                <span key={i} className="branche-mot inline-block" style={{ "--i": i } as CSSProperties}>
                  {w}&nbsp;
                </span>
              ))}
              <footer className="mt-2 text-[12px] font-medium text-white/60">Tamilya</footer>
            </blockquote>
          ) : null}

          <p className="mt-5 mb-2 text-[13px] text-white/50">
            Les mots qu&apos;elle aimerait apprendre · {words.length}
          </p>
          <ul className="flex flex-wrap gap-2">
            {words.map((w, i) => (
              <li key={w} className="branche-puce" style={{ "--i": i } as CSSProperties}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] py-1.5 pr-1.5 pl-3 text-sm ring-1 ring-white/10">
                  {w}
                  <button
                    type="button"
                    onClick={() => setWords((list) => list.filter((x) => x !== w))}
                    aria-label={`Retirer ${w}`}
                    className="relative grid size-5 place-items-center rounded-full text-white/70 transition after:absolute after:-inset-3 hover:bg-white/15 hover:text-white"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
            <li>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addExtra();
                }}
              >
                <input
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  onBlur={addExtra}
                  maxLength={60}
                  placeholder="+ un mot"
                  aria-label="Ajouter un mot"
                  className="w-28 rounded-full bg-transparent px-3 py-1.5 text-sm text-white ring-1 ring-white/15 ring-dashed outline-none placeholder:text-white/55 focus:w-40 focus:ring-white/35"
                />
              </form>
            </li>
          </ul>

          {error ? (
            <p role="alert" className="mt-3 text-xs text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              onClick={ask}
              disabled={pending}
              className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
            >
              ↻ Autre idée
            </button>
            <button
              type="button"
              onClick={grow}
              disabled={pending || label.trim().length < 2 || words.length === 0}
              className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-40"
            >
              {pending ? "La branche pousse…" : "Faire pousser la branche"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
