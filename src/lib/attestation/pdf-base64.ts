const CHUNK = 0x8000;

/** Octets → base64, par morceaux : un seul appel à fromCharCode dépasse la pile pour un gros fichier. */
export function pdfBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
