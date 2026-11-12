"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DRIVE_FOLDERS, type DriveFile, type DriveFolderId } from "@/lib/drive/folders";

/** Ce que la page sait montrer : photo, PDF (les Docs/Sheets Google arrivent en PDF), ou rien. */
export function viewKind(file: DriveFile): "image" | "pdf" | "other" {
  if (/^image\/(png|jpe?g|gif|webp|avif)$/.test(file.mimeType)) return "image";
  if (file.mimeType === "application/pdf" || /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/.test(file.mimeType)) return "pdf";
  return "other";
}

export const contentUrl = (file: DriveFile, download = false) => `/api/drive/files/${encodeURIComponent(file.id)}/contenu${download ? "?telecharger=1" : ""}`;

/**
 * Visionneuse plein écran : le document s'affiche sur le site, sans aller sur Google Drive.
 * Flèches (ou clavier) pour passer au suivant, Échap pour fermer.
 */
export function DocumentViewer({
  files,
  index,
  onIndex,
  onClose,
  onMove,
  onRemove,
}: {
  files: DriveFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onMove: (file: DriveFile, target: DriveFolderId) => void;
  onRemove: (file: DriveFile) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const file = files[index];
  const kind = viewKind(file);
  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement) return;
      if (event.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      if (event.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, hasPrev, hasNext, onIndex]);

  const action = "grid size-10 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white";
  const arrow = "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 sm:grid";

  return (
    <dialog
      ref={ref}
      aria-label={file.name}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-neutral-950/95 p-0 text-white backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4">
          <button type="button" onClick={onClose} aria-label="Fermer" className={action}>
            <X size={22} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            {files.length > 1 ? (
              <p className="text-[11px] text-white/60 tabular-nums">
                {index + 1} sur {files.length}
              </p>
            ) : null}
          </div>
          <select
            aria-label="Ranger dans le dossier"
            value={file.folder}
            onChange={(event) => onMove(file, event.target.value as DriveFolderId)}
            className="hidden h-9 rounded-full border border-white/20 bg-white/10 px-3 text-xs text-white sm:block [&>option]:text-black"
          >
            {DRIVE_FOLDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <a href={contentUrl(file, true)} download aria-label="Télécharger" title="Télécharger" className={action}>
            <Download size={19} aria-hidden="true" />
          </a>
          {file.link ? (
            <a href={file.link} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir dans Google Drive" title="Ouvrir dans Google Drive" className={action}>
              <ExternalLink size={19} aria-hidden="true" />
            </a>
          ) : null}
          <button type="button" onClick={() => onRemove(file)} aria-label="Supprimer" title="Supprimer" className={`${action} hover:bg-danger/80`}>
            <Trash2 size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          {hasPrev ? (
            <button type="button" onClick={() => onIndex(index - 1)} aria-label="Document précédent" className={`${arrow} left-3`}>
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          ) : null}
          {hasNext ? (
            <button type="button" onClick={() => onIndex(index + 1)} aria-label="Document suivant" className={`${arrow} right-3`}>
              <ChevronRight size={24} aria-hidden="true" />
            </button>
          ) : null}
          {kind === "image" ? (
            <ImageView key={file.id} file={file} />
          ) : kind === "pdf" ? (
            <PdfView key={file.id} file={file} />
          ) : (
            <NoPreview file={file} />
          )}
        </div>

        {/* Téléphone : ranger et passer au suivant, au pouce. */}
        <footer className="flex shrink-0 items-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
          <button type="button" disabled={!hasPrev} onClick={() => onIndex(index - 1)} aria-label="Document précédent" className={`${action} disabled:opacity-30`}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <select
            aria-label="Ranger dans le dossier"
            value={file.folder}
            onChange={(event) => onMove(file, event.target.value as DriveFolderId)}
            className="h-10 min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-3 text-sm text-white [&>option]:text-black"
          >
            {DRIVE_FOLDERS.map((item) => (
              <option key={item.id} value={item.id}>
                Dossier : {item.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={!hasNext} onClick={() => onIndex(index + 1)} aria-label="Document suivant" className={`${action} disabled:opacity-30`}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function Loading() {
  return (
    <p role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> Ouverture du document…
    </p>
  );
}

function ImageView({ file }: { file: DriveFile }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  if (state === "error") return <NoPreview file={file} problem />;
  return (
    <div className="absolute inset-0 grid place-items-center p-2 sm:p-6">
      {state === "loading" ? <Loading /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par notre route, pas d'optimisation possible */}
      <img
        src={contentUrl(file)}
        alt={file.name}
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/** PDF dessiné page par page avec pdf.js : marche aussi sur téléphone, où le navigateur n'affiche pas les PDF dans une page. */
function PdfView({ file }: { file: DriveFile }) {
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let stopped = false;
    let destroy: (() => void) | null = null;
    (async () => {
      const response = await fetch(contentUrl(file), { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = new Uint8Array(await response.arrayBuffer());
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
      const task = pdfjs.getDocument({ data });
      destroy = () => void task.destroy();
      const pdf = await task.promise;
      const box = pages.current;
      if (stopped || !box) return;
      const width = Math.min(box.clientWidth - 16, 900);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (let number = 1; number <= pdf.numPages && !stopped; number += 1) {
        const page = await pdf.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${width}px`;
        canvas.setAttribute("aria-label", `Page ${number} sur ${pdf.numPages}`);
        canvas.className = "mx-auto mb-3 block max-w-full rounded-md bg-white shadow-xl";
        box.append(canvas);
        await page.render({ canvas, viewport }).promise;
        if (number === 1 && !stopped) setState("ok");
      }
    })().catch(() => {
      if (!stopped) setState("error");
    });
    return () => {
      stopped = true;
      destroy?.();
    };
  }, [file]);

  if (state === "error") return <NoPreview file={file} problem />;
  return (
    <div className="absolute inset-0 overflow-y-auto px-2 pt-2 pb-6 sm:px-6">
      {state === "loading" ? <Loading /> : null}
      <div ref={pages} />
    </div>
  );
}

function NoPreview({ file, problem = false }: { file: DriveFile; problem?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="max-w-xs text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-white/10">
          <FileQuestion size={30} aria-hidden="true" />
        </span>
        <p className="mt-4 font-semibold">{problem ? "Ce document ne s'ouvre pas ici" : "Pas d'aperçu pour ce type de fichier"}</p>
        <p className="mt-1 text-sm text-white/60">Télécharge-le pour l&apos;ouvrir sur ton appareil.</p>
        <div className="mt-5 flex flex-col gap-2">
          <a href={contentUrl(file, true)} download className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover">
            <Download size={17} aria-hidden="true" /> Télécharger
          </a>
          {file.link ? (
            <a href={file.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10">
              <ExternalLink size={16} aria-hidden="true" /> Ouvrir dans Google Drive
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
