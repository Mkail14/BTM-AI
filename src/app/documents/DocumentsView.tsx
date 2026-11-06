"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconExternal, IconFolder, IconPlus, IconTrash } from "@/components/ui/icons";
import { DRIVE_FOLDERS, formatBytes, guessDriveFolder, type DriveFile, type DriveFolderId } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";

type Bank = { files: DriveFile[]; email: string | null; used: number | null; limit: number | null };

const NOTICES: Record<string, { tone: string; text: string }> = {
  ok: {
    tone: "border-success/30 bg-success-soft text-success",
    text: "Ton Google Drive est relié. Tu peux aussi te connecter avec ce compte Google : tu arrives sur le même compte Tamilya.",
  },
  pris: {
    tone: "border-warning/30 bg-warning-soft text-warning",
    text: "Ton Google Drive est relié. Ce compte Google sert déjà à un autre compte Tamilya : pour te connecter ici, garde ton e-mail habituel.",
  },
  refus: { tone: "border-warning/30 bg-warning-soft text-warning", text: "Google n'a pas donné l'accès : réessaie et laisse la case Drive cochée." },
  "autre-compte": { tone: "border-danger/30 bg-danger-soft text-danger", text: "Ce lien a expiré ou vient d'un autre compte : relance la connexion." },
  echec: { tone: "border-danger/30 bg-danger-soft text-danger", text: "La connexion n'a pas abouti. Réessaie." },
};

const dateLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mayotte" });

