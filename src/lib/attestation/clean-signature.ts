import { removeSignatureBackground, type SignatureProblem } from "./signature";

/**
 * Photo de signature → PNG à fond transparent, dans le navigateur : la signature
 * ne quitte jamais l'appareil. Sert à l'attestation et aux documents à signer.
 */

const MAX_PHOTO_SIDE = 1400;

/** `ratio` : hauteur / largeur, pour garder la forme de la signature une fois posée. */
export type CleanSignature = { bytes: Uint8Array; url: string; ratio: number };

export type CleanProblem = SignatureProblem | "unreadable";

export const SIGNATURE_PROBLEMS: Record<CleanProblem, string> = {
  empty: "Aucune signature visible. Signe en noir ou en bleu foncé et reprends la photo de plus près.",
  not_white_sheet: "Le fond n'est pas assez blanc. Reprends la photo sur une feuille blanche bien éclairée.",
  unreadable: "Cette image ne s'ouvre pas. Essaie avec une autre photo.",
};

/** Canevas → PNG, avec son aperçu et sa forme. */
export async function canvasSignature(canvas: HTMLCanvasElement): Promise<CleanSignature | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: canvas.toDataURL("image/png"), ratio: canvas.height / Math.max(1, canvas.width) };
}

export async function cleanSignature(file: File): Promise<{ ok: true; signature: CleanSignature } | { ok: false; problem: CleanProblem }> {
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
  const signature = await canvasSignature(canvas);
  return signature ? { ok: true, signature } : { ok: false, problem: "unreadable" };
}
