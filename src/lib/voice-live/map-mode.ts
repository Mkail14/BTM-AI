/**
 * Vocal ouvert depuis la carte de la page « Mayotte » : Tamilya n'y fait qu'une
 * chose, montrer les villes et villages de l'île et en parler. Ses seuls
 * boutons font bouger la carte (exécutés dans le navigateur : MayotteMap.tsx).
 */

export const MAP_TOOLS = ["montrer_ville", "montrer_ile"] as const;

/** Déclarations envoyées à Gemini à la place des boutons habituels. */
export function mapToolDeclarations() {
  return [
    {
      name: "montrer_ville",
      description:
        "Fait voler la carte jusqu'à une ville ou un village de Mayotte, zoome dessus et le marque d'un repère lumineux. À appeler tout de suite, sans rien demander, dès que la personne nomme un lieu de l'île, même mal entendu. Renvoie les faits sûrs à dire (commune, habitants, où c'est sur l'île).",
      parameters: {
        type: "OBJECT",
        properties: { ville: { type: "STRING", description: "Le nom de la ville ou du village, comme elle l'a dit (ex. « Sada », « Combani », « M'Tsapéré »)." } },
        required: ["ville"],
      },
    },
    {
      name: "montrer_ile",
      description: "Ramène la carte sur Mayotte en entier (Grande-Terre et Petite-Terre). À appeler quand la personne veut revoir toute l'île ou dézoomer.",
      parameters: { type: "OBJECT", properties: {} },
    },
  ];
}

/** Placée tout à la fin des consignes : elle passe avant le reste. Décrit ce qu'elle fait, sans phrase imposée. */
export const MAP_RULES = [
  "PAGE « CARTE DE MAYOTTE » — cette consigne passe avant toutes les autres.",
  "- La personne te parle depuis la carte de Mayotte du site. Ici tu ne fais qu'une chose : montrer les villes et les villages de l'île sur la carte et en parler.",
  "- Tes seuls boutons sont montrer_ville et montrer_ile. Tous les autres boutons cités plus haut (repas, barge, code de la route, devis, vidéos, histoires, chansons, trajets, cyclones, infos, entreprises, heure…) n'existent pas sur cette page : ne les appelle pas et ne les propose pas.",
  "- Dès qu'elle nomme une ville ou un village de Mayotte, appelle montrer_ville tout de suite, sans question : la carte vole jusque-là sous ses yeux. Ensuite, dis en deux ou trois phrases ce que le bouton renvoie (sa commune, ses habitants, où c'est sur l'île) et ce que ce lieu a de connu. Ce que tu ajoutes de toi-même doit être sûr : vérifie avec la recherche Google si tu doutes, sinon n'en dis rien. Jamais de chiffre inventé.",
  "- Si le bouton ne trouve pas le lieu, demande-lui simplement de redire le nom.",
  "- Si elle veut revoir toute l'île ou dézoomer, appelle montrer_ile.",
  "- Si elle demande autre chose que les villes et villages de Mayotte (commander, une histoire, une chanson, l'actualité, le journal, une question sans rapport…), ne le fais pas : fais-lui comprendre en une phrase, à ta façon et jamais deux fois pareil, qu'ici tu ne parles que des villes de l'île, et invite-la à en nommer une.",
].join("\n");
