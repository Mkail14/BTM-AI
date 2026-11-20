"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconFolder, IconLanguage, IconLock, IconMic, IconShield, IconUser, IconWallet } from "@/components/ui/icons";
import { maskEmail } from "../parametres/mask-email";
import { markWelcomeDone, WELCOME_LANGUAGES, type WelcomeLanguage } from "@/lib/welcome";
import { PinField } from "../parametres/PaymentPin";
import { saveWelcomeLanguage, saveWelcomeName, type WelcomeResult } from "./actions";
import { WelcomeVoice } from "./WelcomeVoice";

/** Bouton principal : le rose plein du site, sur toute la largeur. */
const MAIN = "btn-rose h-13 w-full rounded-full text-base font-semibold disabled:opacity-50";

type StepId = "prenom" | "langue" | "micro" | "code" | "voix" | "donnees" | "recharge";

const STEPS: Record<StepId, { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; text: string }> = {
  prenom: { icon: IconUser, title: "Comment tu t'appelles ?", text: "Tamilya t'appellera par ce prénom." },
  langue: { icon: IconLanguage, title: "Dans quelle langue ?", text: "La langue que Tamilya utilisera avec toi. Tu peux en changer en lui parlant." },
  micro: { icon: IconMic, title: "Parler à Tamilya", text: "Autorise le micro pour lui parler à voix haute. Il ne s'allume que quand tu appuies dessus." },
  code: { icon: IconLock, title: "Ton code de paiement", text: "4 chiffres, demandés avant chaque paiement. Évite ta date de naissance." },
  voix: {
    icon: IconShield,
    title: "Ta voix",
    text: "Tu lis trois phrases pour que Tamilya reconnaisse ta voix. Avant de payer, elle vérifiera ton code et ta voix. Seule une empreinte (des nombres) est gardée, jamais l'enregistrement.",
  },
  donnees: { icon: IconFolder, title: "Où sont tes données", text: "Tes conversations, ton code et tes souvenirs sont rattachés à ton compte." },
  recharge: { icon: IconWallet, title: "Recharger ton compte", text: "Pour payer un repas, une barge ou un service, de 5 à 150 €." },
};

/** Le micro est-il déjà autorisé ? (Sans réponse sûre : on propose l'étape.) */
async function micAllowed(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return true; // aucun micro possible : rien à demander
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}

