/**
 * Pendant que Tamilya écrit, le texte grandit à chaque image (≈ 60 fois par seconde).
 * Ré-analyser tout le Markdown à chaque fois coûte de plus en plus cher à mesure que la
 * réponse s'allonge (mesuré sur ordinateur : ~11 ms par image pour 1 500 caractères,
 * bien plus sur un téléphone modeste). On coupe donc le texte en deux : le début déjà
 * terminé (analysé une seule fois tant qu'il ne change pas) et la fin en cours d'écriture.
 *
 * La coupure ne se fait qu'à une ligne vide qui sépare sans ambiguïté deux blocs, quand
 * la ligne suivante commence un bloc neuf (ni retrait, ni puce de liste, ni ligne de
 * tableau), et jamais après un bloc ``` : les cartes (créneaux, commande…) restent dans
 * la fin et ne sont pas redessinées en cours d'écriture. Le rendu des deux morceaux est
 * le même que celui du texte entier (vérifié lettre par lettre, voir les tests).
 */
export function splitStableMarkdown(text: string): { head: string; tail: string } {
  // Notes de bas de page, liens définis plus loin et HTML brut : ils relient des blocs éloignés, on ne coupe pas.
  if (text.includes("[^") || /^ {0,3}(\[[^\]]+\]:|<)/m.test(text)) return { head: "", tail: text };
  let cut = 0;
  let pos = 0;
  let previousBlank = false;
  while (pos < text.length) {
    const end = text.indexOf("\n", pos);
    const line = text.slice(pos, end === -1 ? text.length : end);
    if (previousBlank && startsFreshBlock(line)) cut = pos;
    // Premier bloc de code ou carte : on ne cherche pas plus loin.
    if (/^ {0,3}(`{3,}|~{3,})/.test(line) || end === -1) break;
    previousBlank = line.trim() === "";
    pos = end + 1;
  }
  return { head: text.slice(0, cut), tail: text.slice(cut) };
}

/** Ligne qui ouvre forcément un nouveau bloc après une ligne vide (pas la suite d'une liste ou d'un tableau). */
function startsFreshBlock(line: string) {
  if (!line || /^\s/.test(line)) return false;
  // Puce ou numéro de liste : peut continuer la liste précédente (liste « aérée »).
  if (/^([-*+]|\d{1,9}[.)])(\s|$)/.test(line)) return false;
  // Ligne de tableau : on ne coupe pas.
  return !line.startsWith("|");
}
