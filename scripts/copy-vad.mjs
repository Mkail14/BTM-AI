// Copie le moteur onnxruntime-web dans public/vad/ort/<version>/ (Silero VAD et empreinte de voix,
// voir src/lib/voice-live/ort-path.ts). Lancé avant `dev` et `build` : ces gros fichiers ne sont pas gardés dans git.
// La version est dans l'adresse : le navigateur peut garder le moteur (≈ 15 Mo) un an sans jamais le revérifier,
// et une mise à jour d'onnxruntime-web change d'adresse au lieu de servir un moteur qui ne va plus avec le code.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";

const from = "node_modules/onnxruntime-web/dist/";
const { version } = JSON.parse(readFileSync("node_modules/onnxruntime-web/package.json", "utf8"));
const target = `public/vad/ort/${version}/`;
mkdirSync(target, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(from + file, target + file);
// Anciennes versions et ancienne adresse sans version : effacées pour ne pas gonfler le déploiement.
for (const old of readdirSync("public/vad/ort")) if (old !== version) rmSync(`public/vad/ort/${old}`, { recursive: true, force: true });
for (const old of readdirSync("public/vad")) if (old.startsWith("ort-wasm-")) rmSync(`public/vad/${old}`, { force: true });

// Moteur des cartes (MapLibre) à une adresse fixe, /maplibre/ (voir src/lib/geo/maplibre.ts) : l'app Android le garde dans l'APK.
const maplibre = "node_modules/maplibre-gl/dist/";
mkdirSync("public/maplibre", { recursive: true });
for (const file of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs"]) copyFileSync(maplibre + file, "public/maplibre/" + file);