async function hasVoicePrint(): Promise<boolean> {
  const response = await fetch("/api/voice/print", { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { enrolled?: boolean } | null;
  return body?.enrolled !== false;
}

type Drive = { connected: boolean; email: string | null };

async function readDrive(): Promise<Drive | null> {
  const response = await fetch("/api/drive", { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as Partial<Drive> | null;
  return typeof body?.connected === "boolean" ? { connected: body.connected, email: body.email ?? null } : null;
}

async function hasPayCode(): Promise<boolean> {
  const response = await fetch("/api/wallet/pin", { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { hasPin?: boolean } | null;
  // Lecture impossible : on ne propose pas de créer un code qui existe peut-être déjà.
  return body?.hasPin !== false;
}

type Props = { userId: string; hasName: boolean; wallet: boolean; email: string | null; documents: boolean };

export function WelcomeSteps({ userId, hasName, wallet, email, documents }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepId[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  // Code créé à l'étape d'avant : sert à inscrire la voix sans le redemander.
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Seules les étapes encore à faire sont montrées (app réinstallée, autre appareil…).
  useEffect(() => {
    let cancelled = false;
    const yes = Promise.resolve(true);
    void Promise.all([
      micAllowed(),
      wallet ? hasPayCode() : yes,
      wallet ? hasVoicePrint() : yes,
      documents ? readDrive() : Promise.resolve(null),
    ]).then(([mic, code, voice, driveLink]) => {
      if (cancelled) return;
      setDrive(driveLink);
      const list: StepId[] = [];
      if (!hasName) list.push("prenom");
      list.push("langue");
      if (!mic) list.push("micro");
      if (wallet && !code) list.push("code");
      if (wallet && !voice) list.push("voix");
      if (email) list.push("donnees");
      if (wallet) list.push("recharge");
      setSteps(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hasName, wallet, documents, email]);

  function finish(path = "/") {
    markWelcomeDone(userId);
    router.replace(path);
  }

  function next() {
    setError(null);
    setNotice(null);
    setNewEmail(null);
    if (!steps || index >= steps.length - 1) return finish();
    setIndex(index + 1);
  }

  async function run(task: () => Promise<WelcomeResult>) {
    setBusy(true);
    setError(null);
    const result = await task().catch((): WelcomeResult => ({ ok: false, error: "Connexion impossible : réessaie." }));
    setBusy(false);
    if (result.ok) next();
    else setError(result.error);
  }

  async function askMic() {
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setBusy(false);
      next();
    } catch {
      setBusy(false);
      setError("Micro refusé. Tu pourras l'autoriser plus tard, quand tu voudras parler à Tamilya.");
    }
  }

  async function saveCode(): Promise<WelcomeResult> {
    if (pin !== again) return { ok: false, error: "Les deux codes ne sont pas pareils." };
    const response = await fetch("/api/wallet/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", pin }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (body?.ok) setSavedPin(pin);
    return body?.ok ? { ok: true } : { ok: false, error: body?.error ?? "Connexion impossible : réessaie." };
  }

  /** Nouvelle adresse : Supabase envoie un lien de confirmation (sur l'ancienne et la nouvelle). */
  async function changeEmail() {
    const address = (newEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError("Cette adresse ne semble pas valide.");
    setBusy(true);
    setError(null);
    const supabase = await import("@/lib/supabase/client").then((m) => m.getSupabaseBrowserClient()).catch(() => null);
    const result = supabase
      ? await supabase.auth
          .updateUser({ email: address }, { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/parametres")}` })
          .catch(() => ({ error: new Error("network") }))
      : { error: new Error("network") };
    setBusy(false);
    if (result.error) return setError(result.error.message === "network" ? "Connexion impossible : réessaie." : "Cette adresse ne peut pas être utilisée.");
    setNewEmail(null);
    setNotice("Un lien de confirmation est parti : ouvre-le pour valider ta nouvelle adresse.");
  }

  /** Relier un autre Google Drive : l'ancien lien est retiré, puis Google s'ouvre (retour sur Mes documents). */
  async function changeDrive() {
    setBusy(true);
    if (drive?.connected) {
      const response = await fetch("/api/drive", { method: "DELETE" }).catch(() => null);
      if (!response?.ok) {
        setBusy(false);
        return setError("Le changement a échoué. Réessaie.");
      }
    }
    markWelcomeDone(userId);
    // Route d'API qui renvoie chez Google : pas une page Next, donc une vraie navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/api/drive/connect");
  }

  // Tout est déjà fait : rien à demander.
  useEffect(() => {
    if (steps?.length === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, quand la liste est connue
  }, [steps]);

  if (!steps || steps.length === 0) {
    return <main className="grid min-h-dvh place-items-center bg-bg" aria-busy="true" />;
  }

  const step = steps[index];
  const { icon: Icon, title, text } = STEPS[step];

  const field = "h-14 w-full rounded-2xl bg-bg-muted px-4 text-center text-xl font-medium outline-none transition placeholder:text-fg-muted/60 focus:ring-4 focus:ring-accent-soft";

  let body: ReactNode = null;
  let action: ReactNode = null;
  if (step === "prenom") {
    body = (
      <input
        aria-label="Ton prénom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoComplete="given-name"
        placeholder="Ton prénom"
        autoFocus
        className={field}
      />
    );
    action = (
      <button type="submit" disabled={busy || !name.trim()} className={MAIN}>
        Continuer
      </button>
    );
  } else if (step === "langue") {
    body = (
      <div className="grid gap-3">
        {(Object.keys(WELCOME_LANGUAGES) as WelcomeLanguage[]).map((language) => (
          <button
            key={language}
            type="button"
            disabled={busy}
            onClick={() => void run(() => saveWelcomeLanguage(language))}
            className="h-14 rounded-2xl bg-bg-muted text-lg font-medium transition active:scale-[0.98] hover:bg-accent-soft hover:text-accent disabled:opacity-50"
          >
            {WELCOME_LANGUAGES[language].label}
          </button>
        ))}
      </div>
    );
  } else if (step === "micro") {
    action = (
      <button type="button" disabled={busy} onClick={() => void askMic()} className={MAIN}>
        Autoriser le micro
      </button>
    );
  } else if (step === "code") {
    body = (
      <div className="flex justify-center gap-6">
        <PinField label="Code" value={pin} onChange={setPin} autoFocus />
        <PinField label="Encore une fois" value={again} onChange={setAgain} />
      </div>
    );
    action = (
      <button type="submit" disabled={busy || pin.length !== 4 || again.length !== 4} className={MAIN}>
        Créer mon code
      </button>
    );
  } else if (step === "voix") {
    if (voiceConsent) {
      body = <WelcomeVoice knownPin={savedPin} mainClass={MAIN} onDone={next} />;
    } else {
      action = (
        <button type="button" onClick={() => setVoiceConsent(true)} className={MAIN}>
          J&apos;accepte, on commence
        </button>
      );
    }
  } else if (step === "donnees") {
    const row = "flex items-center gap-3 px-4 py-3.5 text-left";
    const link = "shrink-0 text-sm font-medium text-accent disabled:opacity-50";
    body = (
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-bg-muted">
        <div className={row}>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-fg-muted">Ton compte</span>
            <span className="block truncate text-[0.95rem] font-medium">{email ? maskEmail(email) : "—"}</span>
          </span>
          {newEmail === null ? (
            <button type="button" disabled={busy} onClick={() => setNewEmail("")} className={link}>
              Changer
            </button>
          ) : null}
        </div>
        {newEmail !== null ? (
          <div className="flex items-center gap-2 px-3 py-3">
            <input
              type="email"
              aria-label="Nouvelle adresse e-mail"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Nouvelle adresse"
              autoComplete="email"
              inputMode="email"
              autoFocus
              className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-base outline-none focus:ring-4 focus:ring-accent-soft"
            />
            <button
              type="button"
              disabled={busy || !newEmail.trim()}
              onClick={() => void changeEmail()}
              className="btn-rose h-11 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-50"
            >
              Valider
            </button>
          </div>
        ) : null}
        {documents ? (
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-fg-muted">Tes documents</span>
              <span className="block truncate text-[0.95rem] font-medium">
                {drive?.connected ? `Google Drive de ${drive.email ? maskEmail(drive.email) : "ton compte Google"}` : "Google Drive pas encore relié"}
              </span>
            </span>
            <button type="button" disabled={busy} onClick={() => void changeDrive()} className={link}>
              {drive?.connected ? "Changer" : "Relier"}
            </button>
          </div>
        ) : null}
      </div>
    );
    action = (
      <button type="button" onClick={next} className={MAIN}>
        Continuer
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => finish("/portefeuille")} className={MAIN}>
        Recharger
      </button>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <form
        className="relative z-10 mx-auto flex h-full w-full max-w-md flex-col px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (step === "prenom") void run(() => saveWelcomeName(name));
          else if (step === "code") void run(saveCode);
        }}
      >
        {/* Barres d'étapes, comme des stories : faites pleines, celle en cours se remplit, les suivantes grises. */}
        <div className="flex gap-1.5" role="progressbar" aria-label="Premiers pas" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
          {steps.map((id, i) => (
            <span key={id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-fg/12">
              <span
                className={`block h-full rounded-full bg-fg ${i < index ? "w-full" : i === index ? "bienvenue-fill" : "w-0"}`}
              />
            </span>
          ))}
        </div>

        <div key={step} className="bienvenue-step flex flex-1 flex-col items-center justify-center text-center">
          <span className="grid size-20 place-items-center rounded-[1.6rem] bg-accent text-accent-fg shadow-[0_12px_32px_-12px_var(--accent)]">
            <Icon width={36} height={36} />
          </span>
          <h1 className="mt-7 text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-xs text-[0.95rem] leading-relaxed text-fg-muted">{text}</p>
          {body ? <div className="mt-8 w-full">{body}</div> : null}
          {notice ? (
            <p role="status" className="mt-4 text-sm text-success">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-4">
          {action}
          <button type="button" disabled={busy} onClick={next} className="px-4 py-1 text-sm text-fg-muted transition hover:text-fg disabled:opacity-50">
            Plus tard
          </button>
        </div>
      </form>
    </main>
  );
}
