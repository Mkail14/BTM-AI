"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ComponentType, type ReactNode } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconExternal, IconLock, IconPencil, IconSettings, IconUsers } from "@/components/ui/icons";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import { lostOk } from "@/lib/safe-action";
import type { AdminAccount } from "@/server/services/admin/delegation";
import type { Partner } from "@/server/services/site/partners";
import type { SiteFlags, StatusChange } from "@/server/services/site/settings";
import { SITE_STATUS_LABELS, type SiteStatus } from "@/lib/site/status";
import type { Announcement } from "@/lib/site/announcement-rules";
import { AnnouncementForm } from "./AnnouncementForm";
import {
  addPartnerAction,
  grantAdminAction,
  lockAction,
  removePartnerAction,
  revokeAdminAction,
  saveFlagsAction,
  setPlatformStatusAction,
  unlockAction,
  validatePartnerAction,
} from "./actions";

/** Lance une action serveur, montre son résultat et relit la page (verrou compris). */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await action().catch(lostOk);
      setResult(res);
      if (res.ok) after?.();
      router.refresh();
    });
  return { pending, result, run };
}

/* -------------------------------------------------------------------------- */
/* Verrou : lecture seule, mot de passe redemandé avant de modifier           */
/* -------------------------------------------------------------------------- */

type Section = "site" | "admins";

type Lock = {
  /** Fin des modifications permises (ms), null : verrouillé. */
  until: number | null;
  /** Heure de référence, avancée toutes les 15 s (décompte). */
  now: number;
  editing: Section | null;
  /** Stylo : ouvre la section en modification, après le mot de passe si besoin. */
  edit: (section: Section) => void;
  done: () => void;
  relock: () => void;
};

const LockContext = createContext<Lock | null>(null);

function useLock() {
  const lock = useContext(LockContext);
  if (!lock) throw new Error("useLock hors de ProfileLock");
  return lock;
}

/**
 * Comme les réglages d'un compte Google : tout est en lecture seule ; le stylo
 * redemande le mot de passe, puis les modifications sont permises 10 minutes.
 * Le serveur revérifie à chaque enregistrement (cookie signé).
 */
export function ProfileLock({ until: serverUntil, children }: { until: number | null; children: ReactNode }) {
  const router = useRouter();
  const [until, setUntil] = useState(serverUntil);
  const [seen, setSeen] = useState(serverUntil);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<Section | null>(null);
  const [asking, setAsking] = useState<Section | null>(null);

  // Le serveur fait foi : après chaque action, la page est relue avec son heure de fin.
  if (serverUntil !== seen) {
    setSeen(serverUntil);
    setUntil(serverUntil);
  }

  // Toutes les 15 s : décompte affiché ; passé l'heure de fin, tout se reverrouille.
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [until]);

  const unlocked = until !== null && until > now;
  const lock: Lock = {
    until: unlocked ? until : null,
    now,
    editing: unlocked ? editing : null,
    edit: (section) => (unlocked ? setEditing(section) : setAsking(section)),
    done: () => setEditing(null),
    relock: () => {
      setUntil(null);
      setEditing(null);
      void lockAction().catch(lostOk).then(() => router.refresh());
    },
  };

  return (
    <LockContext.Provider value={lock}>
      {children}
      {asking ? (
        <PasswordDialog
          onClose={() => setAsking(null)}
          onUnlocked={() => {
            setNow(Date.now());
            setUntil(Date.now() + 10 * 60_000);
            setEditing(asking);
            setAsking(null);
            router.refresh();
          }}
        />
      ) : null}
    </LockContext.Provider>
  );
}

