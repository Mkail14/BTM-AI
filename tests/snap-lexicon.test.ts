import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapLexicon, snapToLexicon } from "../src/lib/language/snap-lexicon";

const lexicon = buildSnapLexicon(["marahaba", "Kwezi", "Wa fetché ?", "kwezi wa fetché", "wawé ?", "soma", "wa", "somahane", "trop", "msada / m'sada"]);
const snap = (text: string) => snapToLexicon(text, lexicon);

test("une écriture à l'oreille retrouve celle du lexique", () => {
  assert.equal(snap("marahabaa"), "marahaba");
  assert.equal(snap("Kouézi wa fétché"), "Kwezi wa fetché");
  assert.equal(snap("wawe"), "wawé");
  assert.equal(snap("marahabah wawé"), "marahaba wawé");
});

test("l'expression entière passe avant ses mots", () => {
  assert.equal(snap("kwézi wa fétché"), "kwezi wa fetché");
});

test("le français et les mots inconnus ne bougent pas", () => {
  for (const text of ["je veux manger", "bonjour à tous", "le mot trop est dans le lexique", "chilabou", "tu vas à Mamoudzou"]) {
    assert.equal(snap(text), text);
  }
});

test("une phrase surtout française n'est pas touchée, même avec un mot emprunté", () => {
  const borrowed = buildSnapLexicon(["komandé", "reservé"]);
  assert.equal(snapToLexicon("je veux commander un repas", borrowed), "je veux commander un repas");
  assert.equal(snapToLexicon("je dis marahabah à ma mère", lexicon), "je dis marahabah à ma mère");
});

test("plusieurs mots n'en deviennent jamais un seul", () => {
  assert.equal(snapToLexicon("aller zaz", buildSnapLexicon(["allerzaz"])), "aller zaz");
});

test("un prénom n'est jamais remplacé", () => {
  assert.equal(snapToLexicon("Tamilya wé", buildSnapLexicon(["Tamila wé"])), "Tamilya wé");
});

test("un mot de deux lettres ne suffit pas à corriger", () => {
  assert.equal(snapToLexicon("ah", buildSnapLexicon(["Ahhhhh"])), "ah");
});

test("un mot court doit correspondre exactement", () => {
  assert.equal(snap("somi"), "somi");
  assert.equal(snap("zoma"), "zoma");
});

test("deux mots du lexique aussi proches : on ne choisit pas", () => {
  const tied = buildSnapLexicon(["baliha", "baloha"]);
  assert.equal(snapToLexicon("baluha", tied), "baluha");
});

test("la ponctuation et les espaces restent en place", () => {
  assert.equal(snap("Marahabaa, soma !"), "Marahaba, soma !");
});

test("lexique vide : texte inchangé", () => {
  assert.equal(snapToLexicon("marahabaa", buildSnapLexicon([])), "marahabaa");
});
