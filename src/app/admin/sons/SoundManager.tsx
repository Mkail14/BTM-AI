"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconPencil, IconPlay, IconPlus, IconStop } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { SOUND_BUCKET, SOUND_MAX_BYTES, type CatalogSound, type SoundHeight, type SoundKind } from "@/lib/lecture/catalog";
import { renderSamples } from "@/lib/lecture/sounds";
import { lostOk } from "@/lib/safe-action";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addSoundAction,
  replaceSoundFileAction,
  resetOrDeleteSoundAction,
  startSoundUploadAction,
  toggleSoundAction,
  updateSoundAction,
} from "./actions";

const KINDS: { kind: SoundKind; label: string; hint: string }[] = [
  { kind: "decor", label: "Décors", hint: "Tournent en boucle pendant toute la page (pluie, marché, vagues)." },
  { kind: "bruit", label: "Bruits", hint: "Joués une fois, à un moment précis (coq, porte, scooter)." },
  { kind: "musique", label: "Musiques", hint: "Musique de fond sous les voix, choisie selon le ton." },
];
const KIND_ONE: Record<SoundKind, string> = { decor: "Décor", bruit: "Bruit", musique: "Musique" };
const HEIGHTS: { value: SoundHeight | ""; label: string }[] = [
  { value: "", label: "Libre (Tamilya choisit)" },
  { value: "haut", label: "En haut" },
  { value: "milieu", label: "À hauteur de tête" },
  { value: "bas", label: "En bas" },
];

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");

/** Envoie le fichier directement au stockage (sans passer par le serveur du site), puis rend son chemin. */
async function uploadSound(id: string, file: File): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (file.size > SOUND_MAX_BYTES) return { ok: false, message: "Fichier trop lourd : 3 Mo au plus (le débit de Mayotte est lent)." };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const start = await startSoundUploadAction({ id, ext }).catch(lostOk);
  if (!start.ok) return start;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, message: "Stockage indisponible." };
  const { error } = await supabase.storage
    .from(SOUND_BUCKET)
    .uploadToSignedUrl(start.path, start.token, file, { contentType: file.type || `audio/${ext === "mp3" ? "mpeg" : ext}` });
  return error ? { ok: false, message: `Envoi raté : ${error.message}` } : { ok: true, path: start.path };
}

/** Un seul son joue à la fois : le fichier, ou la version fabriquée par le téléphone s'il n'y en a pas. */
function usePlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(null);
  };
  useEffect(() => () => stopRef.current?.(), []);
  const play = (sound: CatalogSound) => {
    const wasPlaying = playing === sound.id;
    stop();
    if (wasPlaying) return;
    if (sound.url) {
      const audio = new Audio(sound.url);
      audio.onended = () => setPlaying((p) => (p === sound.id ? null : p));
      void audio.play().catch(() => setPlaying(null));
      stopRef.current = () => audio.pause();
    } else if (sound.synth) {
      const ctx = new AudioContext();
      const samples = new Float32Array(renderSamples(sound.id, ctx.sampleRate));
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = new AudioBufferSourceNode(ctx, { buffer });
      source.connect(ctx.destination);
      source.onended = () => {
        setPlaying((p) => (p === sound.id ? null : p));
        void ctx.close();
      };
      source.start();
      stopRef.current = () => {
        source.onended = null;
        void ctx.close();
      };
    } else return;
    setPlaying(sound.id);
  };
  return { playing, play };
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center" title={checked ? "Branché" : "Débranché"}>
      <span className="sr-only">{label}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
      />
    </label>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-accent" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </label>
  );
}

type Settings = { name: string; height: SoundHeight | null; width: number | null; scary: boolean; light: boolean };

