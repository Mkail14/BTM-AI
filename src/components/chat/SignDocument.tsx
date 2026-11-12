"use client";

import { Camera, FileUp, LoaderCircle, Minus, PenLine, Plus } from "lucide-react";
import { useContext, useEffect, useId, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { canvasSignature, cleanSignature, SIGNATURE_PROBLEMS, type CleanSignature } from "@/lib/attestation/clean-signature";
import { pdfBase64 } from "@/lib/attestation/pdf-base64";
import { readDocumentTask } from "@/lib/document-signe/intent";
import type { DocxReading } from "@/lib/document-signe/docx";
import type { PdfPlace, PdfReading } from "@/lib/document-signe/pdf";
import { guessDriveFolder } from "@/lib/drive/folders";
import { DRIVE_UPLOAD_MESSAGES, uploadToDrive } from "@/lib/drive/upload";
import { boardDone } from "@/lib/voice-live/stage";
import { AttestationAsk } from "./attestation-ask";

/**
 * Signer ou remplir un document (PDF ou Word) dans la conversation (bloc ```document-a-signer```).
 * Le document et la signature restent sur l'appareil : seuls les libellés des cases
 * (« Nom », « Né(e) le ») partent à Tamilya pour qu'elle propose quoi y mettre.
 */

const PERSONA = "var(--persona,var(--accent))";
/** 15 Mo : un gros scan passe, sans figer un vieux téléphone. */
const MAX_BYTES = 15 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Kind = "pdf" | "docx";
type Loaded = { kind: Kind; name: string; bytes: Uint8Array; pdf?: PdfReading; docx?: DocxReading };
type Step = "pick" | "reading" | "fill" | "sign" | "done";
type Field = { label: string; context: string; value: string };

const primary = "flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45";
const secondary = "flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-3 font-medium hover:bg-bg-subtle disabled:opacity-45";

function kindOf(file: File): Kind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_TYPE || name.endsWith(".docx")) return "docx";
  return null;
}

