"use client";

import { useEffect, useRef, useState } from "react";
import { IconMic } from "@/components/ui/icons";
import { average, loadPrinter, similarity } from "@/lib/voice-live/speaker";
import { speechSeconds, startRecording, type Recording } from "@/lib/voice-live/record";
import { DANGER, PRIMARY, RowEditor, SECONDARY, SettingsGroup, SettingsRow } from "./ui";

/** Trois phrases à lire : assez longues pour une empreinte fiable (au moins 2 s de voix chacune). */
const PHRASES = [
  "Tamilya, c'est moi. Je confirme que c'est bien ma voix.",
  "Aujourd'hui à Mayotte, je prépare ma journée tranquillement.",
  "Mon code reste secret, je ne le donne à personne.",
];
const MIN_SPEECH_S = 1.5;
/** Les trois phrases doivent venir de la même personne, au calme. */
const SAME_VOICE = 0.4;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Mayotte" });

/**
 * Empreinte de voix : deuxième vérification du paiement à la voix, avec le code.
 * Seule l'empreinte (des nombres) est envoyée, jamais l'enregistrement.
 */
export function VoicePrint() {
  const [status, setStatus] = useState<{ enrolled: boolean; since: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState(0);
  const [prints, setPrints] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = useRef<Recording | null>(null);

  useEffect(() => {
    fetch("/api/voice/print", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ enrolled: boolean; since: string | null }>) : null))
      .then((body) => setStatus(body ?? { enrolled: false, since: null }))
      .catch(() => setStatus({ enrolled: false, since: null }));
    return () => void current.current?.stop();
  }, []);

  function reset() {
    setOpen(false);
    setConsent(false);
    setStep(0);
    setPrints([]);
    setLevel(0);
  }

  function begin() {
    setMessage(null);
    setOpen(true);
    // Le modèle (≈ 7 Mo) se charge pendant que la personne lit l'accord.
    void loadPrinter();
  }

  async function toggle() {
    if (recording) return finishPhrase();
    setMessage(null);
    try {
      current.current = await startRecording(setLevel);
      setRecording(true);
    } catch {
      setMessage({ ok: false, text: "Micro refusé : autorise le micro pour ce site, puis réessaie." });
    }
  }

  async function finishPhrase() {
    const rec = current.current;
    current.current = null;
    setRecording(false);
    setLevel(0);
    if (!rec) return;
    const samples = await rec.stop();
    if (speechSeconds(samples) < MIN_SPEECH_S) return setMessage({ ok: false, text: "Trop court : lis toute la phrase, à voix normale." });
    setBusy("Calcul de ton empreinte…");
    const printer = await loadPrinter();
    const print = printer ? await printer(samples).catch(() => null) : null;
    setBusy(null);
    if (!print) return setMessage({ ok: false, text: printer ? "Phrase illisible : recommence au calme." : "Ce téléphone ne peut pas calculer l'empreinte de voix." });
    const next = [...prints, print];
    setPrints(next);
    if (next.length < PHRASES.length) return setStep(next.length);
    // Les trois phrases doivent se ressembler (une seule personne, sans bruit fort).
    const close = next.every((a, i) => next.every((b, j) => i >= j || similarity(a, b) >= SAME_VOICE));
    if (!close) {
      setPrints([]);
      setStep(0);
      return setMessage({ ok: false, text: "Les trois phrases ne se ressemblent pas assez : recommence seul, au calme." });
    }
    await save(average(next));
  }

  async function save(print: number[]) {
    setBusy("Enregistrement…");
    const response = await fetch("/api/voice/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ print, consent: true }) }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(null);
    if (!result?.ok) return setMessage({ ok: false, text: result?.error ?? "Connexion impossible : réessaie." });
    reset();
    setStatus({ enrolled: true, since: new Date().toISOString() });
    setMessage({ ok: true, text: "Voix enregistrée : Tamilya vérifiera maintenant ta voix avant de payer." });
  }

  async function remove() {
    setBusy("Suppression…");
    const response = await fetch("/api/voice/print", { method: "DELETE" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(null);
    if (!result?.ok) return setMessage({ ok: false, text: result?.error ?? "Connexion impossible : réessaie." });
    setStatus({ enrolled: false, since: null });
    setMessage({ ok: true, text: "Empreinte effacée : Tamilya ne vérifie plus ta voix (le code reste demandé)." });
  }

  return (
    <SettingsGroup
      title="Ta voix"
      description="Double vérification : avant de payer à ta place, Tamilya vérifie ton code et ta voix."
      footer={
        message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        ) : null
      }
    >
      {status === null ? (
        <div className="m-4 h-8 animate-pulse rounded-lg bg-bg-muted" />
      ) : !open ? (
        <SettingsRow label="Empreinte de voix" value={status.enrolled ? `Enregistrée${status.since ? ` le ${dateFormat.format(new Date(status.since))}` : ""}` : "Aucune"}>
          <div className="flex gap-2">
            {status.enrolled ? (
              <button type="button" disabled={Boolean(busy)} onClick={() => void remove()} className={DANGER}>
                Supprimer
              </button>
            ) : null}
            <button type="button" onClick={begin} className={SECONDARY}>
              {status.enrolled ? "Refaire" : "Enregistrer"}
            </button>
          </div>
        </SettingsRow>
      ) : (
        <RowEditor>
          {!consent ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                Tu vas lire trois phrases. Ton téléphone en tire une empreinte : des nombres qui décrivent ta voix, pas l&apos;enregistrement. Seule cette
                empreinte est gardée sur ton compte, pour vérifier que c&apos;est bien toi qui demandes un paiement. Tu peux l&apos;effacer à tout moment ici.
              </p>
              <p className="text-xs text-fg-muted">Une voix peut être imitée : elle s&apos;ajoute à ton code, elle ne le remplace jamais.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setConsent(true)} className={PRIMARY}>
                  J&apos;accepte, on commence
                </button>
                <button type="button" onClick={reset} className={SECONDARY}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-medium text-fg-muted">
                Phrase {Math.min(step + 1, PHRASES.length)} sur {PHRASES.length} · seul, au calme, à voix normale
              </p>
              <p className="text-lg leading-snug font-medium">« {PHRASES[step]} »</p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={Boolean(busy)} onClick={() => void toggle()} className={`${PRIMARY} inline-flex items-center gap-2`}>
                  <IconMic width={16} height={16} />
                  {recording ? "J'ai fini" : "Appuie, puis lis la phrase"}
                </button>
                <button type="button" disabled={recording || Boolean(busy)} onClick={reset} className={SECONDARY}>
                  Annuler
                </button>
              </div>
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              {busy ? <p className="text-sm text-fg-muted">{busy}</p> : null}
            </div>
          )}
        </RowEditor>
      )}
    </SettingsGroup>
  );
}
