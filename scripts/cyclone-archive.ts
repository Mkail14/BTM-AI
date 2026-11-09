/**
 * Archive des anciens cyclones, pour le moteur d'estimation (src/lib/cyclone/engine.ts).
 *
 * Source : IBTrACS (NOAA), le recueil mondial officiel des trajets de cyclones.
 * Pour notre bassin, il reprend les relevés de Météo-France La Réunion.
 * Fichier du sud de l'océan Indien (≈ 78 Mo) :
 *   https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.SI.list.v04r01.csv
 *
 * On ne garde que l'essentiel (≈ 1 Mo) : depuis 1980 (époque des satellites),
 * les systèmes passés à l'ouest de 75° E (Madagascar, Mozambique, Mascareignes),
 * un point toutes les 6 heures : heure, position, vent.
 *
 * Usage (une fois par an, après la saison) :
 *   pnpm tsx scripts/cyclone-archive.ts chemin/vers/ibtracs.SI.list.v04r01.csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Donne le chemin du fichier IBTrACS (CSV) en argument.");

const lines = readFileSync(source, "utf8").split(/\r?\n/);
const head = lines[0].split(",");
const col = (name: string) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`Colonne ${name} absente`);
  return i;
};
const C = {
  sid: col("SID"),
  season: col("SEASON"),
  name: col("NAME"),
  time: col("ISO_TIME"),
  lat: col("LAT"),
  lon: col("LON"),
  type: col("TRACK_TYPE"),
  reunion: col("REUNION_WIND"),
  wmo: col("WMO_WIND"),
  usa: col("USA_WIND"),
};

type Point = { h: number; lat: number; lng: number; kt: number };
const storms = new Map<string, { name: string; season: number; pts: Point[] }>();

for (const line of lines.slice(2)) {
  if (!line) continue;
  const f = line.split(",");
  const season = Number(f[C.season]);
  if (season < 1980 || f[C.type] !== "main") continue;
  const iso = f[C.time];
  const hour = Number(iso.slice(11, 13));
  if (hour % 6 !== 0 || iso.slice(14, 16) !== "00") continue;
  const lat = Number(f[C.lat]);
  const lng = Number(f[C.lon]);
  if (lng < 20 || lng > 95) continue;
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  // Vent sur 10 minutes de La Réunion d'abord ; sinon celui de l'OMM ; sinon l'américain (sur 1 minute, ramené à 10).
  let kt = num(f[C.reunion]);
  if (Number.isNaN(kt)) kt = num(f[C.wmo]);
  if (Number.isNaN(kt)) kt = num(f[C.usa]) * 0.88;
  const h = Math.round(Date.parse(`${iso.replace(" ", "T")}Z`) / 3_600_000);
  const sid = f[C.sid];
  const s = storms.get(sid) ?? { name: f[C.name], season, pts: [] };
  s.pts.push({ h, lat, lng, kt: Number.isNaN(kt) ? -1 : Math.round(kt) });
  storms.set(sid, s);
}

/** Passé par l'ouest du bassin : Mozambique, Madagascar, Comores, Mascareignes. */
const west = (p: Point) => p.lng >= 30 && p.lng <= 75 && p.lat <= -3 && p.lat >= -35;

const kept = [...storms.entries()]
  .filter(([, s]) => s.pts.length >= 6 && s.pts.some(west))
  .map(([sid, s]) => {
    const pts = s.pts.sort((a, b) => a.h - b.h);
    const t0 = pts[0].h;
    // Une suite d'entiers par point : heures depuis le début, latitude ×10, longitude ×10, vent (nœuds, -1 inconnu).
    return {
      id: sid,
      name: s.name === "NOT_NAMED" || s.name === "UNNAMED" ? "" : s.name.charAt(0) + s.name.slice(1).toLowerCase(),
      season: s.season,
      t0,
      p: pts.flatMap((q) => [q.h - t0, Math.round(q.lat * 10), Math.round(q.lng * 10), q.kt]),
    };
  });

const out = join(import.meta.dirname, "..", "src", "lib", "cyclone", "archive.json");
writeFileSync(out, JSON.stringify({ source: "IBTrACS v04r01 (NOAA), relevés de Météo-France La Réunion", built: new Date().toISOString().slice(0, 10), storms: kept }));
console.log(`${kept.length} systèmes, ${kept.reduce((n, s) => n + s.p.length / 4, 0)} points → ${out}`);
