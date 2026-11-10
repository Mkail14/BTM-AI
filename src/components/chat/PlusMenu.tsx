"use client";

import { BookOpen, Camera, ChevronDown, CloudUpload, FileUp, House, Image as ImageIcon, LoaderCircle, Play, Tornado, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconPlus } from "@/components/ui/icons";
import { guessDriveFolder } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";
import { bookShare } from "@/lib/lecture/book";
import type { BookSummary } from "@/lib/lecture/book-store";
import { getServerStories, getStories, playStory, subscribeStories, unlockAudio } from "@/lib/lecture/stage";
import type { FeatureId } from "@/lib/site/features-rules";

/**
 * Le « + » à gauche de la barre de conversation. Ce qu'il propose dépend des fonctionnalités
 * allumées pour la personne (/admin/fonctionnalites) : envoyer un document dans son Drive, la
 * carte des cyclones, l'attestation d'hébergement, et les livres lus en entier par Tamilya.
 * Toucher un livre le reprend au marque-page ; « Ajouter un livre » ouvre un PDF, qui reste dans
 * le téléphone (book-store.ts), puis la lecture démarre (demande de l'utilisateur, 2026-11-10).
 * Une image avec du texte (photo prise sur le moment, capture d'écran, image de la galerie) se lit
 * aussi d'ici, comme une page photographiée : administrateurs seulement, comme la lecture en 3D.
 */

const store = () => import("@/lib/lecture/book-store");

/** Toujours la même histoire dans le globe pour un livre : relancer remplace la lecture en cours. */
const viewKey = (id: string) => `livre:${id}`;

/** Ce que le + envoie à Tamilya : elle ouvre la carte ou le formulaire (détectés par le serveur). */
const ASK = {
  cyclone: "Y a-t-il un cyclone en ce moment ?",
  attestation: "Je veux faire une attestation d'hébergement.",
} as const;

const ITEM = "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium hover:bg-bg-muted disabled:cursor-progress";

function Item({ icon: Icon, onClick, disabled, children }: { icon: LucideIcon; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={ITEM}>
      <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--persona,var(--accent))]" />
      <span className="min-w-0 flex-1" aria-live="polite">
        {children}
      </span>
    </button>
  );
}

