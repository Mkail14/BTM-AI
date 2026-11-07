"use client";

import { useContext, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { boardDone } from "@/lib/voice-live/stage";
import { checkFields, EMPTY_FIELDS, todayMayotte, type AttestationFields } from "@/lib/attestation/fields";
import { readOwnInfo, SIGNATURE_HELP_EVENT } from "@/lib/attestation/intent";
import { pdfBase64 } from "@/lib/attestation/pdf-base64";
import { applyPrefill, type AttestationPrefill } from "@/lib/attestation/prefill";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";
import { removeSignatureBackground, type SignatureProblem } from "@/lib/attestation/signature";
import { APP_USER_AGENT } from "@/components/ui/ThemeScript";
import { AttestationAsk } from "./attestation-ask";
import { AttestationPreview } from "./AttestationPreview";

declare global {
  interface Window {
    /** Application Android : enregistre le PDF, car elle ne peut pas ouvrir un lien blob:. */
    TamilyaFiles?: { savePdf?: (name: string, base64: string) => void };
  }
}

const PERSONA = "var(--persona,var(--accent))";
const MAX_PHOTO_SIDE = 1400;

type Person = "hebergeant" | "heberge";
type Step = "role" | "form" | "signatures" | "rappel" | "papier" | "done" | "moved";
type Signature = { bytes: Uint8Array; url: string };

const PERSON_LABEL: Record<Person, string> = { hebergeant: "L'hébergeant", heberge: "La personne hébergée" };

const PROBLEMS: Record<SignatureProblem | "unreadable", string> = {
  empty: "Aucune signature visible. Signe en noir ou en bleu foncé et reprends la photo de plus près.",
  not_white_sheet: "Le fond n'est pas assez blanc. Reprends la photo sur une feuille blanche bien éclairée.",
  unreadable: "Cette image ne s'ouvre pas. Essaie avec une autre photo.",
};

/** Formulaire rempli, repris par le bloc qui revient sous l'explication. Reste sur l'appareil, en mémoire. */
let filled: AttestationFields | null = null;

/** Photo → PNG à fond transparent. Tout se passe sur l'appareil : rien n'est envoyé au serveur. */
async function cleanSignature(file: File): Promise<{ ok: true; signature: Signature } | { ok: false; problem: SignatureProblem | "unreadable" }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { ok: false, problem: "unreadable" };
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const result = removeSignatureBackground(context.getImageData(0, 0, canvas.width, canvas.height));
  if (!result.ok) return result;

  const { data, width, height } = result.image;
  canvas.width = width;
  canvas.height = height;
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return { ok: false, problem: "unreadable" };
  return { ok: true, signature: { bytes: new Uint8Array(await blob.arrayBuffer()), url: canvas.toDataURL("image/png") } };
}

type TextKey = Exclude<keyof AttestationFields, "civilite">;

/**
 * Attestation d'hébergement dans la conversation (bloc ```attestation-hebergement```).
 * Le formulaire, les signatures et le PDF restent sur l'appareil : rien n'est envoyé
 * ni gardé, et le rappel à la loi vient avant que les signatures soient posées.
 */