/** « contrat.pdf » → « contrat-signe.pdf » (ou « -rempli »). */
function outputName(name: string, signed: boolean) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${base}-${signed ? "signe" : "rempli"}${ext}`;
}

export function SignDocument({ spec = "" }: { spec?: string }) {
  const task = readDocumentTask(spec);
  const asked = useContext(AttestationAsk);
  const uid = useId();
  const [step, setStep] = useState<Step>("pick");
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [signature, setSignature] = useState<CleanSignature | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [place, setPlace] = useState<PdfPlace | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [banked, setBanked] = useState<string | null>(null);
  const fileUrl = useRef<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    },
    [],
  );

  const title = task.sign && task.fill ? "Remplir et signer un document" : task.sign ? "Signer un document" : "Remplir un document";

  const open = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setProblem(null);
    const kind = kindOf(picked);
    if (!kind) {
      setProblem(
        /\.doc$/i.test(picked.name)
          ? "C'est un ancien fichier Word (.doc). Ouvre-le dans Word et enregistre-le en .docx, ou en PDF, puis envoie-le-moi."
          : "Je sais signer et remplir les PDF et les fichiers Word (.docx).",
      );
      return;
    }
    if (picked.size > MAX_BYTES) {
      setProblem("Ce fichier est trop lourd (15 Mo au plus).");
      return;
    }
    setStep("reading");
    const bytes = new Uint8Array(await picked.arrayBuffer());
    try {
      let loaded: Loaded;
      if (kind === "pdf") {
        // Bibliothèques PDF chargées seulement ici : elles sont lourdes et servent rarement.
        const { readPdf } = await import("@/lib/document-signe/pdf");
        const pdf = await readPdf(bytes);
        loaded = { kind, name: picked.name, bytes, pdf };
        setPlace(pdf.signature);
      } else {
        const { readDocx } = await import("@/lib/document-signe/docx");
        loaded = { kind, name: picked.name, bytes, docx: readDocx(bytes) };
      }
      setDoc(loaded);
      const blanks = loaded.pdf?.blanks ?? loaded.docx?.blanks ?? [];
      if (task.fill) {
        setFields(blanks.map((b) => ({ label: b.label, context: b.context, value: "" })));
        setStep("fill");
        if (loaded.pdf?.scanned) setFillNote("Ce PDF est une photo de pages : je ne peux pas écrire dans les cases, seulement le signer.");
        else if (!blanks.length) setFillNote("Je ne trouve pas de case à remplir (des pointillés ou « Nom : » en fin de ligne).");
        else void propose(blanks, loaded.pdf?.title ?? loaded.docx?.title ?? "");
      } else setStep("sign");
    } catch (error) {
      setStep("pick");
      const { PdfLocked } = await import("@/lib/document-signe/pdf");
      setProblem(
        error instanceof PdfLocked
          ? "Ce PDF est protégé par un mot de passe : je ne peux pas l'ouvrir."
          : "Je n'arrive pas à ouvrir ce document. Vérifie qu'il s'ouvre bien sur ton téléphone, puis réessaie.",
      );
    }
  };

  /** Tamilya propose les valeurs : le compte pour « Nom », « Prénom »…, la demande pour le reste. */
  const propose = async (blanks: { label: string; context: string }[], docTitle: string) => {
    setFilling(true);
    setFillNote(null);
    const response = await fetch("/api/document/remplir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: asked.slice(0, 1_000), title: docTitle, blanks: blanks.slice(0, 80).map((b) => ({ label: b.label.slice(0, 80), context: b.context.slice(0, 240) })) }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { values?: string[]; error?: string } | null | undefined;
    setFilling(false);
    if (response?.ok && data?.values) {
      setFields((current) => current.map((f, i) => ({ ...f, value: f.value || data.values?.[i] || "" })));
      setFillNote("Vérifie chaque case et corrige si besoin.");
    } else setFillNote(data?.error ?? "Je n'ai pas pu remplir : écris dans les cases toi-même.");
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    event.target.value = "";
    if (!photo) return;
    setReadingPhoto(true);
    setProblem(null);
    const result = await cleanSignature(photo);
    setReadingPhoto(false);
    setAgreed(false);
    if (result.ok) setSignature(result.signature);
    else setProblem(SIGNATURE_PROBLEMS[result.problem]);
  };

  const build = async () => {
    if (!doc) return;
    setBuilding(true);
    setProblem(null);
    try {
      const signed = task.sign && signature && agreed ? signature : null;
      let bytes: Uint8Array;
      if (doc.kind === "pdf" && doc.pdf) {
        const { writePdf } = await import("@/lib/document-signe/pdf");
        const fills = doc.pdf.blanks.map((b, i) => ({ spot: b.spot, value: fields[i]?.value ?? "" }));
        bytes = await writePdf(doc.bytes, fills, signed && place ? { png: signed.bytes, place, ratio: signed.ratio } : undefined);
      } else {
        const { writeDocx } = await import("@/lib/document-signe/docx");
        const reading = doc.docx;
        const fills = (reading?.blanks ?? []).map((b, i) => ({ paragraph: b.paragraph, start: b.start, end: b.end, value: fields[i]?.value ?? "" }));
        bytes = writeDocx(doc.bytes, fills, signed ? { png: signed.bytes, ratio: signed.ratio, paragraph: reading?.signatureParagraph ?? -1 } : undefined);
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: doc.kind === "pdf" ? "application/pdf" : DOCX_TYPE });
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      setFile({ url: fileUrl.current, name: outputName(doc.name, Boolean(signed)), blob });
      setBanked(null);
      setStep("done");
      boardDone(root.current);
    } catch {
      setProblem("Je n'ai pas réussi à préparer le document. Réessaie.");
    } finally {
      setBuilding(false);
    }
  };

  const saveWithApp = async () => {
    if (!file) return;
    window.TamilyaFiles?.savePdf?.(file.name, pdfBase64(new Uint8Array(await file.blob.arrayBuffer())));
  };

  const saveToDocuments = async () => {
    if (!file) return;
    setBanked("sending");
    const failure = await uploadToDrive(new File([file.blob], file.name, { type: file.blob.type }), guessDriveFolder(file.name));
    setBanked(failure === "not-connected" ? "Relie d'abord ton Google Drive dans Mes documents." : failure ? DRIVE_UPLOAD_MESSAGES[failure] : "done");
  };

  const header = (text: string, back?: Step) => (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      {back ? (
        <button type="button" onClick={() => setStep(back)} className="text-sm text-fg-muted hover:underline">
          Retour
        </button>
      ) : null}
      <p className="min-w-0 flex-1 truncate font-semibold">{text}</p>
    </div>
  );

  const alert = problem ? (
    <p role="alert" className="text-xs text-danger">
      {problem}
    </p>
  ) : null;

  const shell = (content: React.ReactNode) => (
    <section ref={root} aria-label={title} className="not-prose my-3 overflow-hidden rounded-2xl border border-border bg-bg text-sm">
      {content}
    </section>
  );

  if (step === "pick" || step === "reading") {
    return shell(
      <>
        {header(title)}
        <div className="booking-step space-y-3 p-4">
          <input ref={picker} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void open(e)} />
          <button type="button" onClick={() => picker.current?.click()} disabled={step === "reading"} className={primary} style={{ background: PERSONA }}>
            {step === "reading" ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <FileUp size={18} aria-hidden="true" />}
            {step === "reading" ? "Je lis le document…" : "Choisir le document (PDF ou Word)"}
          </button>
          {alert}
          <p className="text-center text-[11px] text-fg-muted">Ton document reste sur ton appareil : il n&apos;est ni envoyé ni gardé.</p>
        </div>
      </>,
    );
  }

  if (step === "fill") {
    return shell(
      <>
        {header(title, "pick")}
        <div className="booking-step space-y-2 p-4">
          {filling ? (
            <p role="status" className="flex items-center gap-2 text-xs text-fg-muted">
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Je remplis les cases…
            </p>
          ) : fillNote ? (
            <p className="text-xs text-fg-muted">{fillNote}</p>
          ) : null}
          {fields.map((field, i) => (
            <label key={`${uid}-${i}`} htmlFor={`${uid}-${i}`} className="block">
              <span className="block text-xs text-fg-muted">{field.label}</span>
              <input
                id={`${uid}-${i}`}
                value={field.value}
                autoComplete="off"
                onChange={(e) => setFields((all) => all.map((f, j) => (j === i ? { ...f, value: e.target.value } : f)))}
                className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg px-3 py-2"
              />
            </label>
          ))}
          {alert}
          <div className="pt-2">
            {task.sign ? (
              <button type="button" onClick={() => setStep("sign")} disabled={filling} className={primary} style={{ background: PERSONA }}>
                Continuer vers la signature
              </button>
            ) : (
              <button type="button" onClick={() => void build()} disabled={filling || building || !fields.some((f) => f.value.trim())} className={primary} style={{ background: PERSONA }}>
                {building ? "Préparation…" : "Préparer le document rempli"}
              </button>
            )}
          </div>
        </div>
      </>,
    );
  }

  if (step === "sign") {
    const docxSpot = doc?.docx ? (doc.docx.signatureParagraph >= 0 ? `sous « ${doc.docx.signatureText.slice(0, 60)} »` : "à la fin du document") : "";
    return shell(
      <>
        {header(title, task.fill ? "fill" : "pick")}
        <div className="booking-step space-y-3 p-4">
          {drawing ? (
            <SignaturePad
              onCancel={() => setDrawing(false)}
              onDone={(drawn) => {
                setDrawing(false);
                setAgreed(false);
                setSignature(drawn);
              }}
            />
          ) : (
            <>
              <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pickPhoto(e)} />
              {signature ? (
                <div className="grid h-24 place-items-center rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- image locale (data:), pas d'optimisation possible */}
                  <img src={signature.url} alt="Ta signature" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <p className="text-xs text-fg-muted">Signe sur une feuille blanche et prends-la en photo, ou signe avec le doigt.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => camera.current?.click()} disabled={readingPhoto} className={secondary}>
                  {readingPhoto ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                  Photo
                </button>
                <button type="button" onClick={() => setDrawing(true)} className={secondary}>
                  <PenLine size={16} aria-hidden="true" />
                  Au doigt
                </button>
              </div>
            </>
          )}

          {signature && !drawing && doc?.kind === "pdf" && doc.pdf && place ? (
            <PdfPlacer bytes={doc.bytes} pages={doc.pdf.pages} place={place} signature={signature} onMove={setPlace} />
          ) : null}
          {signature && !drawing && doc?.kind === "docx" ? <p className="text-xs text-fg-muted">Je la pose {docxSpot}.</p> : null}

          {signature && !drawing ? (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>C&apos;est bien ma signature, et je signe ce document en connaissance de cause.</span>
            </label>
          ) : null}
          {alert}
          {!drawing ? (
            <button type="button" onClick={() => void build()} disabled={!signature || !agreed || building} className={primary} style={{ background: PERSONA }}>
              {building ? "Préparation…" : "Préparer le document signé"}
            </button>
          ) : null}
          <p className="text-center text-[11px] text-fg-muted">Ta signature reste sur ton appareil. Je refuse de signer à la place de quelqu&apos;un d&apos;autre.</p>
        </div>
      </>,
    );
  }

  // Terminé : télécharger, l'app Android, ou ranger dans Mes documents.
  return shell(
    <>
      {header(title, task.sign ? "sign" : "fill")}
      <div className="booking-step space-y-2 p-4">
        <p className="font-medium">Ton document est prêt.</p>
        {file ? (
          <>
            {typeof window !== "undefined" && window.TamilyaFiles?.savePdf && doc?.kind === "pdf" ? (
              <button type="button" onClick={() => void saveWithApp()} className={primary} style={{ background: PERSONA }}>
                Enregistrer {file.name}
              </button>
            ) : (
              <a href={file.url} download={file.name} className={primary} style={{ background: PERSONA }}>
                Télécharger {file.name}
              </a>
            )}
            <button type="button" onClick={() => void saveToDocuments()} disabled={banked === "sending" || banked === "done"} className={secondary}>
              {banked === "sending" ? "Rangement…" : banked === "done" ? "Rangé dans Mes documents" : "Ranger dans Mes documents"}
            </button>
            {banked && banked !== "sending" && banked !== "done" ? <p className="text-xs text-danger">{banked}</p> : null}
          </>
        ) : null}
        <p className="text-center text-[11px] text-fg-muted">Relis-le avant de l&apos;envoyer.</p>
      </div>
    </>,
  );
}

/** Signer avec le doigt : trait noir sur fond transparent, recadré au plus près. */
function SignaturePad({ onDone, onCancel }: { onDone: (signature: CleanSignature) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#0b1a4a";
  }, []);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setEmpty(false);
  };

  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const finish = async () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx) return;
    // Recadrage autour du trait.
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < 20) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return;
    const margin = 6;
    const left = Math.max(0, minX - margin);
    const top = Math.max(0, minY - margin);
    const w = Math.min(width, maxX + margin) - left;
    const h = Math.min(height, maxY + margin) - top;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")?.putImageData(ctx.getImageData(left, top, w, h), 0, 0);
    const signature = await canvasSignature(out);
    if (signature) onDone(signature);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-muted">Signe dans le cadre avec ton doigt.</p>
      <canvas
        ref={canvas}
        aria-label="Cadre de signature"
        className="block h-40 w-full touch-none rounded-xl border border-border bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={move}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={onCancel} className={secondary}>
          Annuler
        </button>
        <button type="button" onClick={clear} disabled={empty} className={secondary}>
          Effacer
        </button>
        <button type="button" onClick={() => void finish()} disabled={empty} className={primary} style={{ background: PERSONA }}>
          Valider
        </button>
      </div>
    </div>
  );
}

/** Aperçu de la page avec la signature, que l'on déplace du doigt ; boutons pour la taille et la page. */
function PdfPlacer({
  bytes,
  pages,
  place,
  signature,
  onMove,
}: {
  bytes: Uint8Array;
  pages: { width: number; height: number }[];
  place: PdfPlace;
  signature: CleanSignature;
  onMove: (place: PdfPlace) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [width, setWidth] = useState(0);
  const [rendering, setRendering] = useState(true);
  const page = pages[place.page] ?? pages[0];
  const scale = width && page ? width / page.width : 0;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvas.current) return;
    let alive = true;
    const target = canvas.current;
    setRendering(true);
    // pdf.js refuse deux dessins à la fois dans le même canevas : ils passent l'un après l'autre.
    chain.current = chain.current
      .then(() => (alive ? import("@/lib/document-signe/pdf").then(({ renderPdfPage }) => renderPdfPage(bytes, place.page, target, width)) : undefined))
      .catch(() => {})
      .finally(() => {
        if (alive) setRendering(false);
      });
    return () => {
      alive = false;
    };
  }, [bytes, place.page, width]);

  const height = place.width * signature.ratio;
  const clamp = (p: PdfPlace): PdfPlace => {
    const w = Math.min(Math.max(50, p.width), page.width * 0.8);
    const h = w * signature.ratio;
    return { ...p, width: w, x: Math.min(Math.max(0, p.x), page.width - w), top: Math.min(Math.max(h, p.top), page.height) };
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = box.current!.getBoundingClientRect();
    drag.current = { dx: (event.clientX - rect.left) / scale - place.x, dy: page.height - (event.clientY - rect.top) / scale - place.top };
  };
  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !scale) return;
    const rect = box.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale - drag.current.dx;
    const top = page.height - (event.clientY - rect.top) / scale - drag.current.dy;
    onMove(clamp({ ...place, x, top }));
  };

  const small = "grid size-9 place-items-center rounded-full border border-border hover:bg-bg-subtle disabled:opacity-40";
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-muted">Fais glisser la signature à la bonne place.</p>
      <div ref={box} className="relative overflow-hidden rounded-lg border border-border bg-white">
        <canvas ref={canvas} className="block" />
        {rendering ? <LoaderCircle size={20} className="absolute top-3 left-3 animate-spin text-fg-muted" aria-hidden="true" /> : null}
        {scale ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Signature, à déplacer"
            onPointerDown={onDown}
            onPointerMove={onDrag}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            className="absolute cursor-grab touch-none rounded outline-2 outline-dashed outline-[var(--persona,var(--accent))]"
            style={{ left: place.x * scale, top: (page.height - place.top) * scale, width: place.width * scale, height: height * scale }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- image locale (data:) */}
            <img src={signature.url} alt="" draggable={false} className="size-full select-none" />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Signature plus petite" onClick={() => onMove(clamp({ ...place, width: place.width * 0.85 }))} className={small}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Signature plus grande" onClick={() => onMove(clamp({ ...place, width: place.width * 1.15 }))} className={small}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {pages.length > 1 ? (
          <div className="flex items-center gap-2 text-xs">
            <button type="button" disabled={place.page === 0} onClick={() => onMove({ ...place, page: place.page - 1 })} className="rounded-full border border-border px-3 py-1.5 disabled:opacity-40">
              Page précédente
            </button>
            <span>
              {place.page + 1}/{pages.length}
            </span>
            <button type="button" disabled={place.page >= pages.length - 1} onClick={() => onMove({ ...place, page: place.page + 1 })} className="rounded-full border border-border px-3 py-1.5 disabled:opacity-40">
              Page suivante
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
