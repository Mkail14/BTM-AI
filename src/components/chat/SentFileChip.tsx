"use client";

import { CircleCheck, FileText, Image as ImageIcon, LoaderCircle, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import type { SentFile } from "./PlusMenu";

/**
 * Étiquette au-dessus de la barre de conversation, après un envoi par le « + » :
 * le fichier est bien dans la conversation, il ne reste qu'à poser la question.
 * Dit aussi où en est le rangement dans le Drive.
 */
export function SentFileChip({ file, onRemove }: { file: SentFile; onRemove: () => void }) {
  const Icon = file.attachment?.mimeType.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name) ? ImageIcon : FileText;
  const drive =
    file.drive === "sending" ? (
      <span className="inline-flex items-center gap-1">
        <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> Rangement dans ton Drive…
      </span>
    ) : file.drive === "done" ? (
      <span className="inline-flex items-center gap-1">
        <CircleCheck size={12} className="text-success" aria-hidden="true" /> Rangé dans ton Drive
      </span>
    ) : file.drive === "not-connected" ? (
      <span>
        Pas rangé : relie ton Drive dans{" "}
        <Link href="/documents" className="font-medium underline">
          Mes documents
        </Link>
      </span>
    ) : (
      <span className="text-danger">{file.drive}</span>
    );

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-3 rounded-2xl border border-[var(--persona-border,var(--border))] bg-bg px-3 py-2.5 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-muted text-[var(--persona,var(--accent))]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        {file.attachment ? (
          <p className="text-xs font-medium text-[var(--persona,var(--accent))]">Dans la conversation : pose ta question à Tamilya.</p>
        ) : (
          <p className="inline-flex items-center gap-1 text-xs text-warning">
            <TriangleAlert size={12} aria-hidden="true" /> {file.unreadable}
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-fg-muted">{drive}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${file.name} de la conversation`}
        title="Retirer"
        className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
