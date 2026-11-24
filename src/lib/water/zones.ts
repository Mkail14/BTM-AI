import { VILLAGES } from "@/lib/geo/villages";
import { waterKey } from "./schedule";

/**
 * Lieux cités par la SMAE dans ses plannings de tours d'eau, avec une position sur la carte.
 * La SMAE ne publie pas le tracé de ses secteurs : chaque lieu est un point (centre du village ou
 * du quartier, OpenStreetMap © contributeurs, ODbL, relevé du 2026-11-20 ; « Haut / Bas »,
 * « Est / Ouest » placés à vue de part et d'autre du centre). La carte dessine une tache autour.
 * Noms écrits comme sur le planning du 02-22/11/2026 ; un nom inconnu d'un prochain planning
 * est signalé dans /admin/eau (à ajouter ici).
 */
const ROWS: [name: string, lat: number, lng: number, aliases?: string[]][] = [
  ["Acoua Haut", -12.7265, 45.061],
  ["Acoua bas", -12.7243, 45.058],
  ["Acoua Marvatou et Bon Soleil", -12.7198, 45.0556, ["Acoua Marvatou", "Marvatou"]],
  ["Bambo-Est", -12.9293, 45.1764],
  ["Bambo-Ouest", -12.9243, 45.0899],
  ["Bandraboua village (nord)", -12.7025, 45.1222, ["Bandraboua nord"]],
  ["Bandraboua village (sud – Ngambo Titi)", -12.7091, 45.1227, ["Bandraboua sud", "Bandraboua village (sud - Ngambo Titi)"]],
  ["Bandrélé village", -12.9123, 45.1939, ["Bandrélé"]],
  ["Barakani", -12.8391, 45.1311],
  ["Bouéni (quartier Mrambolé)", -12.907, 45.083, ["Mrambolé"]],
  ["Bouéni (sauf Mrambolé)", -12.9107, 45.0801, ["Bouéni"]],
  ["Bouyouni", -12.7357, 45.1398],
  ["Cavani-Mamoudzou", -12.7819, 45.2215, ["Cavani"]],
  ["Chembenyoumba", -12.7641, 45.0762],
  ["Chiconi village", -12.8323, 45.115, ["Chiconi"]],
  ["Chirongui village", -12.9354, 45.1492, ["Chirongui"]],
  ["Choungui", -12.9613, 45.1269],
  ["Coconi", -12.8343, 45.1355],
  ["Combani Champs d'Ylangs", -12.7881, 45.1318, ["Combani Champs d’Ylangs"]],
  ["Combani Nord", -12.784, 45.132],
  ["Combani Sud", -12.793, 45.134],
  ["Convaslescence – Mdz (100 villas, vertivert)", -12.7793, 45.2218, ["Convalescence Mamoudzou", "Convalescence Mdz", "Convaslescence Mdz"]],
  ["Convalescence - Cavani Sud", -12.7849, 45.2179, ["Cavani Sud"]],
  ["Dapani", -12.9712, 45.1608],
  ["Dembeni village", -12.8433, 45.184, ["Dembéni village", "Dembéni"]],
  ["Doujani", -12.7957, 45.2155],
  ["Dzaoudzi – Blv des Crabes", -12.7878, 45.2644, ["Dzaoudzi", "Boulevard des Crabes"]],
  ["Dzoumogné", -12.7219, 45.1203],
  ["Hagnoundrou", -12.9037, 45.1013],
  ["Hajangoua", -12.8674, 45.1956],
  ["Hamjago", -12.6889, 45.0743],
  ["Hamouro", -12.8813, 45.215],
  ["Handrema", -12.6813, 45.1001, ["Handréma"]],
  ["Hapandzo", -12.8353, 45.1327],
  ["Hauts Vallons", -12.7556, 45.2279, ["Les Hauts Vallons"]],
  ["Iloni", -12.8449, 45.1877],
  ["Ironi-Bé", -12.8274, 45.193, ["Ironi Bé"]],
  ["Kahani", -12.8239, 45.1317],
  ["Kangani", -12.7306, 45.1869],
  ["Kani-Bé", -12.965, 45.1119],
  ["Kani-Kéli village", -12.9565, 45.1053, ["Kani-Kéli"]],
  ["Kani-Kéli haut", -12.9548, 45.1078],
  ["Kani-Kéli bas", -12.9578, 45.1031],
  ["Kawéni village", -12.7727, 45.2248, ["Kawéni"]],
  ["Koungou village", -12.7358, 45.2067, ["Koungou"]],
  ["Kwalé", -12.8, 45.199],
  ["Labattoir – Badamiers", -12.7844, 45.2769, ["Badamiers"]],
  ["Labattoir – Centre", -12.7884, 45.2726, ["Labattoir"]],
  ["Labattoir La Vigie", -12.7865, 45.281],
  ["Longoni", -12.7345, 45.1632],
  ["Majicavo-Koropa", -12.7442, 45.2191],
  ["Majicavo-Lamir", -12.7538, 45.2312],
  ["Malamani", -12.9204, 45.1579],
  ["Mamoudzou – Boboka et Marché Couvert", -12.7777, 45.2315, ["Boboka", "Marché couvert"]],
  ["Mamoudzou Centre", -12.7804, 45.228, ["Mamoudzou"]],
  ["Mangajou", -12.8446, 45.1165],
  ["Mbouenatsa", -12.9445, 45.1018, ["Mbouanatsa"]],
  ["Mbouini", -12.9882, 45.1372, ["M'Bouini"]],
  ["Mgnambani", -12.936, 45.1664, ["M'Gnambani"]],
  ["Miréréni (Chirongui)", -12.9055, 45.1536],
  ["Miréréni (Tsingoni)", -12.7898, 45.1405],
  ["Mliha", -12.7507, 45.0555],
  ["Moinatrindri Bas", -12.9005, 45.099],
  ["Moinatrindri Haut", -12.8985, 45.0955],
  ["Mramadoudou", -12.9285, 45.1542],
  ["Mroalé", -12.7893, 45.1276],
  ["Mronabéja", -12.9794, 45.1234, ["M'Ronabéja"]],
  ["Mtsahara", -12.681, 45.0833, ["M'Tsahara"]],
  ["Mtsamboro village", -12.6997, 45.068, ["Mtsamboro"]],
  ["Mtsamoudou Bas", -12.964, 45.1745],
  ["Mtsamoudou Haut", -12.961, 45.1725],
  ["Mtsangadoua", -12.7119, 45.0514],
  ["Mtsangamboua", -12.6898, 45.1086],
  ["Mtsangamouji village", -12.7602, 45.0877, ["Mtsangamouji"]],
  ["Mtsapéré", -12.7892, 45.2207],
  ["Mtsapéré Bonovo", -12.7925, 45.217, ["Bonovo"]],
  ["Musicale Plage", -12.9191, 45.1848],
  ["Mzouazia", -12.9251, 45.1028, ["M'Zouazia"]],
  ["Nyambadao", -12.8932, 45.2017],
  ["Ongoujou", -12.837, 45.1587, ["Ongojou"]],
  ["Ouangani village", -12.8498, 45.1399, ["Ouangani"]],
  ["Pamandzi Est", -12.7983, 45.279],
  ["Pamandzi La Vigie", -12.793, 45.283],
  ["Pamandzi Ouest", -12.799, 45.2715],
  ["Passamainty Kavani-Bé + Ngambo Titi", -12.803, 45.211, ["Passamainty Kavani-Bé"]],
  ["Passamainty Manguiers", -12.7994, 45.2015],
  ["Passi-Kéli", -12.9864, 45.1271],
  ["Poroani", -12.8921, 45.1419],
  ["Sada", -12.8518, 45.0993],
  ["Sohoa", -12.8228, 45.1065],
  ["Trévani", -12.7349, 45.199],
  ["Tsararano", -12.8365, 45.1717],
  ["Tsimkoura", -12.9394, 45.1369],
  ["Tsingoni", -12.7897, 45.1038],
  ["Tsoundzou I", -12.8072, 45.2051, ["Tsoundzou 1"]],
  ["Tsoundzou II", -12.816, 45.1992, ["Tsoundzou 2"]],
  ["Vahibé", -12.7909, 45.1768],
  ["Z.I. Kawéni", -12.7677, 45.2272, ["ZI Kawéni", "Zone industrielle de Kawéni"]],
  ["Z.I. Vallée 3", -12.765, 45.221, ["ZI Vallée 3", "Vallée 3"]],
];

