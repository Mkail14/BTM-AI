import assert from "node:assert/strict";
import { test } from "node:test";
import { separateCardBlocks } from "../src/lib/chat/block-fence";

const NAMES = ["ticket-barge", "commande-repas", "commande-groupee"];

test("bloc collé à la phrase, contenu sur la même ligne (vu sur la Pad 6)", () => {
  assert.equal(
    separateCardBlocks("Ok, ticket barge. ```ticket-barge pieton 1\n```", NAMES),
    "Ok, ticket barge.\n\n```ticket-barge\npieton 1\n```",
  );
});

test("bloc collé à la phrase, contenu déjà dessous", () => {
  assert.equal(
    separateCardBlocks("Voici les tacos : ```commande-repas\ntacos\n```", NAMES),
    "Voici les tacos :\n\n```commande-repas\ntacos\n```",
  );
});

test("tout sur une ligne, fin collée", () => {
  assert.equal(separateCardBlocks("Ok. ```ticket-barge pieton 1```", NAMES), "Ok.\n\n```ticket-barge\npieton 1\n```");
});

test("bloc déjà bien écrit : rien ne change", () => {
  const ok = "Voilà.\n\n```ticket-barge\npieton 1\n```";
  assert.equal(separateCardBlocks(ok, NAMES), ok);
  const ok2 = "Voilà.\n```commande-repas\ntacos\n```";
  assert.equal(separateCardBlocks(ok2, NAMES), ok2);
});

test("pendant l'écriture : bloc pas encore fini", () => {
  assert.equal(separateCardBlocks("Ok. ```ticket-barge pie", NAMES), "Ok.\n\n```ticket-barge\npie");
});

test("vrai code et nom voisin : pas touchés", () => {
  const code = "Exemple : ```js const a = 1```";
  assert.equal(separateCardBlocks(code, NAMES), code);
  const near = "Ok. ```commande-repas2 x";
  assert.equal(separateCardBlocks(near, NAMES), near);
});