/** Réglages communs à l'ajout et à la modification. */
function SettingsFields({ kind, value, onChange }: { kind: SoundKind; value: Settings; onChange: (v: Settings) => void }) {
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => onChange({ ...value, [key]: v });
  return (
    <>
      <label className="text-sm font-medium">
        Ce que c&apos;est
        <span className="block text-xs font-normal text-fg-muted">Tamilya lit cette phrase pour savoir quand s&apos;en servir.</span>
        <input value={value.name} maxLength={120} onChange={(e) => set("name", e.target.value)} className={`${inputClass} mt-1`} placeholder="ex. pirogue qui glisse sur le lagon" />
      </label>
      {kind !== "musique" ? (
        <label className="text-sm font-medium">
          D&apos;où vient le son
          <select value={value.height ?? ""} onChange={(e) => set("height", (e.target.value || null) as SoundHeight | null)} className={`${inputClass} mt-1`}>
            {HEIGHTS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {kind === "decor" ? (
        <label className="text-sm font-medium">
          Largeur autour de la tête : {value.width ?? 120}°
          <span className="block text-xs font-normal text-fg-muted">Petit : vient d&apos;un endroit précis (un feu). 360 : tout autour (la pluie).</span>
          <input type="range" min={10} max={360} step={10} value={value.width ?? 120} onChange={(e) => set("width", Number(e.target.value))} className="mt-2 w-full accent-accent" />
        </label>
      ) : null}
      {kind === "musique" ? (
        <Check checked={value.light} onChange={(v) => set("light", v)} label="Musique légère" hint="Pour les histoires drôles ou douces : aucun son qui fait peur dessous." />
      ) : (
        <Check checked={value.scary} onChange={(v) => set("scary", v)} label="Fait peur" hint="Jamais dans une histoire drôle ou douce." />
      )}
    </>
  );
}

function SoundEditor({ sound, onDone }: { sound: CatalogSound; onDone: (result: ActionResult | null) => void }) {
  const [value, setValue] = useState<Settings>({ name: sound.name, height: sound.height, width: sound.width, scary: sound.scary, light: sound.light });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      if (file) {
        const sent = await uploadSound(sound.id, file);
        if (!sent.ok) return setStatus(sent);
        const replaced = await replaceSoundFileAction({ id: sound.id, file: sent.path }).catch(lostOk);
        if (!replaced.ok) return setStatus(replaced);
      }
      const result = await updateSoundAction({ id: sound.id, ...value }).catch(lostOk);
      if (result.ok) onDone(result);
      else setStatus(result);
    });

  const reset = () => {
    const question = sound.builtin ? "Remettre ce son comme à l'origine ?" : "Supprimer ce son pour de bon ?";
    if (!window.confirm(question)) return;
    start(async () => {
      const result = await resetOrDeleteSoundAction(sound.id).catch(lostOk);
      if (result.ok) onDone(result);
      else setStatus(result);
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-4">
      <SettingsFields kind={sound.kind} value={value} onChange={setValue} />
      <label className="text-sm font-medium">
        {sound.url || sound.file ? "Remplacer le fichier" : "Donner un vrai enregistrement"}
        <span className="block text-xs font-normal text-fg-muted">webm, ogg, mp3, m4a ou wav ; 3 Mo au plus, le plus léger possible.</span>
        <input type="file" accept="audio/*,.webm,.ogg,.opus,.mp3,.m4a,.aac,.wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {sound.changed || !sound.builtin ? (
          <button type="button" onClick={reset} disabled={pending} className="rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft">
            {sound.builtin ? "Remettre d'origine" : "Supprimer"}
          </button>
        ) : null}
        <ActionStatus result={status} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => onDone(null)} disabled={pending} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={save} disabled={pending || value.name.trim().length < 3} className={primaryButton}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddSound({ kind, taken, onDone }: { kind: SoundKind; taken: Set<string>; onDone: (result: ActionResult | null) => void }) {
  const [sort, setSort] = useState<SoundKind>(kind);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState<Settings>({ name: "", height: null, width: 120, scary: false, light: false });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const id = slug(title);
  const idProblem = title && id.length < 2 ? "Nom trop court." : taken.has(id) ? "Ce nom est déjà pris." : null;

  const submit = () =>
    start(async () => {
      if (!file) return setStatus({ ok: false, message: "Choisis le fichier du son." });
      const sent = await uploadSound(id, file);
      if (!sent.ok) return setStatus(sent);
      const result = await addSoundAction({ id, kind: sort, file: sent.path, ...value, width: sort === "decor" ? value.width : null }).catch(lostOk);
      if (result.ok) onDone(result);
      else setStatus(result);
    });

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="font-semibold">Ajouter un son</h2>
      <div role="radiogroup" aria-label="Sorte de son" className="grid grid-cols-3 gap-1 rounded-lg bg-bg-muted p-1">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={sort === k.kind}
            onClick={() => setSort(k.kind)}
            className={`rounded-md px-2 py-1.5 text-sm font-medium ${sort === k.kind ? "bg-bg shadow-sm" : "text-fg-muted hover:text-fg"}`}
          >
            {KIND_ONE[k.kind]}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{KINDS.find((k) => k.kind === sort)?.hint}</p>
      <label className="text-sm font-medium">
        Nom court
        <span className="block text-xs font-normal text-fg-muted">Un ou deux mots : {id ? <code className="font-mono">{id}</code> : "ex. pirogue"}</span>
        <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} />
        {idProblem ? <span className="mt-1 block text-xs text-danger">{idProblem}</span> : null}
      </label>
      <SettingsFields kind={sort} value={value} onChange={setValue} />
      <label className="text-sm font-medium">
        Fichier du son
        <span className="block text-xs font-normal text-fg-muted">
          webm, ogg, mp3, m4a ou wav ; 3 Mo au plus. {sort === "bruit" ? "Court (quelques secondes)." : "Une boucle de 20 à 60 s suffit."}
        </span>
        <input type="file" accept="audio/*,.webm,.ogg,.opus,.mp3,.m4a,.aac,.wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <ActionStatus result={status} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => onDone(null)} disabled={pending} className={secondaryButton}>
            Annuler
          </button>
          <button type="submit" disabled={pending || !id || Boolean(idProblem) || value.name.trim().length < 3 || !file} className={primaryButton}>
            {pending ? "Envoi…" : "Ajouter"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Liste des sons par sorte : écouter, brancher ou débrancher, modifier ; et ajouter un son. */
export function SoundManager({ catalog }: { catalog: CatalogSound[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<SoundKind>("bruit");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const { playing, play } = usePlayer();
  const list = catalog.filter((s) => s.kind === kind).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"));

  const done = (result: ActionResult | null) => {
    setEditing(null);
    setAdding(false);
    if (result) {
      setStatus(result);
      router.refresh();
    }
  };

  const toggle = (sound: CatalogSound, active: boolean) =>
    start(async () => {
      const result = await toggleSoundAction({ id: sound.id, active }).catch(lostOk);
      setStatus(result);
      if (result.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {adding ? (
        <AddSound kind={kind} taken={new Set(catalog.map((s) => s.id))} onDone={done} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${primaryButton} inline-flex items-center justify-center gap-2 self-start`}>
          <IconPlus width={16} height={16} /> Ajouter un son
        </button>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-bg">
        <div role="tablist" aria-label="Sortes de sons" className="grid grid-cols-3 gap-1 border-b border-border p-1">
          {KINDS.map((k) => {
            const all = catalog.filter((s) => s.kind === k.kind);
            const on = all.filter((s) => s.active).length;
            return (
              <button
                key={k.kind}
                type="button"
                role="tab"
                aria-selected={kind === k.kind}
                onClick={() => {
                  setKind(k.kind);
                  setEditing(null);
                }}
                className={`rounded-lg px-2 py-2 text-sm font-medium ${kind === k.kind ? "bg-bg-muted" : "text-fg-muted hover:text-fg"}`}
              >
                {k.label} <span className="text-xs font-normal tabular-nums text-fg-muted">{on === all.length ? all.length : `${on}/${all.length}`}</span>
              </button>
            );
          })}
        </div>
        <p className="px-4 pt-3 text-xs text-fg-muted">{KINDS.find((k) => k.kind === kind)?.hint}</p>
        <div className="px-4 pt-2">
          <ActionStatus result={status} />
        </div>
        <ul role="tabpanel" className="divide-y divide-border">
          {list.map((sound) => {
            const canPlay = Boolean(sound.url) || sound.synth;
            const tags = [
              !sound.builtin ? "ajouté" : sound.changed ? "modifié" : null,
              !sound.url && sound.synth ? "fabriqué" : null,
              sound.scary ? "fait peur" : null,
              sound.light ? "légère" : null,
            ].filter(Boolean);
            return (
              <li key={sound.id} className={sound.active ? "" : "bg-bg-subtle/60"}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => play(sound)}
                    disabled={!canPlay}
                    aria-label={`${playing === sound.id ? "Arrêter" : "Écouter"} : ${sound.name}`}
                    className={`grid size-9 shrink-0 place-items-center rounded-full border border-border hover:bg-bg-muted disabled:opacity-40 ${playing === sound.id ? "bg-bg-muted" : ""}`}
                  >
                    {playing === sound.id ? <IconStop width={16} height={16} /> : <IconPlay width={16} height={16} />}
                  </button>
                  <div className={`min-w-0 flex-1 ${sound.active ? "" : "opacity-60"}`}>
                    <p className="truncate text-sm font-medium first-letter:uppercase">{sound.name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      <code className="font-mono">{sound.id}</code>
                      {tags.length ? ` · ${tags.join(" · ")}` : ""}
                      {sound.active ? "" : " · débranché"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === sound.id ? null : sound.id)}
                    aria-label={`Modifier : ${sound.name}`}
                    aria-expanded={editing === sound.id}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg"
                  >
                    <IconPencil width={16} height={16} />
                  </button>
                  <Switch checked={sound.active} disabled={pending} onChange={(v) => toggle(sound, v)} label={`Brancher : ${sound.name}`} />
                </div>
                {editing === sound.id ? <SoundEditor sound={sound} onDone={done} /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
