"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ComponentType, type ReactNode } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconExternal, IconLock, IconPencil, IconSettings, IconUsers, IconWallet } from "@/components/ui/icons";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { AdminAccount } from "@/lib/admin/delegation";
import { formatIban, isValidBic, isValidIban, normalizeIban } from "@/lib/site/iban";
import type { BankDetails, SiteFlags } from "@/lib/site/settings";
import { grantAdminAction, lockAction, revokeAdminAction, saveBankAction, saveFlagsAction, unlockAction } from "./actions";

/** Lance une action serveur, montre son résultat et relit la page (verrou compris). */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) after?.();
      router.refresh();
    });
  return { pending, result, run };
}

/* -------------------------------------------------------------------------- */
/* Verrou : lecture seule, mot de passe redemandé avant de modifier           */
/* -------------------------------------------------------------------------- */

type Section = "site" | "bank" | "admins";

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
      void lockAction().then(() => router.refresh());
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
            const res = await unlockAction({ password });
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
          Pour protéger le RIB et les accès de GROUPE BTM, tape ton mot de passe. Tu pourras modifier pendant 10 minutes.
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

/** Bandeau affiché seulement pendant les modifications (décompte et bouton pour reverrouiller). */
export function LockBar() {
  const { until, now, relock } = useLock();
  if (!until) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-success/30 bg-success-soft px-4 py-2.5 text-sm">
      <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-success" />
      <span className="flex-1 font-medium text-success">Modifications ouvertes · encore {minutesLeft(until, now)} min</span>
      <button type="button" onClick={relock} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium hover:bg-bg/60">
        <IconLock width={14} height={14} /> Verrouiller
      </button>
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

/** Copie un texte et affiche « copié » deux secondes. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    });
  return { copied, copy };
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
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="truncate text-xs text-fg-muted">{subtitle}</p>
        </div>
        {aside}
      </header>
      {/* Défile sans barre visible si le formulaire dépasse (petits écrans). */}
      <div key={editing ? "edit" : "view"} className="profile-swap scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
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
  tone: "warning" | "accent";
  onChange: (next: boolean) => void;
}) {
  const on = tone === "warning" ? "bg-warning" : "bg-accent";
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
/* Site : maintenance et mode démo                                            */
/* -------------------------------------------------------------------------- */

const MESSAGE_MAX = 300;

export function SitePanel({ flags }: { flags: SiteFlags }) {
  const { pending, result, run } = useAction();
  const { editing } = useLock();
  const [message, setMessage] = useState(flags.maintenanceMessage);
  const unsaved = message.trim() !== flags.maintenanceMessage;

  const aside = (
    <>
      <Badge on={flags.maintenance} onLabel="Fermé" offLabel="En ligne" />
      <EditButton section="site" label="Site" />
    </>
  );

  if (editing !== "site") {
    return (
      <Panel icon={IconSettings} title="Site" subtitle="Accès du public et démonstration" aside={aside} status={result}>
        <div className="divide-y divide-border rounded-xl border border-border">
          <Row label="Maintenance">{flags.maintenance ? <span className="text-warning">Activée</span> : "Désactivée"}</Row>
          <Row label="Message aux visiteurs">
            {flags.maintenanceMessage ? flags.maintenanceMessage : <span className="font-normal text-fg-muted">Aucun</span>}
          </Row>
          <Row label="Mode démo">{flags.demoMode ? <span className="text-accent">Allumé</span> : "Éteint"}</Row>
        </div>
        {flags.demoMode ? <p className="text-xs text-warning">Mode démo allumé : pense à l&apos;éteindre après la présentation.</p> : null}
      </Panel>
    );
  }

  return (
    <Panel icon={IconSettings} title="Site" subtitle="Accès du public et démonstration" aside={aside} status={result} editing>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <Switch
          label="Maintenance"
          hint="Les visiteurs voient une page d'attente. Les administrateurs gardent l'accès."
          checked={flags.maintenance}
          disabled={pending}
          tone="warning"
          onChange={(maintenance) => {
            if (maintenance && !window.confirm("Mettre le site en maintenance ? Les visiteurs ne pourront plus l'utiliser.")) return;
            // Le message tapé et pas encore enregistré part avec l'interrupteur.
            run(() => saveFlagsAction(unsaved ? { maintenance, maintenanceMessage: message } : { maintenance }));
          }}
        />
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
        {flags.maintenance ? (
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
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* RIB                                                                        */
/* -------------------------------------------------------------------------- */

/** Aide sous le champ IBAN : rien tant qu'il est trop court, puis valide ou non. */
function ibanCheck(value: string): { ok: boolean; text: string } | null {
  const iban = normalizeIban(value);
  if (iban.length < 15) return null;
  return isValidIban(iban)
    ? { ok: true, text: "IBAN valide" }
    : { ok: false, text: "IBAN incorrect : un chiffre est sans doute mal tapé." };
}

function CopyButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Copier ${label}`}
      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
    >
      {done ? "Copié ✓" : "Copier"}
    </button>
  );
}

export function BankForm({ bank }: { bank: BankDetails }) {
  const { pending, result, run } = useAction();
  const { copied, copy } = useCopy();
  const lock = useLock();
  const editing = lock.editing === "bank";
  const [draft, setDraft] = useState(bank);
  const set = (key: keyof BankDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  const panel = (children: ReactNode) => (
    <Panel
      icon={IconWallet}
      title="Coordonnées bancaires"
      subtitle="RIB de GROUPE BTM"
      editing={editing}
      aside={
        <>
          {bank.iban ? null : (
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">À compléter</span>
          )}
          <EditButton section="bank" label="Coordonnées bancaires" />
        </>
      }
      status={result}
    >
      {children}
    </Panel>
  );

  if (!editing && !bank.iban) {
    return panel(
      <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border p-6 text-center">
        <div>
          <p className="font-medium">Aucun RIB enregistré</p>
          <p className="mt-1 text-sm text-fg-muted">Clique sur le stylo pour l&apos;ajouter.</p>
        </div>
      </div>,
    );
  }

  if (!editing) {
    const full = [
      `Titulaire : ${bank.holder}`,
      bank.bankName && `Banque : ${bank.bankName}`,
      `IBAN : ${formatIban(bank.iban)}`,
      bank.bic && `BIC : ${bank.bic}`,
    ]
      .filter(Boolean)
      .join("\n");
    return panel(
      <>
        <div className="rounded-xl bg-bg-subtle p-4">
          <p className={labelClass}>Titulaire</p>
          <p className="mt-0.5 font-semibold">{bank.holder}</p>
          {bank.bankName ? <p className="text-sm text-fg-muted">{bank.bankName}</p> : null}

          <div className="mt-4 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className={labelClass}>IBAN</p>
              <p className="mt-0.5 font-mono text-sm font-medium break-all">{formatIban(bank.iban)}</p>
            </div>
            <CopyButton label="l'IBAN" done={copied === "iban"} onClick={() => copy("iban", normalizeIban(bank.iban))} />
          </div>

          {bank.bic ? (
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className={labelClass}>BIC</p>
                <p className="mt-0.5 font-mono text-sm font-medium">{bank.bic}</p>
              </div>
              <CopyButton label="le BIC" done={copied === "bic"} onClick={() => copy("bic", bank.bic)} />
            </div>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button type="button" className={primaryButton} onClick={() => copy("all", full)}>
            {copied === "all" ? "RIB copié ✓" : "Copier le RIB"}
          </button>
        </div>
      </>,
    );
  }

  const iban = ibanCheck(draft.iban);
  const bicWrong = draft.bic.trim().length >= 8 && !isValidBic(draft.bic);
  return panel(
    <form
      className="flex flex-1 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveBankAction(draft), lock.done);
      }}
    >
      <div>
        <label htmlFor="bank-holder" className={labelClass}>
          Titulaire du compte
        </label>
        <input
          id="bank-holder"
          value={draft.holder}
          onChange={set("holder")}
          maxLength={120}
          required
          className={`${inputClass} mt-1.5`}
          placeholder="GROUPE BTM"
        />
      </div>
      <div>
        <label htmlFor="bank-iban" className={labelClass}>
          IBAN
        </label>
        <input
          id="bank-iban"
          value={draft.iban}
          onChange={set("iban")}
          maxLength={42}
          required
          autoComplete="off"
          spellCheck={false}
          aria-invalid={iban ? !iban.ok : undefined}
          aria-describedby="bank-iban-check"
          className={`${inputClass} mt-1.5 font-mono uppercase`}
          placeholder="FR76 …"
        />
        <p id="bank-iban-check" aria-live="polite" className={`mt-1 min-h-4 text-xs ${iban?.ok ? "text-success" : "text-danger"}`}>
          {iban?.text}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bank-name" className={labelClass}>
            Banque
          </label>
          <input id="bank-name" value={draft.bankName} onChange={set("bankName")} maxLength={120} className={`${inputClass} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="bank-bic" className={labelClass}>
            BIC
          </label>
          <input
            id="bank-bic"
            value={draft.bic}
            onChange={set("bic")}
            maxLength={11}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={bicWrong || undefined}
            className={`${inputClass} mt-1.5 font-mono uppercase`}
            placeholder="BNPAFRPPXXX"
          />
          {bicWrong ? <p className="mt-1 text-xs text-danger">BIC incorrect.</p> : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <button type="submit" disabled={pending || iban?.ok === false || bicWrong} className={primaryButton}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            setDraft(bank);
            lock.done();
          }}
        >
          Annuler
        </button>
      </div>
    </form>,
  );
}

/* -------------------------------------------------------------------------- */
/* Délégation                                                                 */
/* -------------------------------------------------------------------------- */

export function Delegation({ admins, selfId }: { admins: AdminAccount[] | null; selfId: string }) {
  const { pending, result, run } = useAction();
  const { editing } = useLock();
  const canEdit = editing === "admins";
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
      subtitle="Délégués : tout le site sauf cette page"
      editing={canEdit}
      aside={
        <>
          {admins ? <span className="text-xs tabular-nums text-fg-muted">{admins.length}</span> : null}
          <EditButton section="admins" label="Administrateurs" />
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
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border">
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
                    if (window.confirm(`Retirer les droits d'administration de ${a.email ?? "ce compte"} ?`))
                      run(() => revokeAdminAction({ userId: a.id }));
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
