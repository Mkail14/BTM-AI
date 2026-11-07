"use client";

import {
  BriefcaseBusiness,
  CarFront,
  CloudUpload,
  ExternalLink,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  HardDrive,
  HeartPulse,
  House,
  IdCard,
  LoaderCircle,
  Lock,
  ReceiptText,
  Trash2,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { DRIVE_FOLDERS, formatBytes, guessDriveFolder, type DriveFile, type DriveFolderId } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";

type Bank = { files: DriveFile[]; email: string | null; used: number | null; limit: number | null };

const NOTICES: Record<string, { tone: string; text: string }> = {
  ok: {
    tone: "border-success/30 bg-success-soft text-success",
    text: "C'est relié : tes documents iront dans ton Google Drive. Tu peux aussi te connecter au site avec ce compte Google.",
  },
  pris: {
    tone: "border-warning/30 bg-warning-soft text-warning",
    text: "Ton Google Drive est relié. Ce compte Google sert déjà à un autre compte Tamilya : pour te connecter ici, garde ton e-mail habituel.",
  },
  refus: { tone: "border-warning/30 bg-warning-soft text-warning", text: "Google n'a pas donné l'accès : réessaie et laisse la case Drive cochée." },
  "autre-compte": { tone: "border-danger/30 bg-danger-soft text-danger", text: "Ce lien a expiré ou vient d'un autre compte : relance la connexion." },
  echec: { tone: "border-danger/30 bg-danger-soft text-danger", text: "La connexion n'a pas abouti. Réessaie." },
};

/** Une icône par dossier : on reconnaît le sien d'un coup d'œil. */
const FOLDER_ICONS: Record<DriveFolderId, LucideIcon> = {
  identite: IdCard,
  logement: House,
  sante: HeartPulse,
  travail: BriefcaseBusiness,
  argent: Wallet,
  ecole: GraduationCap,
  vehicule: CarFront,
  factures: ReceiptText,
  autres: Folder,
};

/** Déjà parti une fois chez Google tout seul pour ce Gmail : on ne le refait pas (il a pu refuser). */
const AUTO_KEY = "btm-drive-auto";
/** Le temps de lire où l'on va, et de dire « pas maintenant ». */
const AUTO_DELAY_MS = 1800;

const dateLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mayotte" });

/**
 * Banque de documents : les dossiers de la personne, rangés dans son Google Drive.
 * gmail : adresse Google avec laquelle elle se connecte au site ; son Drive s'y relie
 * tout seul la première fois (un seul clic « Autoriser » chez Google).
 */
export function DocumentsView({ connected, available, gmail, notice }: { connected: boolean; available: boolean; gmail: string | null; notice: string | null }) {
  const [linked, setLinked] = useState(connected);
  const known = notice ? NOTICES[notice] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {known ? (
        <p role="status" className={`shrink-0 rounded-2xl border px-4 py-2.5 text-sm ${known.tone}`}>
          {known.text}
        </p>
      ) : null}
      {linked ? <Bank onLost={() => setLinked(false)} /> : <Connect available={available} gmail={gmail} auto={!notice} />}
    </div>
  );
}

function Benefit({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3 text-left">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-snug text-fg-muted">{text}</span>
      </span>
    </li>
  );
}

