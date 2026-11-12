"use client";

import {
  BriefcaseBusiness,
  CarFront,
  CloudUpload,
  Eye,
  File as FileIcon,
  FileImage,
  FileText,
  Files,
  Folder,
  FolderOpen,
  GraduationCap,
  HardDrive,
  HeartPulse,
  House,
  IdCard,
  LoaderCircle,
  Lock,
  Plus,
  ReceiptText,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { DRIVE_FOLDERS, formatBytes, guessDriveFolder, type DriveFile, type DriveFolderId } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";
import { contentUrl, DocumentViewer, viewKind } from "./DocumentViewer";

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

type Kind = ReturnType<typeof viewKind>;

/** Teinte et icône de la vignette selon le type de fichier. */
const KIND_STYLE: Record<Kind, { tone: string; icon: LucideIcon; label: (file: DriveFile) => string }> = {
  image: { tone: "bg-accent-soft text-accent", icon: FileImage, label: () => "PHOTO" },
  pdf: { tone: "bg-danger-soft text-danger", icon: FileText, label: () => "PDF" },
  other: { tone: "bg-bg-muted text-fg-muted", icon: FileIcon, label: (file) => file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1].toUpperCase() ?? "FICHIER" },
};

/** Photos jusqu'à 2 Mo montrées en vignette ; au-delà, l'icône (connexion mobile). */
const THUMB_MAX_BYTES = 2 * 1024 * 1024;

