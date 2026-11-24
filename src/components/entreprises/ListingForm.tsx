"use client";

import { useState, useTransition, type ReactNode } from "react";
import { lostOk } from "@/lib/safe-action";
import { CATEGORIES, COMMUNES, DAYS, LANGUAGES, PAYMENTS, STATUSES, type ListingFormValues, type ListingStatus } from "@/lib/entreprises/listing";

/**
 * Formulaire d'une fiche de l'annuaire, en cinq onglets pour tenir dans l'écran.
 * Le même pour l'équipe GROUPE BTM (avec SIRET, publication et vérification) et pour
 * l'entreprise elle-même.
 */



type Result = { ok: boolean; message: string };

const TABS = [
  { id: "essentiel", label: "Infos" },
  { id: "lieu", label: "Où" },
  { id: "contact", label: "Contact" },
  { id: "horaires", label: "Horaires" },
  { id: "pratique", label: "Pratique" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const input = "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
    </label>
  );
}

/** Une ligne par élément. */
const lines = (text: string) => text.split(/\n|,/).map((v) => v.trim());
const joined = (items: string[]) => items.join("\n");

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const choices: [boolean | null, string][] = [
    [true, "Oui"],
    [false, "Non"],
    [null, "Je ne sais pas"],
  ];
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {choices.map(([v, text]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`rounded-full border px-3 py-1 text-sm ${value === v ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== option) : [...value, option])}
              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ListingForm({
  initial,
  team = false,
  save,
  saveLabel = "Enregistrer",
  footer,
}: {
  initial: ListingFormValues;
  /** Équipe GROUPE BTM : SIRET, publication et « vérifiée aujourd'hui ». */
  team?: boolean;
  save: (values: ListingFormValues & { verifiedToday?: boolean }) => Promise<Result>;
  saveLabel?: string;
  footer?: ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [tab, setTab] = useState<TabId>("essentiel");
  const [verifiedToday, setVerifiedToday] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, startSaving] = useTransition();
  // Textes des listes, gardés tels que tapés (virgules et lignes vides comprises).
  const [texts, setTexts] = useState({ aliases: joined(initial.aliases), services: joined(initial.services), phones: joined(initial.phones) });

  const set = <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setResult(null);
  };
  const setText = (key: keyof typeof texts, text: string) => {
    setTexts((t) => ({ ...t, [key]: text }));
    set(key, lines(text).filter(Boolean));
  };
  const text = (key: "category" | "description" | "village" | "address" | "landmark" | "whatsapp" | "email" | "website" | "facebook" | "instagram" | "hoursNote" | "openedOn" | "siret") => ({
    value: values[key] ?? "",
    onChange: (e: { target: { value: string } }) => set(key, e.target.value || null),
  });
  const number = (key: "latitude" | "longitude") => ({
    value: values[key] ?? "",
    onChange: (e: { target: { value: string } }) => {
      const n = Number(e.target.value.replace(",", "."));
      set(key, e.target.value.trim() && Number.isFinite(n) ? n : null);
    },
  });

  function submit() {
    startSaving(async () => {
      const outcome = await save({ ...values, ...(team && { verifiedToday }) }).catch(lostOk);
      setResult(outcome);
      if (outcome.ok) setVerifiedToday(false);
    });
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div role="tablist" aria-label="Parties de la fiche" className="flex flex-wrap gap-x-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative shrink-0 px-2.5 py-2 text-sm whitespace-nowrap ${
              tab === t.id ? "font-medium text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="grid gap-4 sm:grid-cols-2">
        {tab === "essentiel" ? (
          <>
            <Row label="Nom de l'entreprise">
              <input required minLength={2} maxLength={120} className={input} value={values.name} onChange={(e) => set("name", e.target.value)} />
            </Row>
            <Row label="Autres noms" hint="Enseigne, sigle, nom que les gens disent. Un par ligne.">
              <textarea rows={2} className={input} value={texts.aliases} onChange={(e) => setText("aliases", e.target.value)} />
            </Row>
            <Row label="Activité">
              <select className={input} value={values.category ?? ""} onChange={(e) => set("category", e.target.value || null)}>
                <option value="">Choisir…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="État">
              <select className={input} value={values.status} onChange={(e) => set("status", e.target.value as ListingStatus)}>
                {Object.entries(STATUSES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Présentation" hint="Deux ou trois phrases.">
              <textarea rows={3} maxLength={600} className={input} {...text("description")} />
            </Row>
            <Row label="Services proposés" hint="Un par ligne.">
              <textarea rows={3} className={input} value={texts.services} onChange={(e) => setText("services", e.target.value)} />
            </Row>
            {team ? (
              <Row label="SIRET" hint="14 chiffres. Sert à l'entreprise pour prendre la main sur sa fiche.">
                <input inputMode="numeric" className={input} {...text("siret")} />
              </Row>
            ) : null}
          </>
        ) : null}

        {tab === "lieu" ? (
          <>
            <Row label="Commune">
              <select className={input} value={values.commune ?? ""} onChange={(e) => set("commune", e.target.value || null)}>
                <option value="">Choisir…</option>
                {Object.entries(COMMUNES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Village ou quartier">
              <input maxLength={60} className={input} {...text("village")} />
            </Row>
            <Row label="Adresse">
              <input maxLength={200} className={input} {...text("address")} />
            </Row>
            <Row label="Repère pour trouver" hint="« En face de la pharmacie », « après le rond-point »…">
              <input maxLength={200} className={input} {...text("landmark")} />
            </Row>
            <Row label="Latitude" hint="Facultatif. Exemple : -12.7806">
              <input inputMode="decimal" className={input} {...number("latitude")} />
            </Row>
            <Row label="Longitude" hint="Facultatif. Exemple : 45.2278">
              <input inputMode="decimal" className={input} {...number("longitude")} />
            </Row>
          </>
        ) : null}

        {tab === "contact" ? (
          <>
            <Row label="Téléphones" hint="Un par ligne, ceux qui répondent vraiment.">
              <textarea rows={2} inputMode="tel" className={input} value={texts.phones} onChange={(e) => setText("phones", e.target.value)} />
            </Row>
            <Row label="WhatsApp">
              <input inputMode="tel" className={input} {...text("whatsapp")} />
            </Row>
            <Row label="E-mail">
              <input type="email" className={input} {...text("email")} />
            </Row>
            <Row label="Site internet">
              <input inputMode="url" className={input} {...text("website")} />
            </Row>
            <Row label="Facebook" hint="Le lien de la page.">
              <input inputMode="url" className={input} {...text("facebook")} />
            </Row>
            <Row label="Instagram" hint="Le lien du compte.">
              <input inputMode="url" className={input} {...text("instagram")} />
            </Row>
          </>
        ) : null}

        {tab === "horaires" ? (
          <>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              {DAYS.map((d) => (
                <label key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-medium">{d.label}</span>
                  <input
                    maxLength={80}
                    placeholder="7h-12h, 14h-17h"
                    className={input}
                    value={values.hours[d.id] ?? ""}
                    onChange={(e) => set("hours", { ...values.hours, [d.id]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <Row label="À savoir sur les horaires" hint="Jours fériés, ramadan, vacances…">
              <input maxLength={300} className={input} {...text("hoursNote")} />
            </Row>
            <Row label="Date d'ouverture">
              <input type="date" className={input} {...text("openedOn")} />
            </Row>
          </>
        ) : null}

        {tab === "pratique" ? (
          <>
            <Chips label="Paiement accepté" options={PAYMENTS} value={values.payments} onChange={(v) => set("payments", v)} />
            <Chips label="Langues parlées à l'accueil" options={LANGUAGES} value={values.languages} onChange={(v) => set("languages", v)} />
            <YesNo label="Livraison" value={values.delivery} onChange={(v) => set("delivery", v)} />
            <YesNo label="Parking" value={values.parking} onChange={(v) => set("parking", v)} />
            <YesNo label="Accès en fauteuil roulant" value={values.wheelchair} onChange={(v) => set("wheelchair", v)} />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4">
        {team ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.published ?? false} onChange={(e) => set("published", e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Publiée (Tamilya la lit)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verifiedToday} onChange={(e) => setVerifiedToday(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Tout vérifié aujourd&apos;hui
            </label>
          </>
        ) : null}
        <button type="submit" disabled={saving} className="btn-rose ml-auto h-10 rounded-full px-5 text-sm font-medium">
          {saving ? "Enregistrement…" : saveLabel}
        </button>
      </div>
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-fg-muted" : "text-danger"}`}>
          {result.message}
        </p>
      ) : null}
      {footer}
    </form>
  );
}
