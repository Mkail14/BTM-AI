/**
 * Adresse du moteur onnxruntime-web (copié par scripts/copy-vad.mjs dans public/vad/ort/<version>/).
 * La version vient du moteur chargé lui-même : le fichier .wasm demandé va toujours avec ce code,
 * et il peut être gardé un an par le navigateur (next.config.ts, /vad/ort/).
 */
export function ortWasmPath(ort: { env: { versions: { common: string; web?: string } } }): string {
  return `/vad/ort/${ort.env.versions.web ?? ort.env.versions.common}/`;
}
