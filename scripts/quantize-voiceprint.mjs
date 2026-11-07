// Allège le modèle d'empreinte de voix (public/voiceprint/resnet34.onnx) : chaque gros tableau
// float32 devient int8 (une échelle par canal de sortie), un DequantizeLinear le reconstruit au chargement.
// Usage : node scripts/quantize-voiceprint.mjs wespeaker_en_voxceleb_resnet34_LM.onnx public/voiceprint/resnet34.onnx
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(`${process.cwd()}/node_modules/.pnpm/protobufjs@7.6.6/node_modules/protobufjs/package.json`);
const protobuf = require("protobufjs");
const root = protobuf.loadSync(new URL("./onnx.proto", import.meta.url).pathname.slice(1));
const Model = root.lookupType("onnx.ModelProto");
const [src, dst] = process.argv.slice(2);
const model = Model.decode(fs.readFileSync(src));
console.log("opset", model.opsetImport.map((o) => `${o.domain || "ai.onnx"}:${o.version}`).join(","), "ir", model.irVersion?.toString());
const g = model.graph;
const FLOAT = 1, INT8 = 3;
const keep = [], nodes = [];
let before = 0, after = 0;
for (const init of g.initializer) {
  const raw = init.rawData?.length ? new Float32Array(init.rawData.buffer.slice(init.rawData.byteOffset, init.rawData.byteOffset + init.rawData.length)) : Float32Array.from(init.floatData || []);
  before += raw.length * 4;
  if (init.dataType !== FLOAT || raw.length < 1024 || !init.dims?.length) { keep.push(init); after += raw.length * 4; continue; }
  const dims = init.dims.map(Number); const C = dims[0]; const per = raw.length / C;
  const q = new Int8Array(raw.length); const scales = new Float32Array(C);
  for (let c = 0; c < C; c++) { let m = 0; for (let i = 0; i < per; i++) m = Math.max(m, Math.abs(raw[c * per + i]));
    const s = m / 127 || 1; scales[c] = s; for (let i = 0; i < per; i++) q[c * per + i] = Math.round(raw[c * per + i] / s); }
  const name = init.name;
  keep.push({ name: name + "_q", dataType: INT8, dims: init.dims, rawData: Buffer.from(q.buffer) });
  keep.push({ name: name + "_s", dataType: FLOAT, dims: [C], rawData: Buffer.from(scales.buffer) });
  keep.push({ name: name + "_z", dataType: INT8, dims: [C], rawData: Buffer.alloc(C) });
  nodes.push({ opType: "DequantizeLinear", input: [name + "_q", name + "_s", name + "_z"], output: [name], name: name + "_dq", attribute: [{ name: "axis", type: 2, i: 0 }] });
  after += q.length + C * 5;
}
g.initializer = keep;
g.node = [...nodes, ...g.node];
g.input = g.input.filter((i) => !nodes.some((n) => n.output[0] === i.name));
const ai = model.opsetImport.find((o) => !o.domain || o.domain === "ai.onnx");
if (ai && Number(ai.version) < 13) ai.version = 13;
fs.writeFileSync(dst, Model.encode(Model.fromObject(Model.toObject(model, { bytes: Buffer }))).finish());
console.log(`poids ${(before / 1e6).toFixed(1)} Mo -> ${(after / 1e6).toFixed(1)} Mo ; fichier ${(fs.statSync(dst).size / 1e6).toFixed(1)} Mo`);
