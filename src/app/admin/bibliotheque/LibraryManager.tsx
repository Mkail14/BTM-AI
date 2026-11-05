"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { LibraryDocument } from "@/lib/library/store";
import { addDocumentAction, deleteDocumentAction, setDocumentStatusAction } from "./actions";

const TRUST: Record<LibraryDocument["trust"], string> = { officiel: "Officiel", media: "Média", autre: "Autre" };
const STATUS: Record<LibraryDocument["status"], string> = { a_valider: "À valider", publie: "Publié", rejete: "Rejeté" };

/** Ajouter un document (adresse ou texte collé), puis le relire et le publier. */
export function LibraryManager({ documents }: { documents: LibraryDocument[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const result = await action();
      setStatus(result);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => addDocumentAction({ url: url || undefined, title: title || undefined, text: text || undefined }),
            () => {
              setUrl("");
              setTitle("");
              setText("");
            },
          );
        }}
      >
        <h2 className="font-semibold">Ajouter un document</h2>
        <label className="text-sm font-medium">
          Adresse de la page
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.mayotte.gouv.fr/…" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Titre (facultatif pour une adresse)
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Ou colle un texte
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={`${inputClass} mt-1`} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Lecture…" : "Ajouter"}
          </button>
          <ActionStatus result={status} />
        </div>
      </form>

      <section className="rounded-xl border border-border bg-bg p-2 sm:p-3">
        <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">{documents.length} document(s)</h2>
        {documents.length ? (
          <ul className="divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{doc.title}</p>
                  <p className="text-sm text-fg-muted">
                    {STATUS[doc.status]} · {TRUST[doc.trust]} · {doc.source_name} · {doc.chars} caractères
                  </p>
                </div>
                {doc.status === "publie" ? (
                  <button type="button" disabled={pending} className={secondaryButton} onClick={() => run(() => setDocumentStatusAction({ id: doc.id, status: "a_valider" }))}>
                    Retirer
                  </button>
                ) : (
                  <button type="button" disabled={pending} className={primaryButton} onClick={() => run(() => setDocumentStatusAction({ id: doc.id, status: "publie" }))}>
                    Publier
                  </button>
                )}
                <button type="button" disabled={pending} className={secondaryButton} onClick={() => run(() => deleteDocumentAction(doc.id))}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-3 text-sm text-fg-muted">Rien pour l&apos;instant.</p>
        )}
      </section>
    </div>
  );
}