export function AttestationHebergement({ resume = false, mode = "" }: { resume?: boolean; mode?: string }) {
  // « Mets mes infos » : on remplit avec le compte. Sinon le formulaire reste vide.
  const own = readOwnInfo(mode, useContext(AttestationAsk));
  const wantsOwn = Boolean(own) && !resume;
  const ownSide = wantsOwn ? (own?.role ?? null) : null;
  const uid = useId();
  const [fields, setFields] = useState<AttestationFields>(() => (resume && filled) || { ...EMPTY_FIELDS, faitLe: todayMayotte() });
  const [step, setStep] = useState<Step>(resume && filled ? "signatures" : wantsOwn && !ownSide ? "role" : "form");
  const [role, setRole] = useState<Person | null>(ownSide);
  const [fromAccount, setFromAccount] = useState(false);
  /** Ce que le compte connaît déjà, seulement si la personne a demandé ses infos. */
  const account = useRef<Promise<AttestationPrefill | null> | null>(null);
  const [touched, setTouched] = useState(false);
  const [signatures, setSignatures] = useState<Partial<Record<Person, Signature>>>({});
  const [photoErrors, setPhotoErrors] = useState<Partial<Record<Person, string>>>({});
  const [reading, setReading] = useState<Person | null>(null);
  const [confirmed, setConfirmed] = useState<Record<Person, boolean>>({ hebergeant: false, heberge: false });
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [onPaper, setOnPaper] = useState(false);
  const [driveLinked, setDriveLinked] = useState(false);
  /** Rangement dans Mes documents : en cours, fait, ou le message d'erreur. */
  const [banked, setBanked] = useState<string | null>(null);
  const [mail, setMail] = useState<{ status: "idle" | "sending" | "sent" | "error"; text?: string }>({ status: "idle" });
  const fileUrl = useRef<string | null>(null);
  const root = useRef<HTMLElement>(null);
  /** Dernière version rangée : revenir en arrière sans rien changer ne crée pas un doublon sur le Drive. */
  const bankedVersion = useRef<string | null>(null);
  const signatureHelpSent = useRef(resume);

  useEffect(
    () => () => {
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    },
    [],
  );

  useEffect(() => {
    if (!wantsOwn) return;
    const known = fetch("/api/attestation/prefill", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ prefill: AttestationPrefill }>) : null))
      .then((data) => data?.prefill ?? null)
      .catch(() => null);
    account.current = known;
    if (!ownSide) return;
    void known.then((prefill) => {
      if (!prefill) return;
      setFields((current) => applyPrefill(current, ownSide, prefill));
      if (Object.values(prefill).some(Boolean)) setFromAccount(true);
    });
  }, [wantsOwn, ownSide]);

  const choose = (person: Person) => {
    setRole(person);
    setStep("form");
    void account.current?.then((known) => {
      if (!known) return;
      // Changement de rôle : on repart d'un formulaire vide, sinon son nom resterait des deux côtés.
      const changed = role !== null && role !== person;
      setFields((current) => applyPrefill(changed ? { ...EMPTY_FIELDS, faitLe: current.faitLe } : current, person, known));
      if (Object.values(known).some(Boolean)) setFromAccount(true);
    });
  };

  const errors = checkFields(fields, todayMayotte());
  const edit = (key: keyof AttestationFields, value: string) => setFields((f) => ({ ...f, [key]: value }));
  const bothSigned = Boolean(signatures.hebergeant && signatures.heberge);
  const nameOf = (person: Person) =>
    (person === "hebergeant" ? `${fields.hebergeantPrenom} ${fields.hebergeantNom}` : `${fields.hebergePrenom} ${fields.hebergeNom}`).trim();

  const pick = async (person: Person, event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    event.target.value = "";
    if (!photo) return;
    setReading(person);
    setPhotoErrors((e) => ({ ...e, [person]: undefined }));
    const result = await cleanSignature(photo);
    setReading(null);
    // Une signature changée doit être confirmée de nouveau.
    setConfirmed((c) => ({ ...c, [person]: false }));
    if (result.ok) setSignatures((s) => ({ ...s, [person]: result.signature }));
    else {
      setSignatures((s) => ({ ...s, [person]: undefined }));
      setPhotoErrors((e) => ({ ...e, [person]: PROBLEMS[result.problem] }));
    }
  };

  /** paper : document sans signature, à imprimer et à signer à la main par chacun. */
  const build = async (paper = false) => {
    const signed = signatures.hebergeant && signatures.heberge && confirmed.hebergeant && confirmed.heberge;
    if (!paper && !signed) return;
    setBuilding(true);
    setBuildError(false);
    try {
      // Bibliothèque PDF chargée seulement ici : elle est lourde et sert rarement.
      const { attestationFileName, buildAttestationPdf } = await import("@/lib/attestation/pdf");
      const bytes = await buildAttestationPdf(
        fields,
        paper || !signatures.hebergeant || !signatures.heberge ? undefined : { hebergeant: signatures.hebergeant.bytes, heberge: signatures.heberge.bytes },
      );
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      const created = { url: fileUrl.current, name: attestationFileName(fields), blob };
      const version = JSON.stringify([fields, paper, signatures.hebergeant?.url, signatures.heberge?.url]);
      setFile(created);
      setOnPaper(paper);
      if (bankedVersion.current !== version) setBanked(null);
      setMail({ status: "idle" });
      setStep("done");
      boardDone(root.current);
      // Drive relié : la copie part toute seule dans Mes documents (dossier Logement).
      void fetch("/api/drive", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { connected?: boolean } | null) => {
          const linked = Boolean(data?.connected);
          setDriveLinked(linked);
          if (linked && bankedVersion.current !== version) void saveToDocuments(created, version);
        })
        .catch(() => {});
    } catch {
      setBuildError(true);
    } finally {
      setBuilding(false);
    }
  };

  const saveWithApp = async () => {
    if (!file) return;
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    window.TamilyaFiles?.savePdf?.(file.name, pdfBase64(bytes));
  };

  const saveToDocuments = async (target: { name: string; blob: Blob }, version: string) => {
    setBanked("sending");
    const problem = await uploadToDrive(new File([target.blob], target.name, { type: "application/pdf" }), "logement");
    if (!problem) bankedVersion.current = version;
    setBanked(problem ? DRIVE_UPLOAD_MESSAGES[problem] : "done");
  };

  const sendByMail = async () => {
    if (!file) return;
    setMail({ status: "sending" });
    // Pas la version papier : signée dans l'appli par les deux personnes (le mail le dit).
    const response = await fetch(`/api/attestation/email${onPaper ? "" : "?signee=1"}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file.blob }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { to?: string; error?: string } | null | undefined;
    if (response?.ok) setMail({ status: "sent", text: `Envoyée à ${data?.to}` });
    else setMail({ status: "error", text: data?.error ?? "Le mail n'est pas parti. Réessaie." });
  };

  // Nom complet de chaque champ : « Nom » existe deux fois, Tamilya doit savoir lequel elle remplit à la voix.
  const input = (key: TextKey, label: string, options: { type?: "text" | "date"; wide?: boolean; numeric?: boolean; full?: string } = {}) => {
    const id = `${uid}-${key}`;
    const error = touched ? errors[key] : undefined;
    return (
      <label key={key} htmlFor={id} className={options.wide ? "col-span-2" : "min-w-0"}>
        <span className="block text-xs text-fg-muted">{label}</span>
        <input
          id={id}
          type={options.type ?? "text"}
          inputMode={options.numeric ? "numeric" : undefined}
          autoComplete="off"
          aria-label={options.full}
          value={fields[key]}
          onChange={(e) => edit(key, e.target.value)}
          aria-invalid={Boolean(error)}
          className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg px-3 py-2"
        />
        {error ? <span className="mt-0.5 block text-[11px] text-danger">{error}</span> : null}
      </label>
    );
  };

  const primary = "flex w-full items-center justify-center rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45";

  const header = (title: string, back?: Step) => (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      {back ? (
        <button type="button" onClick={() => setStep(back)} className="text-sm text-fg-muted hover:underline">
          Retour
        </button>
      ) : null}
      <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
    </div>
  );

  const shell = (content: React.ReactNode) => (
    <section ref={root} aria-label="Attestation d'hébergement" className="not-prose my-3 overflow-hidden rounded-2xl border border-border bg-bg text-sm">
      {content}
    </section>
  );

  if (step === "role") {
    return shell(
      <>
        {header("Attestation d'hébergement")}
        <div className="booking-step space-y-2 p-4">
          <p className="font-medium">Dans cette attestation, tu es…</p>
          <button type="button" onClick={() => choose("heberge")} className="w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle">
            Je suis la personne hébergée
          </button>
          <button type="button" onClick={() => choose("hebergeant")} className="w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle">
            Je suis la personne qui héberge
          </button>
          <p className="text-center text-[11px] text-fg-muted">Je remplis ton côté avec les informations de ton compte.</p>
        </div>
      </>,
    );
  }

  if (step === "form") {
    const civility = touched ? errors.civilite : undefined;
    const you = (person: Person) => (role === person ? " (toi)" : "");
    return shell(
      <>
        {header("Attestation d'hébergement", wantsOwn ? "role" : undefined)}
        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          {fromAccount ? <p className="col-span-2 text-xs text-fg-muted">Rempli avec ton compte : vérifie, puis complète ce qui manque.</p> : null}
          <p className="col-span-2 text-xs font-semibold tracking-wider text-fg-muted uppercase">La personne qui héberge{you("hebergeant")}</p>
          {input("hebergeantNom", "Nom", { full: "Nom de l'hébergeant" })}
          {input("hebergeantPrenom", "Prénom", { full: "Prénom de l'hébergeant" })}
          {input("hebergeantNaissanceDate", "Né(e) le", { type: "date", full: "Date de naissance de l'hébergeant" })}
          {input("hebergeantNaissanceLieu", "À", { full: "Lieu de naissance de l'hébergeant" })}
          {input("adresse", "Adresse", { wide: true, full: "Adresse du logement" })}
          {input("codePostal", "Code postal", { numeric: true })}
          {input("ville", "Ville")}

          <p className="col-span-2 mt-3 text-xs font-semibold tracking-wider text-fg-muted uppercase">La personne hébergée{you("heberge")}</p>
          <fieldset className="col-span-2">
            <legend className="sr-only">Civilité</legend>
            <div className="flex gap-4">
              {(["M.", "Mme"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="radio" name={`${uid}-civilite`} checked={fields.civilite === c} onChange={() => edit("civilite", c)} />
                  {c}
                </label>
              ))}
            </div>
            {civility ? <span className="mt-0.5 block text-[11px] text-danger">{civility}</span> : null}
          </fieldset>
          {input("hebergeNom", "Nom", { full: "Nom de la personne hébergée" })}
          {input("hebergePrenom", "Prénom", { full: "Prénom de la personne hébergée" })}
          {input("hebergeNaissanceDate", "Né(e) le", { type: "date", full: "Date de naissance de la personne hébergée" })}
          {input("hebergeNaissanceLieu", "À", { full: "Lieu de naissance de la personne hébergée" })}
          {input("depuis", "Hébergé(e) depuis le", { type: "date", wide: true })}

          <p className="col-span-2 mt-3 text-xs font-semibold tracking-wider text-fg-muted uppercase">Le document</p>
          {input("faitA", "Fait à")}
          {input("faitLe", "Le", { type: "date", full: "Date du document" })}
        </div>
        <div className="p-4">
          <button
            type="button"
            className={primary}
            style={{ background: PERSONA }}
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length > 0) return;
              // Une seule fois, même si la personne revient au formulaire.
              if (signatureHelpSent.current) return setStep("signatures");
              signatureHelpSent.current = true;
              filled = fields;
              // La conversation écrit l'explication et remet le bloc dessous ; ailleurs, on reste ici.
              const moved = !window.dispatchEvent(new Event(SIGNATURE_HELP_EVENT, { cancelable: true }));
              setStep(moved ? "moved" : "signatures");
              if (moved) boardDone(root.current);
            }}
          >
            Continuer
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle"
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length === 0) setStep("papier");
            }}
          >
            Préparer pour signer à la main
          </button>
          <p className="mt-2 text-center text-[11px] text-fg-muted">Ce modèle dit que l&apos;hébergement est gratuit. Rien n&apos;est envoyé ni gardé par Tamilya.</p>
        </div>
      </>,
    );
  }

  if (step === "moved") {
    return shell(<p className="p-4 text-fg-muted">Formulaire rempli. La suite est juste en dessous.</p>);
  }

  if (step === "signatures") {
    return shell(
      <>
        {header("Les deux signatures", "form")}
        <div className="space-y-3 px-4 pt-3">
          <p className="text-xs text-fg-muted">
            Chaque personne signe elle-même sur une feuille blanche, puis prend la signature en photo, de près et bien éclairée. Le fond est enlevé tout seul.
          </p>
          {(["hebergeant", "heberge"] as const).map((person) => {
            const signature = signatures[person];
            const error = photoErrors[person];
            return (
              <div key={person} className="rounded-2xl border border-border p-3">
                {/* Nom et bouton à gauche, photo de la signature à droite. */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{PERSON_LABEL[person]}</p>
                    <p className="truncate text-xs text-fg-muted">{nameOf(person)}</p>
                    <label data-voice-never="" className="mt-2 block cursor-pointer rounded-full border border-border px-3 py-2 text-center text-sm font-medium hover:bg-bg-subtle">
                      {reading === person ? "Préparation…" : signature ? "Changer la photo" : "Ajouter la photo"}
                      <input type="file" accept="image/*" className="sr-only" disabled={reading !== null} onChange={(e) => void pick(person, e)} />
                    </label>
                  </div>
                  <div className="grid h-20 w-28 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-white p-1.5 sm:w-36">
                    {signature ? (
                      // Image locale en data: : le composant Image de Next ne s'applique pas ici.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={signature.url} alt={`Signature : ${nameOf(person)}`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-center text-[11px] text-neutral-500">Signature</span>
                    )}
                  </div>
                </div>
                {error ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="p-4">
          <button type="button" disabled={!bothSigned} className={primary} style={{ background: PERSONA }} onClick={() => setStep("rappel")}>
            Continuer
          </button>
        </div>
      </>,
    );
  }

  if (step === "rappel") {
    return shell(
      <>
        {header("Rappel de la loi", "signatures")}
        <div className="space-y-3 px-4 pt-3">
          <div role="alert" className="rounded-2xl bg-bg-subtle p-3">
            <p className="font-semibold">Une fausse attestation est un délit.</p>
            <p className="mt-1 text-xs">
              Faire ou utiliser une attestation fausse, ou signer à la place de quelqu&apos;un, est puni jusqu&apos;à 1 an de prison et 15 000 € d&apos;amende (article 441-7 du Code pénal).
            </p>
          </div>
          {(["hebergeant", "heberge"] as const).map((person) => (
            <label key={person} data-voice-never="" className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed[person]}
                onChange={(e) => setConfirmed((c) => ({ ...c, [person]: e.target.checked }))}
              />
              <span>
                {person === "hebergeant"
                  ? `${nameOf(person)} certifie héberger gratuitement ${nameOf("heberge")} à cette adresse, et a fait sa signature lui-même ou elle-même.`
                  : `${nameOf(person)} certifie être hébergé(e) gratuitement à cette adresse, et a fait sa signature lui-même ou elle-même.`}
              </span>
            </label>
          ))}
        </div>
        <div className="p-4">
          {buildError ? (
            <p role="alert" className="mb-2 text-center text-xs text-danger">
              Le document n&apos;a pas pu être créé. Réessaie, ou change les photos de signature.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!confirmed.hebergeant || !confirmed.heberge || building}
            className={primary}
            style={{ background: PERSONA }}
            onClick={() => void build()}
          >
            {building ? "Création…" : "Coller les signatures et créer le PDF"}
          </button>
        </div>
      </>,
    );
  }

  if (step === "papier") {
    return shell(
      <>
        {header("Rappel de la loi", "form")}
        <div className="space-y-3 px-4 pt-3">
          <div role="alert" className="rounded-2xl bg-bg-subtle p-3">
            <p className="font-semibold">Une fausse attestation est un délit.</p>
            <p className="mt-1 text-xs">
              Faire ou utiliser une attestation fausse, ou signer à la place de quelqu&apos;un, est puni par la loi. Chaque personne relit le document imprimé et signe elle-même, à la main.
            </p>
          </div>
        </div>
        <div className="p-4">
          {buildError ? (
            <p role="alert" className="mb-2 text-center text-xs text-danger">
              Le document n&apos;a pas pu être créé. Réessaie.
            </p>
          ) : null}
          <button type="button" disabled={building} className={primary} style={{ background: PERSONA }} onClick={() => void build(true)}>
            {building ? "Création…" : "Créer le PDF à imprimer"}
          </button>
        </div>
      </>,
    );
  }

  const saveInApp = window.TamilyaFiles?.savePdf ? () => void saveWithApp() : null;
  const oldApp = !saveInApp && navigator.userAgent.includes(APP_USER_AGENT);
  return shell(
    <>
      {header("Vérifie ton attestation", "form")}
      <div className="booking-step space-y-2 p-4">
        <AttestationPreview
          fields={fields}
          signatures={onPaper ? {} : { hebergeant: signatures.hebergeant?.url, heberge: signatures.heberge?.url }}
          names={{ hebergeant: nameOf("hebergeant"), heberge: nameOf("heberge") }}
        />
        {saveInApp ? (
          <button type="button" onClick={saveInApp} className={primary} style={{ background: PERSONA }}>
            Enregistrer le PDF
          </button>
        ) : oldApp ? (
          <p role="alert" className="text-center text-xs text-danger">
            Mets à jour l&apos;application Tamilya pour enregistrer ce document, ou ouvre tamilya.yt dans ton navigateur.
          </p>
        ) : file ? (
          <a href={file.url} download={file.name} className={primary} style={{ background: PERSONA }}>
            Télécharger le PDF
          </a>
        ) : null}
        {driveLinked && banked === "sending" ? <p className="text-center text-xs text-fg-muted">Rangement dans Mes documents…</p> : null}
        {driveLinked && banked === "done" ? <p className="text-center text-xs text-fg-muted">Rangé dans Mes documents (dossier Logement)</p> : null}
        {driveLinked && file && banked && banked !== "sending" && banked !== "done" ? (
          <>
            <p role="alert" className="text-center text-xs text-danger">
              {banked}
            </p>
            <button
              type="button"
              onClick={() => void saveToDocuments(file, JSON.stringify([fields, onPaper, signatures.hebergeant?.url, signatures.heberge?.url]))}
              className="w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle"
            >
              Réessayer de ranger dans Mes documents
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void sendByMail()}
          disabled={mail.status === "sending" || mail.status === "sent"}
          className="w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle disabled:opacity-60"
        >
          {mail.status === "sending" ? "Envoi…" : mail.status === "sent" ? mail.text : "Envoyer par mail"}
        </button>
        {mail.status === "error" ? (
          <p role="alert" className="text-center text-xs text-danger">
            {mail.text}
          </p>
        ) : null}
        <p className="text-center text-[11px] text-fg-muted">
          {onPaper ? "Imprime ce document : chaque personne le relit et signe elle-même à la main. " : ""}Joins la copie de la pièce d&apos;identité et un justificatif de domicile de l&apos;hébergeant.{banked === "done" ? "" : " Le document disparaît si tu quittes cette page."}
        </p>
      </div>
    </>,
  );
}
