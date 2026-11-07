// Copie le moteur onnxruntime-web dans public/vad/ (Silero VAD, voir src/lib/voice-live/silero.ts).
// Lancé avant `dev` et `build` : ces gros fichiers ne sont pas gardés dans git.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/onnxruntime-web/dist/";
mkdirSync("public/vad", { recursive: true });
for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(from + file, "public/vad/" + file);
