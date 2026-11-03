"use client";

import { useId, useState } from "react";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { addressFieldErrors, kindOf, MAX_SAVED_ADDRESSES, SAVED_ADDRESS_KINDS, type SavedAddress, type SavedAddressKind } from "@/lib/address";
import { deleteSavedAddressAction, saveAddressAction, saveSavedAddressAction } from "./actions";
import { Feedback, INPUT_CLASS, PRIMARY, SECONDARY, useSave } from "./ContactForms";

/** Ce qui est en cours de modification : la maison, une adresse du carnet, ou une nouvelle. */
type Editing = { what: "home" } | { what: "saved"; id: string } | { what: "new" } | null;

/**
 * Carnet d'adresses : la maison (adresse du compte, utilisée par défaut) puis
 * le travail, les amis, la famille… Toutes sont proposées à chaque livraison.
 * Une seule adresse s'ouvre en modification à la fois.
 */
export function AddressBook({ home, saved }: { home: AddressDraft | null; saved: SavedAddress[] | null }) {
  const [editing, setEditing] = useState<Editing>(home ? null : { what: "home" });
  const { pending, state, run } = useSave();
  const full = (saved?.length ?? 0) >= MAX_SAVED_ADDRESSES;
  const close = () => setEditing(null);

  return (
    <div className="space-y-3">
      {/* Maison */}
      {editing?.what === "home" ? (
        <AddressForm
          title="🏠 Maison"
          hint={home ? null : "Ajoute ton adresse : tes livraisons arriveront au bon endroit et Tamilya saura ce qui est près de chez toi."}
          initial={home ?? EMPTY_ADDRESS}
          onCancel={home ? close : undefined}
          onSave={(address, done) => run(() => saveAddressAction(address), () => (close(), done()))}
          pending={pending}
          state={state}
        />
      ) : home ? (
        <AddressRow emoji="🏠" title="Maison" badge="Par défaut" address={home} onEdit={() => setEditing({ what: "home" })} />
      ) : null}

      {/* Carnet */}
      {saved === null ? (
        <p className="rounded-2xl bg-bg-subtle px-4 py-3 text-sm text-fg-muted">Le carnet d&apos;adresses arrive bientôt.</p>
      ) : (
        saved.map((a) =>
          editing?.what === "saved" && editing.id === a.id ? (
            <AddressForm
              key={a.id}
              title="Modifier l'adresse"
              initial={a}
              named={{ kind: a.kind, label: a.label }}
              onCancel={close}
              onDelete={async () => {
                const ok = await confirmDialog({
                  title: `Supprimer « ${a.label} » ?`,
                  message: "Cette adresse ne sera plus proposée pour tes livraisons.",
                  confirmLabel: "Supprimer",
                  tone: "danger",
                });
                if (ok) run(() => deleteSavedAddressAction(a.id), close);
              }}
              onSave={(address, done, named) => run(() => saveSavedAddressAction({ ...address, ...named }, a.id), () => (close(), done()))}
              pending={pending}
              state={state}
            />
          ) : (
            <AddressRow
              key={a.id}
              emoji={kindOf(a.kind).emoji}
              title={a.label}
              badge={kindOf(a.kind).label}
              address={a}
              onEdit={() => setEditing({ what: "saved", id: a.id })}
            />
          ),
        )
      )}

      {editing?.what === "new" ? (
        <AddressForm
          title="Nouvelle adresse"
          initial={EMPTY_ADDRESS}
          named={{ kind: "travail", label: "" }}
          onCancel={close}
          onSave={(address, done, named) => run(() => saveSavedAddressAction({ ...address, ...named }), () => (close(), done()))}
          pending={pending}
          state={state}
        />
      ) : saved !== null && home ? (
        <button
          type="button"
          disabled={full || editing !== null}
          onClick={() => setEditing({ what: "new" })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-4 text-sm font-medium text-fg-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          {full ? `Carnet plein (${MAX_SAVED_ADDRESSES} adresses)` : "Ajouter une adresse"}
        </button>
      ) : null}

      {editing === null ? <Feedback state={state} /> : null}
    </div>
  );
}

function AddressRow({
  emoji,
  title,
  badge,
  address,
  onEdit,
}: {
  emoji: string;
  title: string;
  badge: string;
  address: AddressDraft;
  onEdit: () => void;
}) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-border bg-bg p-4 transition hover:border-fg-muted/40">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-bg-subtle text-xl">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">{badge}</span>
        </p>
        <p className="truncate text-sm text-fg-muted">
          {address.line} · {address.commune}
          {address.geo ? " · 📍 GPS" : ""}
        </p>
      </div>
      <button type="button" onClick={onEdit} className={SECONDARY}>
        Modifier
      </button>
    </div>
  );
}

