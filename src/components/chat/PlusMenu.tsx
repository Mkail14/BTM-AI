"use client";

import { Camera, CloudUpload, LoaderCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPlus } from "@/components/ui/icons";
import { guessDriveFolder } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";

/**
 * Le « + » à gauche de la barre de conversation : prendre une photo, ou envoyer un document
 * (une image aussi). Rien d'autre (demande de l'utilisateur, 2026-11-10 : cyclones, attestation
 * et livres en sont sortis). Le fichier est rangé dans le Google Drive de la personne, dans le
 * dossier deviné d'après son nom (Mes documents).
 */

const ITEM = "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium hover:bg-bg-muted disabled:cursor-progress";

function Item({ icon: Icon, onClick, disabled, children }: { icon: LucideIcon; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={ITEM}>
      <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--persona,var(--accent))]" />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

const two = (value: number) => String(value).padStart(2, "0");

/** Une photo prise sur le moment n'a pas de vrai nom (« image.jpg ») : la date la rend retrouvable dans le Drive. */
function datedPhoto(file: File, now = new Date()): File {
  const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg";
  const name = `Photo du ${two(now.getDate())}-${two(now.getMonth() + 1)}-${now.getFullYear()} à ${two(now.getHours())}h${two(now.getMinutes())}${extension}`;
  return new File([file], name, { type: file.type });
}

export function PlusMenu({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

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

  /** Photo, scan, image ou PDF : rangé dans le Google Drive de la personne. */
  const send = async (input: HTMLInputElement, photo = false) => {
    const picked = input.files?.[0];
    input.value = "";
    if (!picked) return;
    const file = photo ? datedPhoto(picked) : picked;
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

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label="Photo ou document"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Photo ou document"
        // Bulle ronde à part, de la hauteur de la barre (une ligne) et avec son bord et son ombre : le + flotte à côté.
        className={`group grid size-[50px] shrink-0 place-items-center rounded-full border bg-bg text-fg-muted shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] transition-[transform,color,border-color] pointer-coarse:size-[54px] hover:scale-105 hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))] active:scale-95 disabled:opacity-45 disabled:hover:scale-100 ${
          open ? "border-[var(--persona,var(--accent))] text-[var(--persona,var(--accent))]" : "border-[var(--persona-border,var(--border))]"
        }`}
      >
        {sending ? (
          <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
        ) : (
          <IconPlus className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
        )}
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void send(event.target, true)} />
      {/* Sans « accept » : PDF, scan, ou image déjà dans le téléphone (galerie, capture d'écran). */}
      <input ref={picker} type="file" hidden onChange={(event) => void send(event.target)} />

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg shadow-xl"
        >
          <div className="py-1">
            <Item icon={Camera} onClick={() => camera.current?.click()} disabled={sending !== null}>
              Prendre une photo
            </Item>
            <Item icon={CloudUpload} onClick={() => picker.current?.click()} disabled={sending !== null}>
              Envoyer un document ou une image
            </Item>
          </div>
          {sending ? (
            <p role="status" className="px-3 py-2 text-xs text-fg-muted">
              {sending}
            </p>
          ) : problem ? (
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