export function PlusMenu({
  features,
  isAdmin = false,
  disabled = false,
  onAsk,
}: {
  features: readonly FeatureId[];
  isAdmin?: boolean;
  disabled?: boolean;
  /** Envoie une demande à Tamilya, comme si la personne l'avait écrite. */
  onAsk: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [problem, setProblem] = useState<ReactNode>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const docPicker = useRef<HTMLInputElement>(null);
  const has = (feature: FeatureId) => features.includes(feature);
  const booksOn = has("livres");
  /** Le livre dont on voit les parties (une seule liste ouverte à la fois). */
  const [parts, setParts] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
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
    if (!open || !booksOn) return;
    const refresh = () => void load();
    refresh();
  }, [open, booksOn, load, active?.progress]);

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

  const listen = (id: string, chapter: number, chunk: number, from = 0) => {
    setOpen(false);
    playStory(viewKey(id), { book: { id, chapter, chunk, from } });
  };

  const resume = (book: BookSummary) => {
    const mark = book.progress;
    if (mark && !mark.done) listen(book.id, mark.chapter, mark.chunk, mark.from);
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

  /** Le son se débloque au toucher : la lecture démarrera seule une fois l'image choisie. */
  const pickImage = (target: HTMLInputElement | null) => {
    unlockAudio();
    target?.click();
  };

  const readImage = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setOpen(false);
    playStory(`image:${file.name}:${file.lastModified}`, { photo: file });
  };

  /** Un document (photo, scan, PDF) rangé dans le Google Drive de la personne, dans le dossier deviné d'après son nom. */
  const sendDocument = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setProblem(null);
    setSent(null);
    setSending(`Envoi de ${file.name}…`);
    const failure = await uploadToDrive(file, guessDriveFolder(file.name));
    setSending(null);
    if (failure === "not-connected") {
      setProblem(
        <>
          Relie d&apos;abord ton Google Drive :{" "}
          <Link href="/documents" className="font-medium underline">
            Mes documents
          </Link>
        </>,
      );
    } else if (failure) setProblem(DRIVE_UPLOAD_MESSAGES[failure]);
    else setSent(`${file.name} est rangé dans ton Drive.`);
  };

  const ask = (text: string) => {
    setOpen(false);
    onAsk(text);
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

  const photosOn = isAdmin;
  // Rien à proposer à cette personne : pas de +.
  if (!booksOn && !photosOn && !has("documents") && !has("cyclone") && !has("attestation")) return null;
  const busy = reading ?? sending;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label="Plus d'options"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Plus d'options"
        // Bulle ronde à part, de la hauteur de la barre (une ligne) et avec son bord et son ombre : le + flotte à côté.
        className={`group grid size-[50px] shrink-0 place-items-center rounded-full border bg-bg text-fg-muted shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] transition-[transform,color,border-color] pointer-coarse:size-[54px] hover:scale-105 hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))] active:scale-95 disabled:opacity-45 disabled:hover:scale-100 ${
          open ? "border-[var(--persona,var(--accent))] text-[var(--persona,var(--accent))]" : "border-[var(--persona-border,var(--border))]"
        }`}
      >
        {busy ? (
          <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
        ) : (
          <IconPlus className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
        )}
      </button>
      <input ref={picker} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => void add(event.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => readImage(event.target)} />
      {/* Sans « capture » : la galerie, pour une capture d'écran ou une image déjà dans le téléphone. */}
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(event) => readImage(event.target)} />
      <input ref={docPicker} type="file" hidden onChange={(event) => void sendDocument(event.target)} />

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg shadow-xl"
        >
          {booksOn && books?.length ? (
            <ul className="max-h-[min(24rem,50vh)] overflow-y-auto py-1">
              {books.map((book) => {
                const mark = book.progress;
                const shape = { chapters: book.chapters.map((c) => ({ title: c.title, chunks: Array.from({ length: c.chunks }, () => "") })) };
                const share = mark ? (mark.done ? 1 : bookShare(shape, mark.chapter, mark.chunk)) : 0;
                return (
                  <li key={book.id} className="flex flex-wrap items-center">
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
                    <button
                      type="button"
                      onClick={() => setParts(parts === book.id ? null : book.id)}
                      aria-label={`Parties de ${book.title}`}
                      aria-expanded={parts === book.id}
                      className="shrink-0 rounded-full p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
                    >
                      <ChevronDown size={14} aria-hidden="true" className={`transition ${parts === book.id ? "rotate-180" : ""}`} />
                    </button>
                    <button type="button" onClick={() => void remove(book)} aria-label={`Retirer ${book.title}`} className="mr-1 shrink-0 rounded-full p-2 text-fg-muted hover:bg-bg-muted hover:text-danger">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                    {parts === book.id ? (
                      // Une partie précise : lue depuis son début, puis la suite du livre.
                      <ol className="w-full basis-full border-y border-border bg-bg-subtle py-1">
                        {book.chapters.map((chapter, index) => (
                          <li key={index}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => listen(book.id, index, 0)}
                              className={`flex w-full items-center gap-2 py-1.5 pr-3 pl-9 text-left text-xs hover:bg-bg-muted ${mark && !mark.done && mark.chapter === index ? "font-semibold text-accent" : ""}`}
                            >
                              <Play size={10} aria-hidden="true" className="shrink-0 text-fg-muted" />
                              <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="py-1">
            {has("documents") ? (
              <Item icon={CloudUpload} onClick={() => docPicker.current?.click()} disabled={sending !== null}>
                {sending ?? "Envoyer un document"}
              </Item>
            ) : null}
            {has("cyclone") ? (
              <Item icon={Tornado} onClick={() => ask(ASK.cyclone)}>
                Cyclones
              </Item>
            ) : null}
            {has("attestation") ? (
              <Item icon={House} onClick={() => ask(ASK.attestation)}>
                Attestation d&apos;hébergement
              </Item>
            ) : null}
            {booksOn ? (
              <Item icon={FileUp} onClick={() => picker.current?.click()} disabled={reading !== null}>
                {reading ?? "Ajouter un livre (PDF)"}
              </Item>
            ) : null}
            {photosOn ? (
              <>
                <Item icon={Camera} onClick={() => pickImage(camera.current)}>
                  Lire une page en photo
                </Item>
                <Item icon={ImageIcon} onClick={() => pickImage(gallery.current)}>
                  Lire une image ou une capture
                </Item>
              </>
            ) : null}
          </div>
          {problem ? (
            <p role="alert" className="px-3 py-2 text-xs text-danger">
              {problem}
            </p>
          ) : sent ? (
            <p role="status" className="px-3 py-2 text-xs text-success">
              {sent}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