/** Fenêtre « Confirme que c'est bien toi », sur fond flouté. */
function PasswordDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="unlock-title"
      className="unlock-dialog scrollbar-none m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <form
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await unlockAction({ password }).catch(lostOk);
            if (res.ok) onUnlocked();
            else {
              setError(res.message);
              setPassword("");
            }
          });
        }}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
          <IconLock width={22} height={22} />
        </span>
        <h2 id="unlock-title" className="mt-4 text-center text-lg font-semibold">
          Confirme que c&apos;est bien toi
        </h2>
        <p className="mt-1 text-center text-sm text-fg-muted">
          Pour protéger l&apos;état du site et les accès admin, tape ton mot de passe. Tu pourras modifier pendant 10 minutes.
        </p>
        <label htmlFor="unlock-password" className={`${labelClass} mt-5`}>
          Mot de passe
        </label>
        <PasswordInput
          id="unlock-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          className={inputClass}
        />
        {error ? (
          <p role="alert" className="booking-shake mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => ref.current?.close()} className={`${secondaryButton} flex-1`}>
            Annuler
          </button>
          <button type="submit" disabled={pending || !password} className={`${primaryButton} flex-1`}>
            {pending ? "Vérification…" : "Confirmer"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const minutesLeft = (until: number, now: number) => Math.max(1, Math.ceil((until - now) / 60_000));

/**
 * Notification en bas à droite, seulement pendant les modifications : ouverte
 * quelques secondes, puis réduite en pastille (temps restant) qu'un clic rouvre.
 * Une clé par déverrouillage la rouvre à chaque fois.
 */
export function LockBar() {
  const { until } = useLock();
  return until ? <LockToast key={until} until={until} /> : null;
}

function LockToast({ until }: { until: number }) {
  const { now, relock } = useLock();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(timer);
  }, [open]);
  const minutes = minutesLeft(until, now);

  return (
    <div role="status" className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50">
      {open ? (
        <div className="lock-toast flex w-72 items-start gap-3 rounded-2xl border border-border bg-bg p-4 text-sm shadow-2xl">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-success-soft text-success">
            <IconLock width={15} height={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Modifications ouvertes</p>
            <p className="text-xs text-fg-muted">Verrouillage auto dans {minutes} min</p>
            <button type="button" onClick={relock} className="mt-2 text-xs font-semibold text-accent hover:underline">
              Verrouiller maintenant
            </button>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Réduire" className="-mt-3 -mr-3 grid size-11 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Modifications ouvertes, encore ${minutes} min`}
          className="lock-toast flex items-center gap-2 rounded-full border border-border bg-bg py-2 pr-3.5 pl-3 text-xs font-medium shadow-xl hover:bg-bg-muted"
        >
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-success" />
          {minutes} min
        </button>
      )}
    </div>
  );
}

/** Stylo en haut à droite d'un bloc ; « Terminé » pendant la modification. */
function EditButton({ section, label }: { section: Section; label: string }) {
  const { editing, edit, done } = useLock();
  if (editing === section) {
    return (
      <button
        type="button"
        onClick={done}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft"
      >
        Terminé
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => edit(section)}
      aria-label={`Modifier : ${label}`}
      title="Modifier"
      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-bg-muted hover:text-fg"
    >
      <IconPencil width={15} height={15} />
    </button>
  );
}

/** Ligne de lecture : libellé à gauche, valeur à droite. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Éléments de mise en page                                                   */
/* -------------------------------------------------------------------------- */

type IconType = ComponentType<{ width?: number; height?: number }>;

/** Colonne de la page : en-tête avec icône, contenu qui prend la hauteur, message d'état en bas. */
function Panel({
  icon: Icon,
  title,
  subtitle,
  aside,
  status,
  editing = false,
  children,
}: {
  icon: IconType;
  title: string;
  subtitle: string;
  aside?: ReactNode;
  status: ActionResult | null;
  /** Lecture ou modification : le contenu change en fondu. */
  editing?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-fg-muted sm:truncate">{subtitle}</p>
        </div>
        {aside}
      </header>
      {/* Défile sans barre visible si le formulaire dépasse (petits écrans). */}
      <div key={editing ? "edit" : "view"} className="profile-swap scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {children}
      </div>
      {status ? (
        <div className="shrink-0 border-t border-border px-5 py-3">
          <ActionStatus result={status} />
        </div>
      ) : null}
    </section>
  );
}

function Badge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      // Téléphone : caché, l'état est redit juste dessous (« État du site »).
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium max-sm:hidden ${
        on ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
      }`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${on ? "bg-warning" : "bg-success"}`} />
      {on ? onLabel : offLabel}
    </span>
  );
}

const labelClass = "block text-xs font-medium text-fg-muted";

/** Interrupteur avec titre et explication courte. */
function Switch({
  label,
  hint,
  checked,
  disabled,
  tone,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  tone: "warning" | "accent" | "success";
  onChange: (next: boolean) => void;
}) {
  const on = tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-accent";
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? on : "bg-bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Site : état, partenaires et mode démo                                      */
/* -------------------------------------------------------------------------- */

const MESSAGE_MAX = 300;

const logFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Indian/Mayotte",
});

const LOG_LABELS: Record<SiteStatus, string> = {
  online: "Remis en ligne",
  maintenance: "Mis en maintenance",
  waiting_partner: "Mis en attente d'un partenaire",
};

/** Historique des changements d'état (auteur, heure, message ou partenaire qui a ouvert le site). */
function StatusHistory({ log }: { log: StatusChange[] | null }) {
  if (log === null) {
    return <p className="text-xs text-fg-muted">Historique indisponible : appliquer la migration 20261202000000_etats_du_site.sql.</p>;
  }
  if (log.length === 0) return <p className="text-xs text-fg-muted">Aucun changement enregistré pour l&apos;instant.</p>;
  return (
    <ol className="space-y-2">
      {log.map((entry) => {
        const detail = entry.partnerName ?? (entry.status !== "online" ? entry.message : "");
        return (
          <li key={entry.at} className="flex items-start gap-2.5 text-xs">
            <span aria-hidden="true" className={`mt-1 size-2 shrink-0 rounded-full ${entry.status === "online" ? "bg-success" : "bg-warning"}`} />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{entry.partnerName ? "Ouvert par un partenaire validé" : LOG_LABELS[entry.status]}</span>
                <span className="text-fg-muted"> · {logFormat.format(new Date(entry.at))}</span>
              </p>
              <p className="truncate text-fg-muted" title={entry.byEmail ?? undefined}>
                {entry.byEmail ?? "compte supprimé"}
                {detail ? ` · « ${detail} »` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_CHOICES: { status: SiteStatus; hint: string }[] = [
  { status: "online", hint: "Tout le monde utilise Tamilya normalement." },
  { status: "maintenance", hint: "Page de travaux, à ouvrir toi-même ensuite." },
  { status: "waiting_partner", hint: "Page d'attente, le site s'ouvre seul au premier partenaire validé." },
];

const CLOSE_CONFIRM = {
  maintenance: {
    title: "Mettre le site en maintenance ?",
    message: "Les visiteurs verront la page de maintenance et ne pourront plus utiliser Tamilya. Les administrateurs gardent l'accès.",
    confirmLabel: "Passer en maintenance",
  },
  waiting_partner: {
    title: "Mettre le site en attente ?",
    message: "Les visiteurs verront la page d'attente et ne pourront plus utiliser Tamilya jusqu'à la validation d'un partenaire. Les administrateurs gardent l'accès.",
    confirmLabel: "Mettre en attente",
  },
};

/** Liste des partenaires : ajout, validation et retrait en mode modification. */
function PartnerList({
  partners,
  status,
  canEdit,
  pending,
  run,
}: {
  partners: Partner[] | null;
  status: SiteStatus;
  canEdit: boolean;
  pending: boolean;
  run: ReturnType<typeof useAction>["run"];
}) {
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");

  const validate = (partner: Partner) => {
    const send = () => run(() => validatePartnerAction({ id: partner.id }));
    if (status !== "waiting_partner") return send();
    void confirmDialog({
      title: `Valider ${partner.name} ?`,
      message: "Le site s'ouvrira à tout le monde tout de suite.",
      confirmLabel: "Valider et ouvrir le site",
    }).then((ok) => ok && send());
  };

  const remove = (partner: Partner) =>
    void confirmDialog({
      title: `Retirer ${partner.name} ?`,
      message: "L'état du site ne change pas.",
      confirmLabel: "Retirer",
      tone: "danger",
    }).then((ok) => ok && run(() => removePartnerAction({ id: partner.id })));

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-xs font-medium text-fg-muted">Partenaires à Mayotte</p>
      {partners === null ? (
        <p className="text-xs text-fg-muted">Liste indisponible : appliquer la migration 20261202000000_etats_du_site.sql.</p>
      ) : partners.length === 0 ? (
        <p className="text-xs text-fg-muted">Aucun partenaire pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-border">
          {partners.map((partner) => (
            <li key={partner.id} className="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{partner.name}</span>
                {partner.activity ? <span className="block truncate text-xs text-fg-muted">{partner.activity}</span> : null}
              </span>
              {partner.validatedAt ? (
                <span className="shrink-0 text-xs font-medium text-success">Validé</span>
              ) : canEdit ? (
                <button type="button" disabled={pending} onClick={() => validate(partner)} className={`${secondaryButton} shrink-0`}>
                  Valider
                </button>
              ) : (
                <span className="shrink-0 text-xs text-fg-muted">À valider</span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(partner)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  Retirer
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit && partners !== null ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addPartnerAction({ name, activity }),
              () => {
                setName("");
                setActivity("");
              },
            );
          }}
        >
          <input aria-label="Nom du partenaire" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Nom du partenaire" className={inputClass} />
          <div className="flex gap-2">
            <input aria-label="Activité (facultatif)" value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={120} placeholder="Activité (facultatif)" className={inputClass} />
            <button type="submit" disabled={pending || name.trim().length < 2} className={`${secondaryButton} shrink-0`}>
              Ajouter
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** État de la plateforme : un seul état enregistré, choisi parmi trois. */
export function SitePanel({
  flags,
  log,
  partners,
  announcement,
}: {
  flags: SiteFlags;
  log: StatusChange[] | null;
  partners: Partner[] | null;
  /** null : migration du bandeau pas appliquée. */
  announcement: Announcement | null;
}) {
  const { pending, result, run } = useAction();
  const { editing } = useLock();
  const [message, setMessage] = useState(flags.maintenanceMessage);
  const unsaved = message.trim() !== flags.maintenanceMessage;
  const closed = flags.status !== "online";
  const hasValidatedPartner = Boolean(partners?.some((p) => p.validatedAt));

  /** Change l'état ; le message tapé et pas encore enregistré part avec. */
  const setStatus = (status: SiteStatus) => {
    if (status === flags.status) return;
    const save = () => run(() => setPlatformStatusAction(unsaved ? { status, maintenanceMessage: message } : { status }));
    if (status === "online") return save();
    void confirmDialog({ ...CLOSE_CONFIRM[status], tone: "danger" }).then((ok) => ok && save());
  };

  const aside = (
    <>
      <Badge on={closed} onLabel={SITE_STATUS_LABELS[flags.status]} offLabel={SITE_STATUS_LABELS.online} />
      <EditButton section="site" label="État de la plateforme" />
    </>
  );

  if (editing !== "site") {
    return (
      <Panel icon={IconSettings} title="État de la plateforme" subtitle="Accès du public, bandeau et démonstration" aside={aside} status={result}>
        <div className="divide-y divide-border rounded-xl border border-border">
          <Row label="État du site">
            <span className={closed ? "text-warning" : "text-success"}>{SITE_STATUS_LABELS[flags.status]}</span>
          </Row>
          <Row label="Message aux visiteurs">
            {flags.maintenanceMessage ? flags.maintenanceMessage : <span className="font-normal text-fg-muted">Aucun</span>}
          </Row>
          <Row label="Bandeau d'accueil">
            {announcement?.enabled ? <span className="text-success">Affiché</span> : <span className="font-normal text-fg-muted">Masqué</span>}
          </Row>
          {announcement?.enabled && announcement.text ? (
            <p className="px-4 py-3 text-sm text-fg-muted">« {announcement.text} »</p>
          ) : null}
          <Row label="Mode démo">{flags.demoMode ? <span className="text-accent">Allumé</span> : "Éteint"}</Row>
        </div>
        {flags.demoMode ? <p className="text-xs text-warning">Mode démo allumé : pense à l&apos;éteindre après la présentation.</p> : null}
        <PartnerList partners={partners} status={flags.status} canEdit={false} pending={pending} run={run} />
        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-xs font-medium text-fg-muted">Derniers changements</p>
          <StatusHistory log={log} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel icon={IconSettings} title="État de la plateforme" subtitle="Accès du public, bandeau et démonstration" aside={aside} status={result} editing>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <fieldset className="space-y-2">
          <legend className={`${labelClass} mb-2`}>État du site</legend>
          {STATUS_CHOICES.map(({ status, hint }) => {
            const locked = status === "waiting_partner" && hasValidatedPartner;
            return (
              <label
                key={status}
                className={`flex items-start gap-3 rounded-lg border p-3 ${flags.status === status ? "border-accent" : "border-border"} ${locked ? "opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="site-status"
                  checked={flags.status === status}
                  disabled={pending || locked}
                  onChange={() => setStatus(status)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{SITE_STATUS_LABELS[status]}</span>
                  <span className="block text-xs text-fg-muted">{locked ? "Impossible : un partenaire est déjà validé." : hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveFlagsAction({ maintenanceMessage: message }));
          }}
        >
          <label htmlFor="maintenance-message" className={labelClass}>
            Message aux visiteurs <span className="font-normal">(facultatif)</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="maintenance-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MESSAGE_MAX}
              placeholder="Retour prévu à 14 h"
              className={inputClass}
            />
            <button type="submit" disabled={pending || !unsaved} className={`${secondaryButton} shrink-0`}>
              Enregistrer
            </button>
          </div>
        </form>
        {closed ? (
          <a
            href="/maintenance"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Voir la page des visiteurs <IconExternal width={12} height={12} />
          </a>
        ) : null}
      </div>

      <PartnerList partners={partners} status={flags.status} canEdit pending={pending} run={run} />

      {announcement ? (
        <AnnouncementForm saved={announcement} />
      ) : (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-xs">Bandeau d&apos;accueil indisponible : migration 20261121000000_bandeau_accueil.sql à appliquer.</p>
      )}

      <div className="space-y-3 rounded-xl border border-border p-4">
        <Switch
          label="Mode démo"
          hint="Commande de repas (Jéjé Livraison) et solde fictif de 150 €, visibles des administrateurs seulement."
          checked={flags.demoMode}
          disabled={pending}
          tone="accent"
          onChange={(demoMode) => run(() => saveFlagsAction({ demoMode }))}
        />
        {flags.demoMode ? <p className="text-xs text-warning">Allumé : pense à l&apos;éteindre après la présentation.</p> : null}
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-3 text-xs font-medium text-fg-muted">Derniers changements</p>
        <StatusHistory log={log} />
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Délégation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Liste des administrateurs. L'administrateur principal ajoute et retire les
 * délégués ; un délégué voit seulement les adresses (manage false).
 */
export function Delegation({ admins, selfId, manage }: { admins: AdminAccount[] | null; selfId: string; manage: boolean }) {
  const { pending, result, run } = useAction();
  const { editing } = useLock();
  const canEdit = manage && editing === "admins";
  const [email, setEmail] = useState("");
  // L'administrateur principal (toi d'abord) en haut, puis les délégués par e-mail.
  const sorted = admins
    ? [...admins].sort(
        (a, b) =>
          Number(a.secondary) - Number(b.secondary) ||
          Number(b.id === selfId) - Number(a.id === selfId) ||
          (a.email ?? "").localeCompare(b.email ?? ""),
      )
    : null;

  return (
    <Panel
      icon={IconUsers}
      title="Administrateurs"
      subtitle={manage ? "Délégués : tout l'espace admin sauf l'état du site et cette liste" : "Les comptes qui ont accès à l'espace admin"}
      editing={canEdit}
      aside={
        <>
          {admins ? <span className="text-xs tabular-nums text-fg-muted">{admins.length}</span> : null}
          {manage ? <EditButton section="admins" label="Administrateurs" /> : null}
        </>
      }
      status={result}
    >
      {canEdit ? (
        <form
          className="shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => grantAdminAction({ email }),
              () => setEmail(""),
            );
          }}
        >
          <label htmlFor="delegate-email" className={labelClass}>
            Ajouter un délégué <span className="font-normal">(compte déjà inscrit)</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="delegate-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              placeholder="adresse@exemple.fr"
              className={inputClass}
            />
            <button type="submit" disabled={pending || !email.trim()} className={`${primaryButton} shrink-0`}>
              Ajouter
            </button>
          </div>
        </form>
      ) : null}

      {sorted === null ? (
        <p className="text-sm text-fg-muted">Liste des administrateurs indisponible.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {sorted.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold uppercase ${
                  a.secondary ? "bg-bg-muted text-fg-muted" : "bg-accent text-accent-fg"
                }`}
              >
                {(a.email ?? "?").charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {a.email ?? "Sans e-mail"}
                  {a.id === selfId ? <span className="font-normal text-fg-muted"> (toi)</span> : null}
                </span>
                <span className="text-xs text-fg-muted">{a.secondary ? "Délégué" : "Principal"}</span>
              </span>
              {a.secondary && canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                  onClick={() => {
                    void confirmDialog({
                      title: "Retirer ce délégué ?",
                      message: `${a.email ?? "Ce compte"} perdra ses droits d'administration (au plus tard dans une heure).`,
                      confirmLabel: "Retirer",
                      tone: "danger",
                    }).then((ok) => ok && run(() => revokeAdminAction({ userId: a.id })));
                  }}
                >
                  Retirer
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