export type WaterZone = { name: string; lat: number; lng: number };

const ZONES: WaterZone[] = [];
const BY_KEY = new Map<string, WaterZone>();
for (const [name, lat, lng, aliases = []] of ROWS) {
  if (BY_KEY.has(waterKey(name))) continue;
  const zone = { name, lat, lng };
  ZONES.push(zone);
  BY_KEY.set(waterKey(name), zone);
  // Un autre nom ne remplace jamais un nom exact (« Bouéni » seul = le bourg, pas Mrambolé).
  for (const alias of aliases) if (!BY_KEY.has(waterKey(alias))) BY_KEY.set(waterKey(alias), zone);
}

export const WATER_ZONES: readonly WaterZone[] = ZONES;

/** Petite différence d'écriture (« Convaslescence », un accent, une lettre) : distance d'édition. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/** Lieu d'un nom du planning, ou null s'il n'est pas encore placé sur la carte. */
export function findZone(name: string): WaterZone | null {
  const key = waterKey(name);
  const exact = BY_KEY.get(key);
  if (exact) return exact;
  if (key.length < 6) return null;
  let best: { zone: WaterZone; d: number } | null = null;
  for (const [k, zone] of BY_KEY) {
    const d = distance(key, k);
    if (d <= 2 && (!best || d < best.d)) best = { zone, d };
  }
  return best?.zone ?? null;
}

/** Distance en mètres (petite distance, assez juste à l'échelle de Mayotte). */
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Villages connus du site à plus de `far` mètres de tous ces lieux : la SMAE n'en dit rien. */
export function villagesAway(places: readonly { lat: number; lng: number }[], far = 700): WaterZone[] {
  return VILLAGES.filter((v) => !places.some((p) => meters(p, v.point) < far)).map((v) => ({ name: v.name, lat: v.point.lat, lng: v.point.lng }));
}
