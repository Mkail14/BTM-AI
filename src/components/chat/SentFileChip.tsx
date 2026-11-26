"use client";

import { FileText, TriangleAlert, X } from "lucide-react";
import type { SentFile } from "./PlusMenu";

/**
 * Fichier joint par le « + », dans la barre de conversation, au-dessus du texte (comme Claude) :
 * une petite vignette pour une image, une petite carte (nom, type) pour un PDF. La croix le retire.
 * Rien n'est rangé dans le Drive : le fichier part seulement avec la prochaine question.
 */
export function SentFileChip({ file, onRemove }: { file: SentFile; onRemove: () => void }) {
  const image = file.attachment?.mimeType.startsWith("image/") ? `data:${file.attachment.mimeType};base64,${file.attachment.data}` : null;
  const kind = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase() ?? "Fichier";

  return (
    <div className="group relative w-fit max-w-full" title={file.unreadable ?? file.name}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local (data:), pas d'optimisation possible
        <img src={image} alt={file.name} className="size-14 rounded-xl border border-border object-cover" />
      ) : (
        <div
          className={`flex h-14 w-52 max-w-full items-center gap-2.5 rounded-xl border px-2.5 ${
            file.attachment ? "border-border bg-bg-subtle" : "border-danger/50 bg-bg-subtle"
          }`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-muted text-[var(--persona,var(--accent))]">
            {file.attachment ? <FileText size={18} aria-hidden="true" /> : <TriangleAlert size={18} className="text-danger" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{file.name}</span>
            <span className={`block truncate text-[11px] ${file.attachment ? "text-fg-muted" : "text-danger"}`}>
              {file.attachment ? kind : file.unreadable}
            </span>
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${file.name}`}
        title="Retirer"
        className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-border bg-bg text-fg-muted shadow-sm transition-opacity hover:text-fg pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
