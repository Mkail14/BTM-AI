"use client";

import { BookOpen, ChevronDown, FileUp, LoaderCircle, Play, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { bookShare } from "@/lib/lecture/book";
import type { BookSummary } from "@/lib/lecture/book-store";
import { getServerStories, getStories, playStory, subscribeStories } from "@/lib/lecture/stage";

/**
 * Livres lus en entier par Tamilya : la personne ajoute un PDF, Tamilya le lit d'un bout à
 * l'autre en 3D, morceau après morceau (story-engine.ts), et reprend au marque-page.
 * Le livre reste dans le téléphone (book-store.ts) : rien n'est envoyé tant qu'on n'écoute pas.
 */

const store = () => import("@/lib/lecture/book-store");

/** Toujours la même histoire dans le globe pour un livre : relancer remplace la lecture en cours. */
const viewKey = (id: string) => `livre:${id}`;

export function BooksView() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { active } = useSyncExternalStore(subscribeStories, getStories, getServerStories);

  const load = useCallback(async () => {
    try {
      setBooks(await (await store()).listBooks());
    } catch {
      setBooks([]);
      setProblem("Ce navigateur ne garde pas les livres (navigation privée ?).");
    }
  }, []);

  // Le marque-page avance pendant l'écoute : la liste suit quand la partie change ou quand la lecture s'arrête.
  useEffect(() => {
    const refresh = () => void load();
    refresh();
  }, [load, active?.progress, active?.status]);

  const add = async (file: File | undefined) => {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    setProblem(null);
    setReading("Ouverture du PDF…");
    try {
      const { readPdfBook } = await import("@/lib/lecture/book-pdf");
      const book = await readPdfBook(file, (done, total) => setReading(`Lecture du PDF : page ${done} sur ${total}…`));
      await (await store()).saveBook(book);
      await load();
    } catch (error) {
      setProblem(error instanceof Error && error.message.length < 200 ? error.message : "Je n'arrive pas à ouvrir ce PDF.");
    } finally {
      setReading(null);
    }
  };

  const remove = async (book: BookSummary) => {
    const ok = await confirmDialog({
      title: "Retirer ce livre ?",
      message: `${book.title} et ton marque-page seront effacés de ce téléphone.`,
      confirmLabel: "Retirer",
      tone: "danger",
    });
    if (!ok) return;
    await (await store()).deleteBook(book.id);
    await load();
  };

  const listen = (book: BookSummary, chapter: number, chunk: number) => playStory(viewKey(book.id), { book: { id: book.id, chapter, chunk } });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={reading !== null}
        className="group flex shrink-0 items-center gap-4 rounded-2xl border-2 border-dashed border-accent/40 bg-bg px-4 py-4 text-left transition hover:border-accent hover:bg-accent-soft disabled:cursor-progress"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg shadow-md shadow-accent/25 transition group-hover:scale-105">
          {reading ? <LoaderCircle size={22} className="animate-spin" aria-hidden="true" /> : <FileUp size={22} aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold" aria-live="polite">
            {reading ?? "Ajouter un livre (PDF)"}
          </span>
          <span className="block text-xs text-fg-muted">Tamilya te le lit en entier, en 3D, et reprend là où tu en étais. Il reste sur ce téléphone.</span>
        </span>
      </button>
      <input ref={picker} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => void add(event.target.files?.[0])} />

      {problem ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}

      {books === null ? null : books.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-fg-muted">Aucun livre pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} playing={active?.key === viewKey(book.id)} onListen={(chapter, chunk) => listen(book, chapter, chunk)} onRemove={() => void remove(book)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookCard({ book, playing, onListen, onRemove }: { book: BookSummary; playing: boolean; onListen: (chapter: number, chunk: number) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const mark = book.progress;
  const shape = { chapters: book.chapters.map((c) => ({ title: c.title, chunks: Array.from({ length: c.chunks }, () => "") })) };
  const share = mark ? (mark.done ? 1 : bookShare(shape, mark.chapter, mark.chunk)) : 0;
  const minutes = book.chapters.reduce((n, c) => n + c.chunks, 0) * 4;
  const here = mark && !mark.done ? book.chapters[mark.chapter]?.title : null;

  return (
    <li className="rounded-2xl border border-border bg-bg">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <BookOpen size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{book.title}</p>
          <p className="text-xs text-fg-muted">
            {book.pages} pages · environ {Math.round(minutes / 60)} h d&apos;écoute{playing ? " · en cours" : ""}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(share ? 2 : 0, share * 100)}%` }} />
          </div>
          {here ? <p className="mt-1 truncate text-xs text-fg-muted">Marque-page : {here}</p> : mark?.done ? <p className="mt-1 text-xs text-fg-muted">Livre terminé</p> : null}
        </div>
        <button type="button" onClick={onRemove} aria-label={`Retirer ${book.title}`} className="shrink-0 rounded-full p-2 text-fg-muted hover:bg-bg-muted hover:text-danger">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        {mark && !mark.done ? (
          <button type="button" onClick={() => onListen(mark.chapter, mark.chunk)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
            <Play size={14} aria-hidden="true" /> Reprendre
          </button>
        ) : (
          <button type="button" onClick={() => onListen(0, 0)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
            {mark?.done ? <RotateCcw size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {mark?.done ? "Réécouter" : "Écouter"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          {book.chapters.length} parties <ChevronDown size={14} aria-hidden="true" className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? (
        <ol className="border-t border-border py-1">
          {book.chapters.map((chapter, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onListen(index, 0)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-bg-muted ${mark && !mark.done && mark.chapter === index ? "font-semibold text-accent" : ""}`}
              >
                <Play size={12} aria-hidden="true" className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                <span className="shrink-0 text-xs text-fg-muted">~{chapter.chunks * 4} min</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
