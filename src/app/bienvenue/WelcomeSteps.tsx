"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconLanguage, IconLock, IconMic, IconUser, IconWallet } from "@/components/ui/icons";
import { markWelcomeDone, WELCOME_LANGUAGES, type WelcomeLanguage } from "@/lib/welcome";
import { PinField } from "../parametres/PaymentPin";
import { INPUT_CLASS, PRIMARY, SECONDARY } from "../parametres/ui";
import { saveWelcomeLanguage, saveWelcomeName, type WelcomeResult } from "./actions";

type StepId = "prenom" | "langue" | "micro" | "code" | "recharge";

const STEPS: Record<StepId, { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; text: string }> = {
  prenom: { icon: IconUser, title: "Comment tu t'appelles ?", text: "Tamilya t'appellera par ce prénom." },
  langue: { icon: IconLanguage, title: "Dans quelle langue ?", text: "La langue que Tamilya utilisera avec toi. Tu peux en changer en lui parlant." },
  micro: { icon: IconMic, title: "Parler à Tamilya", text: "Autorise le micro pour lui parler à voix haute. Il ne s'allume que quand tu appuies dessus." },
  code: { icon: IconLock, title: "Ton code de paiement", text: "4 chiffres, demandés avant chaque paiement. Évite ta date de naissance." },
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

async function hasPayCode(): Promise<boolean> {
  const response = await fetch("/api/wallet/pin", { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { hasPin?: boolean } | null;
  // Lecture impossible : on ne propose pas de créer un code qui existe peut-être déjà.
  return body?.hasPin !== false;
}

export function WelcomeSteps({ userId, hasName, wallet }: { userId: string; hasName: boolean; wallet: boolean }) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepId[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");

  // Seules les étapes encore à faire sont montrées (app réinstallée, autre appareil…).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([micAllowed(), wallet ? hasPayCode() : Promise.resolve(true)]).then(([mic, code]) => {
      if (cancelled) return;
      const list: StepId[] = [];
      if (!hasName) list.push("prenom");
      list.push("langue");
      if (!mic) list.push("micro");
      if (wallet && !code) list.push("code");
      if (wallet) list.push("recharge");
      setSteps(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hasName, wallet]);

  function finish(path = "/") {
    markWelcomeDone(userId);
    router.replace(path);
  }

  function next() {
    setError(null);
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
    return body?.ok ? { ok: true } : { ok: false, error: body?.error ?? "Connexion impossible : réessaie." };
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
  const last = index === steps.length - 1;

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
        className={INPUT_CLASS}
      />
    );
    action = (
      <button type="submit" disabled={busy || !name.trim()} className={PRIMARY}>
        Continuer
      </button>
    );
  } else if (step === "langue") {
    body = (
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(WELCOME_LANGUAGES) as WelcomeLanguage[]).map((language) => (
          <button
            key={language}
            type="button"
            disabled={busy}
            onClick={() => void run(() => saveWelcomeLanguage(language))}
            className="h-14 rounded-2xl border border-border bg-bg text-base font-medium transition hover:border-accent hover:bg-accent-soft disabled:opacity-50"
          >
            {WELCOME_LANGUAGES[language].label}
          </button>
        ))}
      </div>
    );
  } else if (step === "micro") {
    action = (
      <button type="button" disabled={busy} onClick={() => void askMic()} className={PRIMARY}>
        Autoriser le micro
      </button>
    );
  } else if (step === "code") {
    body = (
      <div className="flex justify-center gap-4">
        <PinField label="Code" value={pin} onChange={setPin} autoFocus />
        <PinField label="Encore une fois" value={again} onChange={setAgain} />
      </div>
    );
    action = (
      <button type="submit" disabled={busy || pin.length !== 4 || again.length !== 4} className={PRIMARY}>
        Créer mon code
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => finish("/portefeuille")} className={PRIMARY}>
        Recharger
      </button>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-[max(1.5rem,env(safe-area-inset-top))] text-fg">
      <form
        key={step}
        className="w-full max-w-sm text-center"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (step === "prenom") void run(() => saveWelcomeName(name));
          else if (step === "code") void run(saveCode);
        }}
      >
        <div className="mb-8 flex justify-center gap-1.5" aria-label={`Étape ${index + 1} sur ${steps.length}`}>
          {steps.map((id, i) => (
            <span key={id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-accent" : "w-1.5 bg-border"}`} />
          ))}
        </div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon width={26} height={26} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
        {body ? <div className="mt-6 text-left">{body}</div> : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col items-center gap-3">
          {action}
          <button type="button" disabled={busy} onClick={next} className={SECONDARY}>
            {last ? "Plus tard, aller à l'accueil" : "Plus tard"}
          </button>
        </div>
      </form>
    </main>
  );
}
