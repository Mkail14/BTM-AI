import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wantsSpokenReply } from "@/lib/voice-live/spoken-request";

describe("message écrit qui demande la voix de Tamilya", () => {
  it("ouvre le vocal quand on lui demande de chanter ou de parler", () => {
    for (const message of [
      "chante",
      "Chante !",
      "chante-moi une chanson",
      "Tamilya, chante une berceuse",
      "Salut, tu peux chanter ?",
      "Peux-tu me chanter quelque chose",
      "je veux que tu chantes",
      "tu me chantes un truc ?",
      "parle",
      "Parle-moi !",
      "parle avec moi",
      "tu peux me parler ?",
      "dis-le à voix haute",
      "Lis ça à voix haute",
      "réponds en vocal",
      "on passe en vocal",
      "je veux entendre ta voix",
      "redis-le",
      "Lis-le moi",
      "relis ton message",
      "redis ce que tu as écrit",
      "parle-moi de ce que tu as écrit",
      "tu peux me répéter ta réponse ?",
      "pourquoi tu parles pas ?",
      "fais moi un journal en vocal",
      "Fais-moi le journal en vocal stp",
      "donne-moi la météo à voix haute",
      "le trajet de Kahani à Sada en vocal",
      "fais moi un vocal sur les infos",
      "envoie-moi un message vocal",
      "dis-moi en vocal comment aller à Sada",
    ]) {
      assert.equal(wantsSpokenReply(message), true, message);
    }
  });

  it("laisse les questions ordinaires à l'écrit", () => {
    for (const message of [
      "Parle-moi de Mayotte",
      "parle moi de ton histoire",
      "Qui chante cette chanson ?",
      "tu sais qui chante ça ?",
      "Il chante bien",
      "Comment on dit chanter en shimaoré ?",
      "chanteur connu de Mayotte",
      "Tu parles shimaoré ?",
      "tu peux parler de la pêche ?",
      "Comment marche le vocal ?",
      "c est quoi le mode en vocal ?",
      "le vocal marche pas",
      "fais moi un journal",
    ]) {
      assert.equal(wantsSpokenReply(message), false, message);
    }
  });
});
