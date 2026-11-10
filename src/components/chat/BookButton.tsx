"use client";

import { BookOpen, FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconPlus } from "@/components/ui/icons";
import { bookShare } from "@/lib/lecture/book";
import type { BookSummary } from "@/lib/lecture/book-store";
import { getServerStories, getStories, playStory, subscribeStories } from "@/lib/lecture/stage";

/**
 * Le « + » à gauche de la barre de conversation : les livres lus en entier par Tamilya.
 * Toucher un livre le reprend au marque-page ; « Ajouter un livre » ouvre un PDF, qui reste dans
 * le téléphone (book-store.ts), puis la lecture démarre. Demande de l'utilisateur (2026-11-10) :
 * ici plutôt qu'une rubrique dans le menu.
 */

const store = () => import("@/lib/lecture/book-store");

/** Toujours la même histoire dans le globe pour un livre : relancer remplace la lecture en cours. */
const viewKey = (id: string) => `livre:${id}`;

export function BookButton({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { active } = useSyncExternalStore(subscribeStories, getStories, getServerStories);

  const load = useCallback(async () => {
    try {
      setBooks(await (await store()).listBooks());
    } catch {
      setBooks([]);
      setProblem("Ce navigateur ne garde pas les livres (navigation privée ?).");
    }
  }, []);

  // Le marque-page avance pendant l'écoute : la liste suit à chaque ouverture et quand la partie change.
  useEffect(() => {
    if (!open) return;
    const refresh = () => void load();
    refresh();
  }, [open, load, active?.progress]);

  // Toucher ailleurs ou Échap : le menu se ferme.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const listen = (id: string, chapter: number, chunk: number) => {
    setOpen(false);
    playStory(viewKey(id), { book: { id, chapter, chunk } });
  };

  const resume = (book: BookSummary) => {
    const mark = book.progress;
    if (mark && !mark.done) listen(book.id, mark.chapter, mark.chunk);
    else listen(book.id, 0, 0);
  };

  const add = async (file: File | undefined) => {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    setProblem(null);
    setReading("Ouverture du PDF…");
    try {
      const { readPdfBook } = await import("@/lib/lecture/book-pdf");
      const book = await readPdfBook(file, (done, total) => setReading(`Page ${done} sur ${total}…`));
      await (await store()).saveBook(book);
      setReading(null);
      listen(book.id, 0, 0);
    } catch (error) {
      setReading(null);
      setProblem(error instanceof Error && error.message.length < 200 ? error.message : "Je n'arrive pas à ouvrir ce PDF.");
    }
  };

  const remove = async (book: BookSummary) => {
    const ok = await confirmDialog({
      title: "Retirer ce livre ?",
      message: `${book.title} et son marque-page seront effacés de ce téléphone.`,
      confirmLabel: "Retirer",
      tone: "danger",
    });
    if (!ok) return;
    await (await store()).deleteBook(book.id);
    await load();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label="Mes livres"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Mes livres"
        className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition pointer-coarse:size-10 hover:bg-bg-muted hover:text-fg disabled:opacity-45"
      >
        {reading ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <IconPlus />}
      </button>
      <input ref={picker} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => void add(event.target.files?.[0])} />

      {open ? (
        <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-bg shadow-xl">
          {books?.length ? (
            <ul className="max-h-64 overflow-y-auto py-1">
              {books.map((book) => {
                const mark = book.progress;
                const shape = { chapters: book.chapters.map((c) => ({ title: c.title, chunks: Array.from({ length: c.chunks }, () => "") })) };
                const share = mark ? (mark.done ? 1 : bookShare(shape, mark.chapter, mark.chunk)) : 0;
                return (
                  <li key={book.id} className="flex items-center">
                    <button type="button" role="menuitem" onClick={() => resume(book)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-bg-muted">
                      <BookOpen size={16} aria-hidden="true" className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{book.title}</span>
                        <span className="block text-xs text-fg-muted">
                          {mark?.done ? "Terminé · réécouter" : mark ? `Reprendre · ${Math.round(share * 100)} %` : "Écouter"}
                          {active?.key === viewKey(book.id) && active.status !== "done" && active.status !== "error" ? " · en cours" : ""}
                        </span>
                      </span>
                    </button>
                    <button type="button" onClick={() => void remove(book)} aria-label={`Retirer ${book.title}`} className="mr-1 shrink-0 rounded-full p-2 text-fg-muted hover:bg-bg-muted hover:text-danger">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => picker.current?.click()}
            disabled={reading !== null}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-bg-muted disabled:cursor-progress ${books?.length ? "border-t border-border" : ""}`}
          >
            <FileUp size={16} aria-hidden="true" className="shrink-0" />
            <span aria-live="polite">{reading ?? "Ajouter un livre (PDF)"}</span>
          </button>
          {problem ? (
            <p role="alert" className="border-t border-border px-3 py-2 text-xs text-danger">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