/** Banque de documents : les dossiers de la personne, rangés dans son Google Drive. */
export function DocumentsView({ connected, available, notice }: { connected: boolean; available: boolean; notice: string | null }) {
  const [linked, setLinked] = useState(connected);
  const known = notice ? NOTICES[notice] : null;

  return (
    <>
      {known ? (
        <p role="status" className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${known.tone}`}>
          {known.text}
        </p>
      ) : null}
      {linked ? <Bank onLost={() => setLinked(false)} /> : <Connect available={available} />}
    </>
  );
}

function Connect({ available }: { available: boolean }) {
  return (
    <section className="m-auto w-full max-w-md rounded-3xl border border-border bg-bg p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-bg-muted">
        <IconFolder width={24} height={24} />
      </span>
      <h1 className="mt-3 text-lg font-semibold">Tous tes papiers au même endroit</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Tes documents sont rangés par dossier dans ton Google Drive. Ils restent à toi, et Tamilya ne voit que ce qu&apos;elle y a déposé.
      </p>
      {available ? (
        <>
          {/* Vrai lien : on quitte le site pour Google. */}
          <a href="/api/drive/connect" className="mt-5 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
            Connecter Google Drive
          </a>
          <p className="mt-4 text-xs text-fg-muted">
            Ce compte Google te servira aussi à te connecter. Pas de compte Google ? Google te propose d&apos;en créer un gratuitement, même avec
            une adresse qui n&apos;est pas Gmail.
          </p>
        </>
      ) : (
        <p className="mt-5 text-sm text-fg-muted">Bientôt disponible.</p>
      )}
    </section>
  );
}

function Bank({ onLost }: { onLost: () => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [failed, setFailed] = useState(false);
  const [folder, setFolder] = useState<DriveFolderId | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/drive/files", { cache: "no-store" }).catch(() => null);
    if (response?.status === 409) return onLost();
    if (!response?.ok) return setFailed(true);
    setFailed(false);
    setBank((await response.json()) as Bank);
  }, [onLost]);

  useEffect(() => {
    const refresh = () => void load();
    refresh();
    // Depuis le Drive, un fichier a pu être supprimé ou déplacé.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const add = async (picked: FileList | null) => {
    const files = Array.from(picked ?? []);
    setProblem(null);
    // L'un après l'autre : les premiers envois créent les dossiers dont les suivants ont besoin.
    for (const [index, file] of files.entries()) {
      setSending(files.length > 1 ? `Envoi ${index + 1} sur ${files.length}…` : "Envoi…");
      const failure = await uploadToDrive(file, folder ?? guessDriveFolder(file.name));
      if (failure === "not-connected") return onLost();
      if (failure) {
        setProblem(`${file.name} : ${DRIVE_UPLOAD_MESSAGES[failure]}`);
        break;
      }
    }
    setSending(null);
    if (picker.current) picker.current.value = "";
    await load();
  };

  const change = async (url: string, init: RequestInit, error: string) => {
    setProblem(null);
    const response = await fetch(url, init).catch(() => null);
    if (response?.status === 409) return onLost();
    if (!response?.ok) setProblem(error);
    await load();
  };

  const move = (file: DriveFile, target: DriveFolderId) =>
    change(
      `/api/drive/files/${encodeURIComponent(file.id)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: target }) },
      "Le document n'a pas pu être déplacé. Réessaie.",
    );

  const remove = async (file: DriveFile) => {
    const ok = await confirmDialog({
      title: "Supprimer ce document ?",
      message: `${file.name} part dans la corbeille de ton Google Drive.`,
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (ok) await change(`/api/drive/files/${encodeURIComponent(file.id)}`, { method: "DELETE" }, "Le document n'a pas pu être supprimé. Réessaie.");
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: "Déconnecter Google Drive ?",
      message: "Tes documents restent dans ton Drive, mais tu ne les verras plus ici.",
      confirmLabel: "Déconnecter",
      tone: "danger",
    });
    if (!ok) return;
    const response = await fetch("/api/drive", { method: "DELETE" }).catch(() => null);
    if (response?.ok) onLost();
    else setProblem("La déconnexion a échoué. Réessaie.");
  };

  const shown = bank?.files.filter((file) => folder === null || file.folder === folder) ?? [];
  const free = bank?.limit != null && bank.used != null ? Math.max(bank.limit - bank.used, 0) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium">{bank?.email ?? "Google Drive"}</p>
          <p className="text-xs text-fg-muted">
            {free !== null ? `${formatBytes(free)} libres sur ${formatBytes(bank!.limit!)} · ` : ""}
            <button type="button" onClick={() => void disconnect()} className="underline hover:text-fg">
              Déconnecter
            </button>
          </p>
        </div>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={sending !== null}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          <IconPlus width={16} height={16} /> {sending ?? "Ajouter"}
        </button>
        <input ref={picker} type="file" multiple hidden onChange={(event) => void add(event.target.files)} />
      </div>

      {problem ? (
        <p role="alert" className="shrink-0 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}

      <div className="grid shrink-0 grid-cols-3 gap-2 lg:grid-cols-9">
        {DRIVE_FOLDERS.map((item) => {
          const selected = folder === item.id;
          const count = bank?.files.filter((file) => file.folder === item.id).length ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFolder(selected ? null : item.id)}
              className={`min-w-0 rounded-2xl border px-2 py-2 text-left ${selected ? "border-accent bg-bg-muted" : "border-border bg-bg hover:bg-bg-muted"}`}
            >
              <span className="block truncate text-xs font-medium">{item.label}</span>
              <span className="block text-[11px] text-fg-muted tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <section aria-label="Documents" className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-bg">
        {failed && !bank ? (
          <p className="p-6 text-center text-sm text-fg-muted">Google Drive ne répond pas. Réessaie dans un instant.</p>
        ) : !bank ? (
          <p role="status" className="p-6 text-center text-sm text-fg-muted">
            Chargement…
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-muted">{folder ? "Rien dans ce dossier." : "Ajoute ton premier document : Tamilya le range pour toi."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((file) => (
              <FileRow key={file.id} file={file} onMove={(target) => void move(file, target)} onRemove={() => void remove(file)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FileRow({ file, onMove, onRemove }: { file: DriveFile; onMove: (target: DriveFolderId) => void; onRemove: () => void }) {
  const details = [file.modifiedAt ? dateLabel.format(new Date(file.modifiedAt)) : null, file.size !== null ? formatBytes(file.size) : null].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        {file.link ? (
          <a href={file.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium hover:underline">
            <span className="truncate">{file.name}</span>
            <IconExternal width={14} height={14} className="shrink-0 text-fg-muted" />
          </a>
        ) : (
          <p className="truncate font-medium">{file.name}</p>
        )}
        <p className="text-xs text-fg-muted">{details}</p>
      </div>
      <select
        aria-label={`Dossier de ${file.name}`}
        value={file.folder}
        onChange={(event) => onMove(event.target.value as DriveFolderId)}
        className="w-28 shrink-0 rounded-lg border border-border bg-bg px-1.5 py-1 text-xs"
      >
        {DRIVE_FOLDERS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRemove} aria-label={`Supprimer ${file.name}`} className="shrink-0 rounded-lg p-1.5 text-fg-muted hover:bg-bg-muted hover:text-danger">
        <IconTrash width={16} height={16} />
      </button>
    </li>
  );
}
