"use client";

import { Camera, CloudUpload, LoaderCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPlus } from "@/components/ui/icons";
import { guessDriveFolder } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";
import { CHAT_ATTACHMENT_MAX_BYTES, isChatAttachmentType } from "@/lib/chat/attachment";
import type { ChatAttachment } from "@/lib/chat/types";

/**
 * Le « + » à gauche de la barre de conversation : prendre une photo, ou envoyer un document
 * (une image aussi). Rien d'autre (demande de l'utilisateur, 2026-11-10 : cyclones, attestation
 * et livres en sont sortis). Le fichier est rangé dans le Google Drive de la personne, dans le
 * dossier deviné d'après son nom (Mes documents). Une copie reste jointe à la conversation
 * (onFile) : Tamilya la lit avec la question suivante.
 */

/** Fichier envoyé par le « + » : rangé dans le Drive, et joint à la prochaine question si Tamilya sait le lire. */
export type SentFile = {
  name: string;
  /** null : format ou poids que Tamilya ne sait pas lire (`unreadable` dit pourquoi). */
  attachment: ChatAttachment | null;
  unreadable: string | null;
  drive: "sending" | "done" | "not-connected" | string;
};

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

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Photo trop lourde ou dans un format que l'IA ne lit pas (HEIC…) : réduite en JPEG (2048 px au plus). */
async function shrinkPhoto(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

/** Copie lisible par Tamilya (image ou PDF de 4 Mo au plus), ou la raison pour laquelle elle ne la lira pas. */
async function readForChat(file: File): Promise<Pick<SentFile, "attachment" | "unreadable">> {
  const tooBig = "Trop lourd pour que Tamilya le lise (4 Mo au plus).";
  if (file.type.startsWith("image/") && (!isChatAttachmentType(file.type) || file.size > CHAT_ATTACHMENT_MAX_BYTES)) {
    const photo = await shrinkPhoto(file);
    if (!photo) return { attachment: null, unreadable: "Tamilya ne sait pas lire ce format d'image." };
    if (photo.size > CHAT_ATTACHMENT_MAX_BYTES) return { attachment: null, unreadable: tooBig };
    return { attachment: { name: file.name, mimeType: "image/jpeg", data: await toBase64(photo) }, unreadable: null };
  }
  if (!isChatAttachmentType(file.type)) return { attachment: null, unreadable: "Tamilya lit les photos et les PDF, pas ce type de fichier." };
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return { attachment: null, unreadable: tooBig };
  try {
    return { attachment: { name: file.name, mimeType: file.type, data: await toBase64(file) }, unreadable: null };
  } catch {
    return { attachment: null, unreadable: "Fichier illisible." };
  }
}

export function PlusMenu({ disabled = false, onFile }: { disabled?: boolean; onFile?: (file: SentFile) => void }) {
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

  /** Photo, scan, image ou PDF : rangé dans le Google Drive de la personne, et joint à la conversation. */
  const send = async (input: HTMLInputElement, photo = false) => {
    const picked = input.files?.[0];
    input.value = "";
    if (!picked) return;
    const file = photo ? datedPhoto(picked) : picked;
    setProblem(null);
    setSent(null);
    if (onFile) {
      // Le menu se ferme : l'étiquette au-dessus de la barre montre que le fichier est dans la conversation.
      const readable = await readForChat(file);
      onFile({ name: file.name, ...readable, drive: "sending" });
      setOpen(false);
      const failure = await uploadToDrive(file, guessDriveFolder(file.name));
      onFile({ name: file.name, ...readable, drive: failure ? (failure === "not-connected" ? failure : DRIVE_UPLOAD_MESSAGES[failure]) : "done" });
      return;
    }
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
