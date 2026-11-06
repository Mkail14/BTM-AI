/**
 * Lieux de Mayotte que Tamilya doit reconnaître à l'oreille : les 17 communes, leurs
 * villages et des quartiers ou lieux très cités. La liste n'est pas exhaustive pour les
 * quartiers (pas de liste officielle complète trouvée) : un nom qui manque s'ajoute ici.
 * Gardée courte : ces noms partent dans les consignes de chaque conversation vocale.
 */
export const MAYOTTE_PLACES: Record<string, string[]> = {
  Mamoudzou: ["Kavani", "Kawéni", "Mtsapéré", "Passamaïnty", "Vahibé", "Tsoundzou 1", "Tsoundzou 2", "M'Gombani", "Doujani", "Mandzarisoa", "Convalescence", "Bandrajou", "Gnambotiti"],
  Koungou: ["Trévani", "Trévani Village", "Kangani", "Longoni", "Majicavo Koropa", "Majicavo Lamir", "Majicavo Dubaï", "Les Hauts Vallons"],
  Dzaoudzi: ["Labattoir", "Four à Chaux", "La Vigie"],
  Pamandzi: ["Sandravoangue"],
  Bandraboua: ["Dzoumogné", "Bouyouni", "M'Tsangamboua", "Handréma"],
  "M'Tsamboro": ["Mtsahara", "Hamjago"],
  Acoua: ["Mtsangadoua"],
  "M'Tsangamouji": ["Chembényoumba", "Mliha"],
  Tsingoni: ["Combani", "Miréréni", "Mroalé"],
  Sada: ["Mangajou", "Tahiti Plage"],
  Ouangani: ["Barakani", "Coconi", "Kahani"],
  Chiconi: ["Sohoa"],
  Chirongui: ["Tsimkoura", "Mramadoudou", "Poroani", "Malamani"],
  Bouéni: ["Hagnoundrou", "Majiméouni", "Mbouanatsa", "Moinatrindri", "Bambo Ouest", "Mzouazia"],
  "Kani-Kéli": ["Kani-Bé", "Choungui", "Mronabéja", "Passi-Kéli", "Mbouini"],
  Bandrélé: ["Dapani", "Hamouro", "Nyambadao", "Mtsamoudou", "Musicale Plage"],
  Dembéni: ["Iloni", "Tsararano", "Ongojou", "Hajangoua"],
};

/** Autres noms entendus souvent. */
export const MAYOTTE_LANDMARKS = ["Grande-Terre", "Petite-Terre", "Moya", "Ngouja", "Saziley", "Mont Choungui", "Dziani", "Îlot Mtsamboro"];

/** Une ligne par commune : court à lire pour le modèle. */
export function mayottePlacesText(): string {
  const communes = Object.entries(MAYOTTE_PLACES).map(([commune, places]) => `${commune} : ${places.join(", ")}`);
  return [...communes, `Autres : ${MAYOTTE_LANDMARKS.join(", ")}`].join("\n");
}
