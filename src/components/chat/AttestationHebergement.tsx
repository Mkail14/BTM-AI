"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { checkFields, EMPTY_FIELDS, todayMayotte, type AttestationFields } from "@/lib/attestation/fields";
import { pdfBase64 } from "@/lib/attestation/pdf-base64";
import { removeSignatureBackground, type SignatureProblem } from "@/lib/attestation/signature";
import { APP_USER_AGENT } from "@/components/ui/ThemeScript";

declare global {
  interface Window {
    /** Application Android : enregistre le PDF, car elle ne peut pas ouvrir un lien blob:. */
    TamilyaFiles?: { savePdf?: (name: string, base64: string) => void };
  }
}

const PERSONA = "var(--persona,var(--accent))";
const MAX_PHOTO_SIDE = 1400;

type Person = "hebergeant" | "heberge";
type Step = "form" | "signatures" | "rappel" | "done";
type Signature = { bytes: Uint8Array; url: string };

const PERSON_LABEL: Record<Person, string> = { hebergeant: "L'hébergeant", heberge: "La personne hébergée" };

const PROBLEMS: Record<SignatureProblem | "unreadable", string> = {
  empty: "Aucune signature visible. Signe en noir ou en bleu foncé et reprends la photo de plus près.",
  not_white_sheet: "Le fond n'est pas assez blanc. Reprends la photo sur une feuille blanche bien éclairée.",
  unreadable: "Cette image ne s'ouvre pas. Essaie avec une autre photo.",
};

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
export function AttestationHebergement() {
  const uid = useId();
  const [fields, setFields] = useState<AttestationFields>(() => ({ ...EMPTY_FIELDS, faitLe: todayMayotte() }));
  const [step, setStep] = useState<Step>("form");
  const [touched, setTouched] = useState(false);
  const [signatures, setSignatures] = useState<Partial<Record<Person, Signature>>>({});
  const [photoErrors, setPhotoErrors] = useState<Partial<Record<Person, string>>>({});
  const [reading, setReading] = useState<Person | null>(null);
  const [confirmed, setConfirmed] = useState<Record<Person, boolean>>({ hebergeant: false, heberge: false });
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const fileUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    },
    [],
  );

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

  const build = async () => {
    if (!signatures.hebergeant || !signatures.heberge || !confirmed.hebergeant || !confirmed.heberge) return;
    setBuilding(true);
    setBuildError(false);
    try {
      // Bibliothèque PDF chargée seulement ici : elle est lourde et sert rarement.
      const { attestationFileName, buildAttestationPdf } = await import("@/lib/attestation/pdf");
      const bytes = await buildAttestationPdf(fields, { hebergeant: signatures.hebergeant.bytes, heberge: signatures.heberge.bytes });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      setFile({ url: fileUrl.current, name: attestationFileName(fields), blob });
      setStep("done");
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

  const share = async () => {
    if (!file) return;
    const pdf = new File([file.blob], file.name, { type: "application/pdf" });
    try {
      await navigator.share({ files: [pdf], title: "Attestation d'hébergement" });
    } catch {
      // Partage annulé : le bouton de téléchargement reste là.
    }
  };

  const input = (key: TextKey, label: string, options: { type?: "text" | "date"; wide?: boolean; numeric?: boolean } = {}) => {
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
    <section aria-label="Attestation d'hébergement" className="not-prose my-3 overflow-hidden rounded-2xl border border-border bg-bg text-sm">
      {content}
    </section>
  );

  if (step === "form") {
    const civility = touched ? errors.civilite : undefined;
    return shell(
      <>
        {header("Attestation d'hébergement")}
        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          <p className="col-span-2 text-xs font-semibold tracking-wider text-fg-muted uppercase">La personne qui héberge</p>
          {input("hebergeantNom", "Nom")}
          {input("hebergeantPrenom", "Prénom")}
          {input("hebergeantNaissanceDate", "Né(e) le", { type: "date" })}
          {input("hebergeantNaissanceLieu", "À")}
          {input("adresse", "Adresse", { wide: true })}
          {input("codePostal", "Code postal", { numeric: true })}
          {input("ville", "Ville")}

          <p className="col-span-2 mt-3 text-xs font-semibold tracking-wider text-fg-muted uppercase">La personne hébergée</p>
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
          {input("hebergeNom", "Nom")}
          {input("hebergePrenom", "Prénom")}
          {input("hebergeNaissanceDate", "Né(e) le", { type: "date" })}
          {input("hebergeNaissanceLieu", "À")}
          {input("depuis", "Hébergé(e) depuis le", { type: "date", wide: true })}

          <p className="col-span-2 mt-3 text-xs font-semibold tracking-wider text-fg-muted uppercase">Le document</p>
          {input("faitA", "Fait à")}
          {input("faitLe", "Le", { type: "date" })}
        </div>
        <div className="p-4">
          <button
            type="button"
            className={primary}
            style={{ background: PERSONA }}
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length === 0) setStep("signatures");
            }}
          >
            Continuer
          </button>
          <p className="mt-2 text-center text-[11px] text-fg-muted">Ce modèle dit que l&apos;hébergement est gratuit. Rien n&apos;est envoyé ni gardé par Tamilya.</p>
        </div>
      </>,
    );
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
                <p className="font-medium">{PERSON_LABEL[person]}</p>
                <p className="truncate text-xs text-fg-muted">{nameOf(person)}</p>
                {signature ? (
                  // Image locale en data: : le composant Image de Next ne s'applique pas ici.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signature.url} alt={`Signature : ${nameOf(person)}`} className="mt-2 h-20 w-full rounded-xl bg-white object-contain p-2" />
                ) : null}
                {error ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
                <label className="mt-2 block cursor-pointer rounded-full border border-border px-3 py-2 text-center text-sm font-medium hover:bg-bg-subtle">
                  {reading === person ? "Préparation…" : signature ? "Changer la photo" : "Ajouter la photo"}
                  <input type="file" accept="image/*" className="sr-only" disabled={reading !== null} onChange={(e) => void pick(person, e)} />
                </label>
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
            <label key={person} className="flex items-start gap-2 text-xs">
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

  const saveInApp = window.TamilyaFiles?.savePdf ? () => void saveWithApp() : null;
  const oldApp = !saveInApp && navigator.userAgent.includes(APP_USER_AGENT);
  const canShare = file && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([file.blob], file.name, { type: "application/pdf" })] });
  return shell(
    <>
      {header("Attestation prête")}
      <div className="booking-step space-y-2 p-4">
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
        {canShare ? (
          <button type="button" onClick={() => void share()} className="w-full rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle">
            Partager
          </button>
        ) : null}
        <p className="text-center text-[11px] text-fg-muted">
          Joins la copie de la pièce d&apos;identité et un justificatif de domicile de l&apos;hébergeant. Le document disparaît si tu quittes cette page.
        </p>
      </div>
    </>,
  );
}
