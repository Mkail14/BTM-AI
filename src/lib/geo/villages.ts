import type { Point } from "./communes";

/**
 * Villages, bourgs et quartiers de Mayotte avec leur position (OpenStreetMap, © contributeurs
 * OpenStreetMap, licence ODbL ; relevé du 2026-11-09). Gardés dans le site : la recherche sur la
 * carte (Nominatim) refuse souvent de répondre aux serveurs du site, et l'annuaire de l'État ne
 * connaît pas tous les villages (Kangani). Demande de l'utilisateur : « de Kangani à Dembéni »
 * ne trouvait pas Kangani. Utilisable côté navigateur.
 */

const ROWS: [name: string, lat: number, lng: number][] = [
  ["Acoua", -12.7243, 45.0589],
  ["Bambo-Est", -12.9293, 45.1764],
  ["Bambo-Ouest", -12.9243, 45.0899],
  ["Bandraboua", -12.7045, 45.1222],
  ["Bandrajou", -12.7467, 45.2198],
  ["Bandrélé", -12.9123, 45.1939],
  ["Barakani", -12.8391, 45.1311],
  ["Boudraguela", -12.7997, 45.1388],
  ["Bouéni", -12.9107, 45.0801],
  ["Bouyouni", -12.7357, 45.1398],
  ["Cavani", -12.7819, 45.2215],
  ["Chembenyoumba", -12.7641, 45.0762],
  ["Chiconi", -12.8323, 45.115],
  ["Chirongui", -12.9354, 45.1492],
  ["Choungui", -12.9613, 45.1269],
  ["Coconi", -12.8343, 45.1355],
  ["Combani", -12.7872, 45.1326],
  ["Dapani", -12.9712, 45.1608],
  ["Dembéni", -12.8433, 45.184],
  ["Doujani", -12.7957, 45.2155],
  ["Dzaoudzi", -12.7822, 45.2557],
  ["Dzoumogné", -12.7219, 45.1203],
  ["Hachénoi", -12.7892, 45.1128],
  ["Hagnoundrou", -12.9037, 45.1013],
  ["Hajangoua", -12.8674, 45.1956],
  ["Hamjago", -12.6889, 45.0743],
  ["Hamouro", -12.8813, 45.215],
  ["Handréma", -12.6813, 45.1001],
  ["Ironi Bé", -12.8274, 45.193],
  ["Kahani", -12.8239, 45.1317],
  ["Kangani", -12.7306, 45.1869],
  ["Kani-Bé", -12.965, 45.1119],
  ["Kani-Kéli", -12.9565, 45.1053],
  ["Kawéni", -12.7727, 45.2248],
  ["Koungou", -12.7358, 45.2067],
  ["La Vigie", -12.7882, 45.2815],
  ["Labattoir", -12.7884, 45.2726],
  ["Les Hauts Vallons", -12.7556, 45.2279],
  ["Longoni", -12.7345, 45.1632],
  ["M'Bouini", -12.9882, 45.1372],
  ["M'Ronabéja", -12.9794, 45.1234],
  ["M'Tsahara", -12.681, 45.0833],
  ["M'Tsamboro", -12.6997, 45.068],
  ["M'Tsamoudou", -12.9625, 45.1736],
  ["M'Tsanga M'Titi", -12.9389, 45.1038],
  ["M'Tsangadoua", -12.7119, 45.0514],
  ["M'Tsangamboua", -12.6898, 45.1086],
  ["M'Tsangamouji", -12.7602, 45.0877],
  ["M'Tsapéré", -12.7892, 45.2207],
  ["M'Tsatroundrou", -12.9186, 45.1837],
  ["M'Zouazia", -12.9251, 45.1028],
  ["Majicavo-Koropa", -12.7442, 45.2191],
  ["Majicavo-Lamir", -12.7538, 45.2312],
  ["Majiméouni", -12.9251, 45.1069],
  ["Malamani", -12.9204, 45.1579],
  ["Mamoudzou", -12.7804, 45.228],
  ["Mangajou", -12.8446, 45.1165],
  ["Mbouanatsa", -12.9445, 45.1018],
  ["Miréréni (Chirongui)", -12.9055, 45.1536],
  ["Miréréni (Tsingoni)", -12.7898, 45.1405],
  ["Mliha", -12.7507, 45.0555],
  ["Moinatrindri", -12.8996, 45.0973],
  ["Mramadoudou", -12.9285, 45.1542],
  ["Mroalé", -12.7893, 45.1276],
  ["Nyambadao", -12.8932, 45.2017],
  ["Ongojou", -12.837, 45.1587],
  ["Ouangani", -12.8498, 45.1399],
  ["Pamandzi", -12.7983, 45.2747],
  ["Passamainty", -12.8011, 45.2092],
  ["Passi-Kéli", -12.9864, 45.1271],
  ["Poroani", -12.8921, 45.1419],
  ["Potéléa", -12.9086, 45.1944],
  ["Quartier Machaka", -12.7463, 45.2225],
  ["Sada", -12.8518, 45.0993],
  ["Sohoa", -12.8228, 45.1065],
  ["Tanaraki", -12.7592, 45.0702],
  ["Trévani", -12.7349, 45.199],
  ["Tsararano", -12.8365, 45.1717],
  ["Tsimkoura", -12.9394, 45.1369],
  ["Tsingoni", -12.7897, 45.1038],
  ["Tsoundzou 1", -12.8072, 45.2051],
  ["Tsoundzou 2", -12.816, 45.1992],
  ["Vahibé", -12.7909, 45.1768],
];

export const VILLAGES: { name: string; point: Point }[] = ROWS.map(([name, lat, lng]) => ({ name, point: { lat, lng } }));

/** Nom simplifié pour comparer : sans accents, apostrophes, tirets ni majuscules (« M'Tsapéré » = « mtsapere »). */
export const placeKey = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\((.*?)\)/g, " $1 ")
    .replace(/\b(?:mayotte|976\d\d|france|village|ville|commune|quartier)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");

const BY_KEY = new Map<string, { name: string; point: Point }>();
for (const village of VILLAGES) {
  BY_KEY.set(placeKey(village.name), village);
  // « Miréréni (Tsingoni) » se trouve aussi par « Miréréni Tsingoni » ; « Miréréni » seul : le premier.
  const bare = placeKey(village.name.replace(/\s*\(.*\)$/, ""));
  if (!BY_KEY.has(bare)) BY_KEY.set(bare, village);
}

/** Le village nommé (« kangani », « Kangani, Mayotte », « mtsapere »), ou null. */
export function findVillage(text: string): { name: string; point: Point } | null {
  return BY_KEY.get(placeKey(text)) ?? null;
}
