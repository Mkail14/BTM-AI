"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconClose } from "@/components/ui/icons";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { ActionResult } from "@/lib/admin/action-auth";
import { addApiAction, listModelsAction } from "./actions";
import { API_LIMITS, API_PRESETS, detectPreset } from "./presets";

type ModelList =
  | { state: "idle" | "loading" }
  | { state: "ready"; models: string[]; freeOnly: boolean }
  | { state: "error"; message: string };

/**
 * Fenêtre d'ajout d'une API : il suffit de coller la clé. Le fournisseur est
 * reconnu à son début, puis le modèle est choisi dans la liste que donne la
 * clé (personne ne connaît leurs noms par cœur). Tout reste modifiable.
 */
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
  const [list, setList] = useState<ModelList>({ state: "idle" });
  const [detected, setDetected] = useState(false);

  // Clé collée : on demande au fournisseur ses modèles (gratuit), un instant après la saisie.
  const keyReady = apiKey.trim().length >= 20;
  useEffect(() => {
    if (!keyReady) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setList({ state: "loading" });
      const result = await listModelsAction({ provider: preset.provider, baseUrl, apiKey });
      if (cancelled) return;
      if (!result.ok) return setList({ state: "error", message: result.message });
      setList({ state: "ready", models: result.models, freeOnly: result.freeOnly });
      // Premier modèle recommandé disponible (gratuit si le compte n'a pas de crédit), sinon on laisse choisir.
      const usable = (id: string) => result.models.includes(id) && (!result.freeOnly || id.endsWith(":free"));
      setModel((current) => (usable(current) ? current : (preset.suggested?.find(usable) ?? "")));
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseUrl, keyReady, preset]);

  const suggested = list.state === "ready" ? (preset.suggested ?? []).filter((id) => list.models.includes(id)) : [];
  /** « (gratuit) » / « (payant) » quand le compte OpenRouter n'a pas de crédit : on voit ce qui marche. */
  const priceTag = (id: string) => (list.state === "ready" && list.freeOnly ? (id.endsWith(":free") ? " (gratuit)" : " (crédit requis)") : "");

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("#api-key")?.focus();
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
    setModel("");
    setList({ state: "idle" });
    setDetected(false);
    setStatus(null);
  }

  function changeKey(value: string) {
    setApiKey(value);
    setList({ state: "idle" });
    setStatus(null);
    const found = detectPreset(value);
    if (found && found.id !== presetId) {
      choosePreset(found.id);
      setDetected(true);
    }
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
        className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg p-5 shadow-xl"
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
          className="mt-4 space-y-3"
        >
          <Field label="Clé API" htmlFor="api-key">
            <PasswordInput
              id="api-key"
              value={apiKey}
              maxLength={API_LIMITS.apiKey}
              autoComplete="off"
              placeholder="Collez votre clé : le reste se remplit tout seul"
              onChange={(e) => changeKey(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-fg-muted">
              {detected ? <span className="font-medium text-success">✓ Clé {preset.label} reconnue. </span> : null}
              Vérifiée puis chiffrée.
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

          <Field label="Fournisseur" htmlFor="api-preset">
            <select id="api-preset" value={presetId} onChange={(e) => choosePreset(e.target.value)} className={inputClass}>
              {API_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nom affiché" htmlFor="api-label">
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
            <Field label="Adresse de l'API" htmlFor="api-url">
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



          <Field label="Modèle" htmlFor="api-model">
            {list.state === "ready" ? (
              <select id="api-model" value={model} onChange={(e) => setModel(e.target.value)} className={`${inputClass} font-mono text-xs`}>
                <option value="" disabled>
                  Choisissez un modèle…
                </option>
                {suggested.length > 0 ? (
                  <optgroup label="Recommandés pour Awa">
                    {suggested.map((id) => (
                      <option key={id} value={id}>
                        {id}
                        {priceTag(id)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label={`Tous les modèles de cette clé (${list.models.length})`}>
                  {list.models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                      {priceTag(id)}
                    </option>
                  ))}
                </optgroup>
              </select>
            ) : (
              <input
                id="api-model"
                value={model}
                maxLength={API_LIMITS.model}
                placeholder={preset.modelPlaceholder}
                onChange={(e) => setModel(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
            )}
            <p className={`mt-1 text-xs ${list.state === "error" ? "text-danger" : "text-fg-muted"}`}>
              {list.state === "loading"
                ? "Recherche des modèles de cette clé…"
                : list.state === "error"
                  ? /Mayotte/.test(list.message)
                    ? list.message
                    : `${list.message} Vous pouvez écrire le nom du modèle à la main.`
                  : list.state === "ready"
                    ? list.freeOnly
                      ? "Compte OpenRouter sans crédit : seuls les modèles « :free » marchent (50 messages par jour)."
                      : "« anthropic/… » = Claude, « openai/… » = GPT, « google/… » = Gemini : passés par OpenRouter, avec la même clé."
                    : "Collez d'abord la clé : la liste de ses modèles s'affichera ici."}
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