function Connect({ available, gmail, auto }: { available: boolean; gmail: string | null; auto: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  // Connecté au site avec Gmail : la première fois, on part tout seul chez Google, sur ce même compte.
  useEffect(() => {
    if (!available || !gmail || !auto) return;
    try {
      const done = JSON.parse(localStorage.getItem(AUTO_KEY) ?? "[]") as string[];
      if (done.includes(gmail)) return;
      localStorage.setItem(AUTO_KEY, JSON.stringify([gmail, ...done].slice(0, 5)));
    } catch {
      // Stockage indisponible : pas de départ automatique, le bouton reste là.
      return;
    }
    const start = window.setTimeout(() => setLeaving(true), 0);
    // Vraie navigation, pas le routeur : la route renvoie chez Google.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    timer.current = window.setTimeout(() => window.location.assign("/api/drive/connect"), AUTO_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [available, gmail, auto]);

  const stay = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setLeaving(false);
  };

  return (
    <section className="m-auto w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-sm sm:p-8">
      <div className="relative mx-auto grid size-16 place-items-center rounded-3xl bg-accent text-accent-fg shadow-lg shadow-accent/25">
        <FolderOpen size={30} strokeWidth={1.8} aria-hidden="true" />
        <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full border-2 border-bg bg-success text-white">
          <Lock size={13} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold tracking-tight">Tes papiers importants, toujours sous la main</h1>
      <p className="mt-1.5 text-center text-sm text-fg-muted">Pièce d&apos;identité, bail, fiches de paie, ordonnances : tout au même endroit, prêt quand on te le demande.</p>

      <ul className="mt-5 space-y-3">
        <Benefit icon={Lock} title="Chez toi, dans ton Google Drive" text="Tes documents restent à toi. BTM ne voit que ce qu'il y range, jamais le reste de ton Drive." />
        <Benefit icon={WandSparkles} title="Rangés tout seuls" text="Dépose un fichier : Tamilya le classe dans le bon dossier." />
        <Benefit icon={FileText} title="Prêts pour tes démarches" text="CAF, préfecture, location : tu retrouves le bon papier en un instant." />
      </ul>

      {!available ? (
        <p className="mt-6 text-center text-sm text-fg-muted">Bientôt disponible.</p>
      ) : leaving ? (
        <div role="status" className="mt-6 rounded-2xl bg-bg-subtle p-4 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Je relie ton Drive à {gmail}
          </p>
          <p className="mt-1 text-xs text-fg-muted">Google va te demander d&apos;autoriser : un seul clic, et c&apos;est fait pour de bon.</p>
          <button type="button" onClick={stay} className="mt-2 text-xs font-medium text-fg-muted underline underline-offset-2 hover:text-fg">
            Pas maintenant
          </button>
        </div>
      ) : (
        <>
          {/* Vrai lien : on quitte le site pour Google. */}
          <a
            href="/api/drive/connect"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition hover:bg-accent-hover active:scale-[0.99]"
          >
            <HardDrive size={18} aria-hidden="true" />
            {gmail ? "Relier mon Google Drive" : "Connecter Google Drive"}
          </a>
          <p className="mt-3 text-center text-xs text-fg-muted">
            {gmail ? (
              <>
                Avec <span className="font-medium text-fg">{gmail}</span>, le compte Google avec lequel tu te connectes : un seul clic chez Google.
              </>
            ) : (
              <>Choisis ton compte Google. Pas de compte Google ? Google t&apos;en crée un gratuitement, même avec une adresse qui n&apos;est pas Gmail.</>
            )}
          </p>
        </>
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
  const [dragging, setDragging] = useState(false);
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

  const add = async (picked: FileList | File[] | null) => {
    const files = Array.from(picked ?? []);
    if (!files.length) return;
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

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (sending === null) void add(Array.from(event.dataTransfer.files));
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
  const usedShare = bank?.limit && bank.used != null ? Math.min(1, bank.used / bank.limit) : null;
  const free = bank?.limit != null && bank.used != null ? Math.max(bank.limit - bank.used, 0) : null;
  const folderLabel = folder ? DRIVE_FOLDERS.find((item) => item.id === folder)?.label : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Compte Google et place libre. */}
      <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-border bg-bg px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <HardDrive size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{bank?.email ?? "Google Drive"}</p>
          {usedShare !== null ? (
            <>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, usedShare * 100)}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                {formatBytes(free!)} libres sur {formatBytes(bank!.limit!)}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-fg-muted">Tes documents sont rangés dans ton Drive, dossier Tamilya.</p>
          )}
        </div>
        <button type="button" onClick={() => void disconnect()} className="shrink-0 rounded-full px-2.5 py-1 text-xs text-fg-muted hover:bg-bg-muted hover:text-fg">
          Déconnecter
        </button>
      </div>

      {/* Déposer : grande zone au doigt, ou glisser-déposer sur ordinateur. */}
      <button
        type="button"
        onClick={() => picker.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        disabled={sending !== null}
        className={`group flex shrink-0 items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-4 text-left transition disabled:cursor-progress ${
          dragging ? "border-accent bg-accent-soft" : "border-accent/40 bg-bg hover:border-accent hover:bg-accent-soft"
        }`}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg shadow-md shadow-accent/25 transition group-hover:scale-105">
          {sending ? <LoaderCircle size={22} className="animate-spin" aria-hidden="true" /> : <CloudUpload size={22} aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{sending ?? (folderLabel ? `Déposer dans « ${folderLabel} »` : "Déposer un document")}</span>
          <span className="block text-xs text-fg-muted">Photo, scan ou PDF{folderLabel ? "" : " : Tamilya le range dans le bon dossier"}</span>
        </span>
      </button>
      <input ref={picker} type="file" multiple hidden onChange={(event) => void add(event.target.files)} />

      {problem ? (
        <p role="alert" className="shrink-0 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {problem}
        </p>
      ) : null}

      {/* Dossiers : une icône chacun, le nombre de documents ; toucher filtre la liste. */}
      <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {DRIVE_FOLDERS.map((item) => {
          const selected = folder === item.id;
          const count = bank?.files.filter((file) => file.folder === item.id).length ?? 0;
          const Icon = FOLDER_ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFolder(selected ? null : item.id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2.5 transition ${
                selected ? "border-accent bg-accent text-accent-fg shadow-md shadow-accent/20" : "border-border bg-bg hover:border-accent/40 hover:bg-bg-muted"
              }`}
            >
              <Icon size={20} aria-hidden="true" className={selected ? "" : count ? "text-accent" : "text-fg-muted"} />
              <span className="w-full truncate text-center text-[11px] font-medium">{item.label}</span>
              <span className={`text-[10px] tabular-nums ${selected ? "text-accent-fg/80" : "text-fg-muted"}`}>{count ? `${count} doc${count > 1 ? "s" : ""}` : "vide"}</span>
            </button>
          );
        })}
      </div>

      <section aria-label="Documents" className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-bg">
        {failed && !bank ? (
          <p className="p-6 text-center text-sm text-fg-muted">Google Drive ne répond pas. Réessaie dans un instant.</p>
        ) : !bank ? (
          <p role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-fg-muted">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Chargement de tes documents…
          </p>
        ) : shown.length === 0 ? (
          <div className="grid h-full min-h-32 place-items-center p-6 text-center">
            <div>
              <FolderOpen size={28} aria-hidden="true" className="mx-auto text-fg-muted" />
              <p className="mt-2 text-sm font-medium">{folderLabel ? `Rien dans « ${folderLabel} » pour l'instant` : "Ton premier document t'attend"}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{folderLabel ? "Dépose un fichier : il ira directement ici." : "Commence par ta pièce d'identité : c'est celle qu'on demande le plus."}</p>
            </div>
          </div>
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
  const Kind = /\.(jpe?g|png|webp|heic|gif)$/i.test(file.name) ? FileImage : FileText;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-muted text-fg-muted">
        <Kind size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {file.link ? (
          <a href={file.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium hover:underline">
            <span className="truncate">{file.name}</span>
            <ExternalLink size={13} aria-hidden="true" className="shrink-0 text-fg-muted" />
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
        className="w-24 shrink-0 rounded-full border border-border bg-bg px-2 py-1 text-xs sm:w-28"
      >
        {DRIVE_FOLDERS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRemove} aria-label={`Supprimer ${file.name}`} className="shrink-0 rounded-full p-2 text-fg-muted hover:bg-danger-soft hover:text-danger">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}
