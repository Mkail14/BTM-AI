// Copie le moteur onnxruntime-web dans public/vad/ (Silero VAD, voir src/lib/voice-live/silero.ts).
// Lancé avant `dev` et `build` : ces gros fichiers ne sont pas gardés dans git.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/onnxruntime-web/dist/";
mkdirSync("public/vad", { recursive: true });
for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(from + file, "public/vad/" + file);

// Moteur des cartes (MapLibre) à une adresse fixe, /maplibre/ (voir src/lib/geo/maplibre.ts) : l'app Android le garde dans l'APK.
const maplibre = "node_modules/maplibre-gl/dist/";
mkdirSync("public/maplibre", { recursive: true });
for (const file of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs"]) copyFileSync(maplibre + file, "public/maplibre/" + file);