type Named = { kind: SavedAddressKind; label: string };

function AddressForm({
  title,
  hint = null,
  initial,
  named,
  onCancel,
  onDelete,
  onSave,
  pending,
  state,
}: {
  title: string;
  hint?: string | null;
  initial: AddressDraft;
  /** Type et nom : seulement pour les adresses du carnet (pas la maison). */
  named?: Named;
  onCancel?: () => void;
  onDelete?: () => void;
  onSave: (address: AddressDraft, done: () => void, named: Named) => void;
  pending: boolean;
  state: ReturnType<typeof useSave>["state"];
}) {
  const id = useId();
  const [draft, setDraft] = useState<AddressDraft>({ commune: initial.commune, line: initial.line, geo: initial.geo });
  const [kind, setKind] = useState<SavedAddressKind>(named?.kind ?? "travail");
  const [label, setLabel] = useState(named?.label ?? "");
  const [tried, setTried] = useState(false);
  const errors = addressFieldErrors(draft);
  const labelError = named && !label.trim() ? "Donne un nom à cette adresse." : null;

  return (
    <form
      noValidate
      className="profile-swap space-y-4 rounded-2xl border border-accent/40 bg-bg p-4 shadow-sm ring-4 ring-accent-soft"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (errors.commune || errors.line || labelError) return;
        onSave(draft, () => setTried(false), { kind, label });
      }}
    >
      <p className="font-medium">{title}</p>
      {hint ? <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{hint}</p> : null}

      {named ? (
        <>
          <fieldset>
            <legend className="text-sm font-medium">Type</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SAVED_ADDRESS_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    // Nom proposé tant que la personne n'en a pas écrit un.
                    if (!label || SAVED_ADDRESS_KINDS.some((x) => x.label === label)) setLabel(k.id === "ami" ? "" : k.label);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                    kind === k.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-bg-muted"
                  }`}
                >
                  <span aria-hidden="true">{k.emoji}</span> {k.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${id}-label`} className="block text-sm font-medium">
              Nom
            </label>
            <input
              id={`${id}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder={kind === "ami" ? "Chez Fatima" : kind === "famille" ? "Chez maman" : "Bureau"}
              aria-invalid={tried && labelError ? true : undefined}
              className={`${INPUT_CLASS} ${tried && labelError ? "border-danger" : ""}`}
            />
            {tried && labelError ? <p className="mt-1 text-xs text-danger">{labelError}</p> : null}
          </div>
        </>
      ) : null}

      <AddressFields
        id={`${id}-address`}
        value={draft}
        onChange={setDraft}
        errors={tried ? errors : { commune: null, line: null }}
        inputClass={INPUT_CLASS}
        gps
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {onCancel ? (
          <button type="button" disabled={pending} onClick={onCancel} className={SECONDARY}>
            Annuler
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" disabled={pending} onClick={onDelete} className="ml-auto text-sm font-medium text-danger hover:underline">
            Supprimer
          </button>
        ) : null}
      </div>
      {state?.status === "error" ? <Feedback state={state} /> : null}
    </form>
  );
}
