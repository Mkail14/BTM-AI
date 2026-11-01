"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import type { CandidatePrefill } from "@/app/api/code-exam/requests/route";
import { IconClose } from "@/components/ui/icons";
import { authRequiredPath } from "@/lib/auth/redirect";
import {
  CANDIDATE_FIELDS,
  EXAM_TYPES,
  MAYOTTE_COMMUNES,
  fieldError,
  normalizeNeph,
  type CandidateField,
  type ExamType,
} from "@/lib/code-exam/candidate";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border bg-bg px-3.5 py-3 text-base outline-none transition-colors focus:ring-2 sm:py-2.5";
const PRIMARY =
  "w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 sm:py-2.5 sm:text-sm";
const PERSONA = "var(--persona,var(--accent))";

export type BookingSlot = { centerId: string; centerName: string; startsAt: string; types: string[]; when: string };

type Step = "infos" | "type" | "neph" | "recap" | "done";
const STEPS: Step[] = ["infos", "type", "neph", "recap"];
const TITLES: Record<Step, string> = {
  infos: "Tes informations",
  type: "Quel code veux-tu passer ?",
  neph: "Ton numéro NEPH",
  recap: "On vérifie ensemble",
  done: "Demande envoyée",
};

type Values = Record<CandidateField | "neph", string>;
const EMPTY: Values = { civility: "", lastName: "", firstName: "", birthDate: "", city: "", phone: "", email: "", neph: "" };