function Bank({ onLost }: { onLost: () => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [failed, setFailed] = useState(false);
  const [folder, setFolder] = useState<DriveFolderId | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Visionneuse : les documents de la liste au moment de l'ouverture, et celui affiché. */
  const [viewer, setViewer] = useState<{ ids: string[]; id: string } | null>(null);
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
  const countOf = (id: DriveFolderId | null) => (id === null ? (bank?.files.length ?? 0) : (bank?.files.filter((file) => file.folder === id).length ?? 0));

  // Un document supprimé sort de la visionneuse ; on montre alors son voisin, et s'il n'en reste aucun, elle se ferme.
  const viewed = viewer && bank ? viewer.ids.map((id) => bank.files.find((file) => file.id === id)).filter((file): file is DriveFile => Boolean(file)) : [];
  const found = viewer ? viewed.findIndex((file) => file.id === viewer.id) : -1;
  const viewedIndex = viewer && viewed.length ? (found === -1 ? Math.min(viewer.ids.indexOf(viewer.id), viewed.length - 1) : found) : -1;

  const folders: { id: DriveFolderId | null; label: string; icon: LucideIcon }[] = [
    { id: null, label: "Tous mes documents", icon: Files },
    ...DRIVE_FOLDERS.map((item) => ({ id: item.id, label: item.label, icon: FOLDER_ICONS[item.id] })),
  ];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col gap-4 md:flex-row"
      onDragOver={(event) => {
        event.preventDefault();
        if (sending === null) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
    >
      {/* Ordinateur : les dossiers à gauche, le Drive en bas. */}
      <aside aria-label="Dossiers" className="hidden w-60 shrink-0 flex-col rounded-3xl border border-border bg-bg p-2 md:flex">
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {folders.map((item) => {
            const selected = folder === item.id;
            const count = countOf(item.id);
            return (
              <button
                key={item.id ?? "tous"}
                type="button"
                aria-pressed={selected}
                onClick={() => setFolder(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition ${
                  selected ? "bg-accent-soft font-semibold text-accent" : "text-fg hover:bg-bg-muted"
                } ${item.id === null ? "mb-1.5" : ""}`}
              >
                <item.icon size={18} aria-hidden="true" className={selected ? "" : "text-fg-muted"} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count ? <span className={`text-xs tabular-nums ${selected ? "" : "text-fg-muted"}`}>{count}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-2 rounded-2xl bg-bg-subtle p-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <HardDrive size={14} aria-hidden="true" className="shrink-0 text-fg-muted" />
            <span className="truncate">{bank?.email ?? "Google Drive"}</span>
          </p>
          {usedShare !== null ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, usedShare * 100)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-fg-muted">
                {formatBytes(free!)} libres sur {formatBytes(bank!.limit!)}
              </p>
            </>
          ) : null}
          <button type="button" onClick={() => void disconnect()} className="mt-2 text-[11px] font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
            Déconnecter Google Drive
          </button>
        </div>
      </aside>

      <section aria-label="Documents" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-bg">
        <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{folderLabel ?? "Mes documents"}</h1>
            <p className="text-xs text-fg-muted">
              {!bank ? "Ton Google Drive, dossier Tamilya" : shown.length ? `${shown.length} document${shown.length > 1 ? "s" : ""}` : "Aucun document"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={sending !== null}
            className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-md shadow-accent/20 transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-progress disabled:opacity-80"
          >
            {sending ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {sending ?? "Ajouter"}
          </button>
          <input ref={picker} type="file" multiple hidden onChange={(event) => void add(event.target.files)} />
        </div>

        {/* Téléphone : les dossiers en pastilles qui défilent. */}
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:hidden">
          {folders.map((item) => {
            const selected = folder === item.id;
            const count = countOf(item.id);
            return (
              <button
                key={item.id ?? "tous"}
                type="button"
                aria-pressed={selected}
                onClick={() => setFolder(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg text-fg hover:bg-bg-muted"
                }`}
              >
                <item.icon size={14} aria-hidden="true" />
                {item.id === null ? "Tous" : item.label}
                {count ? <span className={`tabular-nums ${selected ? "text-accent-fg/80" : "text-fg-muted"}`}>{count}</span> : null}
              </button>
            );
          })}
        </div>

        {problem ? (
          <p role="alert" className="mx-4 mb-3 shrink-0 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger sm:mx-5">
            {problem}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-bg-subtle/60 p-3 sm:p-4">
          {failed && !bank ? (
            <p className="p-6 text-center text-sm text-fg-muted">Google Drive ne répond pas. Réessaie dans un instant.</p>
          ) : !bank ? (
            <p role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-fg-muted">
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Chargement de tes documents…
            </p>
          ) : shown.length === 0 ? (
            <div className="grid h-full min-h-48 place-items-center p-6 text-center">
              <div className="max-w-xs">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <CloudUpload size={26} aria-hidden="true" />
                </span>
                <p className="mt-3 font-semibold">{folderLabel ? `Rien dans « ${folderLabel} »` : "Ton premier document t'attend"}</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {folderLabel ? "Ajoute un fichier : il ira directement ici." : "Ajoute une photo, un scan ou un PDF : Tamilya le range dans le bon dossier."}
                </p>
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((file) => (
                <li key={file.id}>
                  <FileCard file={file} showFolder={folder === null} onOpen={() => setViewer({ ids: shown.map((item) => item.id), id: file.id })} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Téléphone : le Drive relié, en bas. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-fg-muted md:hidden">
          <HardDrive size={13} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {bank?.email ?? "Google Drive"}
            {free !== null ? ` · ${formatBytes(free)} libres` : ""}
          </span>
          <button type="button" onClick={() => void disconnect()} className="shrink-0 font-medium hover:text-fg">
            Déconnecter
          </button>
        </div>
      </section>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/90">
          <p className="flex items-center gap-2 font-semibold text-accent">
            <CloudUpload size={22} aria-hidden="true" /> Lâche ici{folderLabel ? ` : il ira dans « ${folderLabel} »` : " : Tamilya le range"}
          </p>
        </div>
      ) : null}

      {viewer && viewedIndex !== -1 ? (
        <DocumentViewer
          files={viewed}
          index={viewedIndex}
          onIndex={(index) => setViewer({ ids: viewer.ids, id: viewed[index].id })}
          onClose={() => setViewer(null)}
          onMove={(file, target) => void move(file, target)}
          onRemove={(file) => void remove(file)}
        />
      ) : null}
    </div>
  );
}

function FileCard({ file, showFolder, onOpen }: { file: DriveFile; showFolder: boolean; onOpen: () => void }) {
  const kind = viewKind(file);
  const style = KIND_STYLE[kind];
  const [thumb, setThumb] = useState(kind === "image" && file.size !== null && file.size <= THUMB_MAX_BYTES);
  const details = [file.modifiedAt ? dateLabel.format(new Date(file.modifiedAt)) : null, file.size !== null ? formatBytes(file.size) : null].filter(Boolean).join(" · ");
  const folderLabel = DRIVE_FOLDERS.find((item) => item.id === file.folder)?.label;
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-bg text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className={`relative grid aspect-[4/3] w-full place-items-center overflow-hidden ${style.tone}`}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par notre route
          <img src={contentUrl(file)} alt="" loading="lazy" onError={() => setThumb(false)} className="size-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <span className="flex flex-col items-center gap-1.5">
            <Icon size={34} strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[10px] font-bold tracking-wider">{style.label(file)}</span>
          </span>
        )}
        <span className="absolute inset-0 hidden place-items-center bg-black/25 opacity-0 transition group-hover:opacity-100 sm:grid">
          <span className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-fg shadow">
            <Eye size={14} aria-hidden="true" /> Voir
          </span>
        </span>
      </span>
      <span className="block min-w-0 p-3">
        <span className="line-clamp-2 text-sm leading-snug font-medium break-words">{file.name}</span>
        <span className="mt-1 block truncate text-[11px] text-fg-muted">
          {showFolder && folderLabel ? `${folderLabel} · ` : ""}
          {details}
        </span>
      </span>
    </button>
  );
}
