"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, secondaryButton } from "@/components/admin/form";
import type { DeveloperWidget } from "@/lib/developers/widgets";
import { lostOk } from "@/lib/safe-action";
import { createDeveloperWidgetAction, revokeDeveloperWidgetAction, updateWidgetMissionAction } from "./actions";

const MISSION_HINT =
  "Facultatif. Le rôle de Tamilya sur votre site : sujet, ton, public. Elle garde toujours son nom, son shimaoré et sa personnalité : une tentative de la renommer suspend votre accès.";
const MISSION_PLACEHOLDER = "ex. Tu es l'agent d'accueil de l'agence Lagon Voyages : réponds sur nos excursions, ton chaleureux.";

/** Mission d'un widget déjà créé : affichée, et modifiable sur place. */
function MissionEditor({ widget }: { widget: DeveloperWidget }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(widget.mission ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await updateWidgetMissionAction(widget.id, value).catch(lostOk);
      if (!result.ok) return setError(result.message);
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-fg/[0.04] px-3 py-2 text-xs">
        <p className="min-w-0 text-fg-muted">
          <span className="font-medium text-fg">Mission : </span>
          {widget.mission ?? "aucune (Tamilya répond de façon générale)"}
        </p>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 font-medium text-fg underline underline-offset-4">
          Modifier
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={MISSION_PLACEHOLDER}
        aria-label="Mission de Tamilya"
        className={`${inputClass} rounded-2xl px-4 py-2`}
      />
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-rose h-9 rounded-full px-4 text-sm font-medium">
          Enregistrer
        </button>
        <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
          Annuler
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mayotte" });

const widgetSnippet = (scriptUrl: string, publicId: string) => `<script src="${scriptUrl}" data-site="${publicId}" async></script>`;

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-[#1e1e1e] px-3 py-2 font-mono text-xs whitespace-nowrap text-[#ce9178]">{code}</code>
      <button type="button" onClick={copy} className={`${secondaryButton} shrink-0`}>
        {copied ? (
          <span className="inline-flex items-center gap-1">
            Copié <Check aria-hidden="true" className="size-4" />
          </span>
        ) : (
          "Copier"
        )}
      </button>
    </div>
  );
}

/** Widgets de l'utilisateur : création (nom + adresses du site), balise à copier, suppression. */
export function DeveloperWidgets({ widgets, max, scriptUrl }: { widgets: DeveloperWidget[]; max: number; scriptUrl: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [domains, setDomains] = useState("");
  const [mission, setMission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      const result = await createDeveloperWidgetAction(label, domains, mission).catch(lostOk);
      if (!result.ok) {
        setError(result.message);
        router.refresh();
        return;
      }
      setLabel("");
      setDomains("");
      setMission("");
      router.refresh();
    });

  const revoke = (widget: DeveloperWidget) => {
    if (!window.confirm(`Supprimer le widget « ${widget.label} » ? La bulle disparaîtra des sites qui l'utilisent.`)) return;
    startTransition(async () => {
      const result = await revokeDeveloperWidgetAction(widget.id).catch(lostOk);
      if (!result.ok) setError("La suppression a échoué. Réessayez.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {widgets.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {widgets.map((widget) => (
            <li key={widget.id} className="rounded-2xl border border-border bg-bg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{widget.label}</p>
                  <p className="mt-0.5 text-xs break-all text-fg-muted">{widget.origins.join(" · ")}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    créé le {date.format(new Date(widget.createdAt))} ·{" "}
                    {widget.lastUsedAt ? `utilisé le ${date.format(new Date(widget.lastUsedAt))}` : "jamais utilisé"}
                  </p>
                </div>
                <button type="button" onClick={() => revoke(widget)} disabled={pending} className={`${secondaryButton} shrink-0 text-danger`}>
                  Supprimer
                </button>
              </div>
              <MissionEditor widget={widget} />
              <Snippet code={widgetSnippet(scriptUrl, widget.publicId)} />
            </li>
          ))}
        </ul>
      ) : null}

      {widgets.length < max ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="widget-label" className="text-xs font-medium">
            Nom
          </label>
          <input
            id="widget-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            placeholder="ex. Mon site vitrine"
            className={`${inputClass} h-10 rounded-full px-4`}
          />
          <label htmlFor="widget-domains" className="mt-1 text-xs font-medium">
            Adresse de votre site
          </label>
          <textarea
            id="widget-domains"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
            rows={2}
            placeholder={"mon-site.yt\nwww.mon-site.yt"}
            className={`${inputClass} rounded-2xl px-4 py-2`}
          />
          <p className="text-xs text-fg-muted">Une adresse par ligne (5 au plus). La bulle ne marchera que sur ces sites.</p>
          <label htmlFor="widget-mission" className="mt-1 text-xs font-medium">
            Mission de Tamilya
          </label>
          <textarea
            id="widget-mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={MISSION_PLACEHOLDER}
            className={`${inputClass} rounded-2xl px-4 py-2`}
          />
          <p className="text-xs text-fg-muted">{MISSION_HINT}</p>
          <button
            type="submit"
            disabled={pending || !label.trim() || !domains.trim()}
            className="btn-rose mt-1 h-10 self-start rounded-full px-5 text-sm font-medium"
          >
            Créer mon widget
          </button>
        </form>
      ) : (
        <p className="text-xs text-fg-muted">{max} widgets au plus : supprimez-en un pour en créer un autre.</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