const LABELS: Record<Exclude<CandidateField, "civility">, string> = {
  lastName: "Nom",
  firstName: "Prénom",
  birthDate: "Date de naissance",
  city: "Ville de résidence",
  phone: "Téléphone",
  email: "E-mail",
};

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {/* Message affiché sous le champ, apparition douce. */}
      {error ? (
        <p id={`${id}-error`} className="booking-shake mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fenêtre de réservation de l'examen du code, au centre du site sur fond
 * flouté (même fenêtre que la connexion). Quatre étapes : informations du
 * candidat (bloquantes tant qu'elles ne sont pas toutes valides), épreuve,
 * NEPH et SNU, puis récapitulatif. Les informations sont revérifiées par le serveur.
 */
export function BookingDialog({ slot, onClose }: { slot: BookingSlot; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>("infos");
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [examType, setExamType] = useState<ExamType | null>(null);
  const [snu, setSnu] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    // Ce qu'on sait déjà (dernière demande, e-mail du compte) : pré-rempli.
    fetch("/api/code-exam/requests", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) setNeedsLogin(true);
        return res.ok ? (res.json() as Promise<{ prefill: CandidatePrefill }>) : null;
      })
      .then((body) => {
        if (body) setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(body.prefill).filter(([, x]) => x)) }));
      })
      .catch(() => {});
  }, []);

  const types = (slot.types.length ? slot.types : Object.keys(EXAM_TYPES)).filter((t): t is ExamType => t in EXAM_TYPES);
  const errors = Object.fromEntries(
    [...CANDIDATE_FIELDS, "neph" as const].map((f) => [f, fieldError(f, values[f])]),
  ) as Record<keyof Values, string | null>;
  const infosValid = CANDIDATE_FIELDS.every((f) => !errors[f]);
  const shown = (f: keyof Values) => (touched[f] ? errors[f] : null);

  const set = (field: keyof Values, value: string) => setValues((v) => ({ ...v, [field]: value }));
  const touch = (field: keyof Values) => setTouched((t) => ({ ...t, [field]: true }));
  const index = STEPS.indexOf(step);
  const back = () => setStep(STEPS[Math.max(index - 1, 0)]);

  async function send() {
    setSending(true);
    setServerError(null);
    try {
      const res = await fetch("/api/code-exam/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, centerId: slot.centerId, startsAt: slot.startsAt, examType, snu }),
      });
      if (res.ok) setStep("done");
      else setServerError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Envoi impossible.");
    } catch {
      setServerError("Pas de connexion : réessaie.");
    } finally {
      setSending(false);
    }
  }

  const input = (field: Exclude<CandidateField, "civility">, props: InputHTMLAttributes<HTMLInputElement>) => {
    const id = `${titleId}-${field}`;
    const error = shown(field);
    return (
      <Field id={id} label={LABELS[field]} error={error}>
        <input
          id={id}
          value={values[field]}
          onChange={(e) => set(field, e.target.value)}
          onBlur={() => touch(field)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${INPUT_CLASS} ${
            error ? "border-danger focus:ring-danger/20" : "border-border focus:border-[var(--persona,var(--accent))] focus:ring-[color-mix(in_srgb,var(--persona,var(--accent))_20%,transparent)]"
          }`}
          {...props}
        />
      </Field>
    );
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="auth-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none scrollbar-none overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-bg p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-md sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:border sm:pb-0"
    >
      <div className="p-5 sm:p-6">
        {/* En-tête : retour, titre, créneau choisi, fermer */}
        <div className="flex items-start gap-2">
          {index > 0 && step !== "done" ? (
            <button
              type="button"
              onClick={back}
              aria-label="Retour"
              className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full text-xl text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              ‹
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {TITLES[step]}
            </h2>
            <p className="truncate text-sm text-fg-muted">
              {slot.when} · La Poste de {slot.centerName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer"
            className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>

        {/* Avancement */}
        {step !== "done" && !needsLogin ? (
          <div className="mt-4 flex gap-1.5" aria-label={`Étape ${index + 1} sur ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: i <= index ? "100%" : "0%", background: PERSONA }}
                />
              </span>
            ))}
          </div>
        ) : null}

        {/* Étape en cours : glisse en entrant */}
        <div key={needsLogin ? "login" : step} className="booking-step mt-5">
          {needsLogin ? (
            <div className="text-center">
              <p className="text-sm text-fg-muted">Connecte-toi pour réserver : ta demande sera liée à ton compte.</p>
              <button
                type="button"
                onClick={() => window.location.assign(authRequiredPath(window.location.pathname))}
                className={`${PRIMARY} mt-4`}
                style={{ background: PERSONA }}
              >
                Se connecter
              </button>
            </div>
          ) : null}
          {!needsLogin && step === "infos" ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(Object.fromEntries(CANDIDATE_FIELDS.map((f) => [f, true])));
                if (infosValid) setStep("type");
              }}
              className="space-y-3.5"
            >
              <div>
                <span className="block text-sm font-medium">Civilité</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Civilité">
                  {(["Mme", "M."] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={values.civility === c}
                      onClick={() => {
                        set("civility", c);
                        touch("civility");
                      }}
                      className={`rounded-xl border px-3 py-2.5 font-medium transition-colors ${
                        values.civility === c ? "border-transparent text-white" : "border-border hover:bg-bg-muted"
                      }`}
                      style={values.civility === c ? { background: PERSONA } : undefined}
                    >
                      {c === "Mme" ? "Madame" : "Monsieur"}
                    </button>
                  ))}
                </div>
                {shown("civility") ? <p className="booking-shake mt-1 text-xs text-danger">{shown("civility")}</p> : null}
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {input("lastName", { autoComplete: "family-name" })}
                {input("firstName", { autoComplete: "given-name" })}
              </div>
              {input("birthDate", { type: "date", autoComplete: "bday", max: new Date().toISOString().slice(0, 10) })}
              {input("city", { autoComplete: "address-level2", list: `${titleId}-communes` })}
              <datalist id={`${titleId}-communes`}>
                {MAYOTTE_COMMUNES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {input("phone", { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "0639 12 34 56" })}
              {input("email", { type: "email", autoComplete: "email", inputMode: "email" })}
              <button type="submit" disabled={!infosValid} className={`${PRIMARY} mt-2`} style={{ background: PERSONA }}>
                Continuer
              </button>
              {!infosValid ? <p className="text-center text-xs text-fg-muted">Remplis tous les champs pour continuer.</p> : null}
            </form>
          ) : null}

          {!needsLogin && step === "type" ? (
            <div className="space-y-2">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setExamType(t);
                    setStep("neph");
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left font-medium transition-all hover:-translate-y-px hover:shadow-sm ${
                    examType === t ? "border-[var(--persona,var(--accent))]" : "border-border"
                  }`}
                >
                  {EXAM_TYPES[t]}
                  <span className="text-fg-muted" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {!needsLogin && step === "neph" ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                touch("neph");
                if (!errors.neph) setStep("recap");
              }}
              className="space-y-4"
            >
              <Field id={`${titleId}-neph`} label="Numéro NEPH" error={shown("neph")}>
                <input
                  id={`${titleId}-neph`}
                  value={values.neph}
                  onChange={(e) => set("neph", e.target.value)}
                  onBlur={() => touch("neph")}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="12 chiffres"
                  className={`${INPUT_CLASS} font-mono tracking-wider ${
                    shown("neph") ? "border-danger" : "border-border focus:border-[var(--persona,var(--accent))]"
                  }`}
                />
              </Field>
              <p className="-mt-2 text-xs text-fg-muted">
                Il est sur ton attestation d&apos;inscription au permis (ANTS).
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-bg-muted">
                <input
                  type="checkbox"
                  checked={snu}
                  onChange={(e) => setSnu(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                  style={{ accentColor: PERSONA }}
                />
                <span>
                  <span className="block font-medium">Je suis éligible au SNU</span>
                  <span className="text-xs text-fg-muted">Le Service national universel peut prendre en charge le code.</span>
                </span>
              </label>
              <button type="submit" disabled={Boolean(errors.neph)} className={PRIMARY} style={{ background: PERSONA }}>
                Continuer
              </button>
            </form>
          ) : null}

          {!needsLogin && step === "recap" ? (
            <div>
              <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                {[
                  ["Candidat", `${values.civility === "Mme" ? "Madame" : "Monsieur"} ${values.firstName} ${values.lastName.toUpperCase()}`],
                  ["Né(e) le", new Date(values.birthDate).toLocaleDateString("fr-FR", { timeZone: "UTC" })],
                  ["Ville", values.city],
                  ["Contact", `${values.phone} · ${values.email}`],
                  ["Épreuve", examType ? EXAM_TYPES[examType] : "—"],
                  ["NEPH", normalizeNeph(values.neph)],
                  ["SNU", snu ? "Oui" : "Non"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 px-3.5 py-2.5">
                    <dt className="shrink-0 text-fg-muted">{label}</dt>
                    <dd className="min-w-0 text-right font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              {serverError ? (
                <p role="alert" className="booking-shake mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {serverError}
                </p>
              ) : null}
              <button type="button" onClick={() => void send()} disabled={sending} className={`${PRIMARY} mt-4`} style={{ background: PERSONA }}>
                {sending ? "Envoi…" : "Envoyer ma demande"}
              </button>
              <p className="mt-2 text-center text-xs text-fg-muted">Vérifie bien : ces informations doivent être exactes.</p>
            </div>
          ) : null}

          {!needsLogin && step === "done" ? (
            <div className="py-2 text-center">
              <div className="booking-pop mx-auto grid size-14 place-items-center rounded-full text-2xl text-white" style={{ background: PERSONA }}>
                ✓
              </div>
              <p className="mt-4 font-medium">C&apos;est envoyé !</p>
              <p className="mt-1 text-sm text-fg-muted">On revient vers toi par téléphone ou e-mail pour confirmer ta place.</p>
              <button type="button" onClick={() => ref.current?.close()} className={`${PRIMARY} mt-5`} style={{ background: PERSONA }}>
                Fermer
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
