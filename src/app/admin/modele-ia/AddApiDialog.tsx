"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconClose } from "@/components/ui/icons";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ActionResult } from "@/lib/admin/action-auth";
import { addApiAction } from "./actions";
import { API_LIMITS, API_PRESETS } from "./presets";

/** Fenêtre d'ajout d'une API : fournisseur, modèle, clé (vérifiée avant l'enregistrement). */
export function AddApiDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [presetId, setPresetId] = useState(API_PRESETS[0].id);
  const preset = API_PRESETS.find((p) => p.id === presetId) ?? API_PRESETS[0];
  const [label, setLabel] = useState(preset.label);
  const [baseUrl, setBaseUrl] = useState(preset.baseUrl);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("select")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function choosePreset(id: string) {
    const next = API_PRESETS.find((p) => p.id === id) ?? API_PRESETS[0];
    setPresetId(next.id);
    setLabel(next.id === "other" ? "" : next.label);
    setBaseUrl(next.baseUrl);
    setStatus(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await addApiAction({ label, provider: preset.provider, baseUrl, model, apiKey });
      setStatus(result);
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-api-title"
        className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-bg p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-api-title" className="text-lg font-semibold">
              Ajouter une API
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Elle se place en dernier dans la chaîne et prend le relais si les précédentes sont épuisées.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted">
            <IconClose />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-4 space-y-4"
        >
          <Field label="Fournisseur" htmlFor="api-preset">
            <select id="api-preset" value={presetId} onChange={(e) => choosePreset(e.target.value)} className={inputClass}>
              {API_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nom affiché" hint="Pour la reconnaître dans le schéma." htmlFor="api-label">
            <input
              id="api-label"
              value={label}
              maxLength={API_LIMITS.label}
              placeholder="Ex. : Groq secours"
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
          </Field>

          {preset.provider === "openai-compatible" ? (
            <Field label="Adresse de l'API" hint="Se termine en général par /v1." htmlFor="api-url">
              <input
                id="api-url"
                type="url"
                value={baseUrl}
                maxLength={API_LIMITS.baseUrl}
                placeholder="https://…/v1"
                readOnly={presetId !== "other"}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={`${inputClass} font-mono text-xs ${presetId !== "other" ? "bg-bg-muted text-fg-muted" : ""}`}
              />
            </Field>
          ) : null}

          <Field label="Modèle" hint="L'identifiant exact donné par le fournisseur." htmlFor="api-model">
            <input
              id="api-model"
              value={model}
              maxLength={API_LIMITS.model}
              placeholder={preset.modelPlaceholder}
              onChange={(e) => setModel(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field label="Clé API" htmlFor="api-key">
            <PasswordInput
              id="api-key"
              value={apiKey}
              maxLength={API_LIMITS.apiKey}
              autoComplete="off"
              onChange={(e) => setApiKey(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-fg-muted">
              Vérifiée auprès du fournisseur, puis chiffrée avant d&apos;être enregistrée. Elle ne sera plus jamais
              affichée en entier.
              {preset.keyUrl ? (
                <>
                  {" "}
                  <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                    Obtenir une clé ↗
                  </a>
                </>
              ) : null}
            </p>
          </Field>

          {status && !status.ok ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm">
              {status.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={pending || !model.trim() || !apiKey.trim()} className={primaryButton}>
              {pending ? "Vérification…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
