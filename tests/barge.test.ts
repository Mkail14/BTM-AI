import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { priceBargeOrder } from "@/lib/barge/catalog";
import { detectBargeTicket } from "@/lib/barge/intent";

describe("Tickets de barge", () => {
  it("ouvre l'achat seulement quand on demande un ticket", () => {
    assert.equal(detectBargeTicket("je veux un ticket de barge"), "buy");
    assert.equal(detectBargeTicket("Tamilya achète-moi 2 billets pour la barge stp"), "buy");
    assert.equal(detectBargeTicket("un ticket pour aller à Petite-Terre avec ma voiture"), "buy");
    // Simple question : pas d'achat.
    assert.equal(detectBargeTicket("la barge part à quelle heure ?"), null);
    assert.equal(detectBargeTicket("je veux un ticket de cinéma"), null);
    // Ticket déjà acheté : Tamilya répond, sans rouvrir l'achat.
    assert.equal(detectBargeTicket("où est mon ticket de barge ?"), null);
  });

  it("rappelle que le départ de Petite-Terre est gratuit", () => {
    assert.equal(detectBargeTicket("je veux un ticket de barge depuis Petite-Terre"), "free");
    assert.equal(detectBargeTicket("billet barge pour partir de Dzaoudzi"), "free");
  });

  it("calcule le prix à partir des tarifs", () => {
    const order = priceBargeOrder([
      { ticketId: "pieton", quantity: 2 },
      { ticketId: "voiture", quantity: 1 },
      { ticketId: "moto", quantity: 0 },
    ]);
    assert.equal(order?.totalCents, 1700);
    assert.equal(order?.lines.length, 2);
    assert.equal(priceBargeOrder([{ ticketId: "inconnu", quantity: 1 }]), null);
    assert.equal(priceBargeOrder([{ ticketId: "pieton", quantity: 0 }]), null);
  });
});

describe("tickets de barge demandés", () => {
  it("n'affiche que ce qui est demandé", async () => {
    const { parseBargeRequest } = await import("@/lib/barge/intent");
    assert.deepEqual(parseBargeRequest("je veux un ticket de barge pour moi"), { pieton: 1 });
    assert.deepEqual(parseBargeRequest("je passe le code, il me faut un ticket de barge"), { pieton: 1 });
    assert.deepEqual(parseBargeRequest("2 billets barge"), { pieton: 2 });
    assert.deepEqual(parseBargeRequest("ticket barge pour moi et ma femme"), { pieton: 2 });
    assert.deepEqual(parseBargeRequest("on est 4 pour la barge"), { pieton: 4 });
    assert.deepEqual(parseBargeRequest("ticket pour Petite-Terre avec ma voiture"), { voiture: 1 });
    assert.deepEqual(parseBargeRequest("barge en voiture avec 2 passagers"), { voiture: 1, pieton: 2 });
    assert.deepEqual(parseBargeRequest("barge en scooter"), { velo: 1 });
    assert.deepEqual(parseBargeRequest("ticket barge pour 15 h"), { pieton: 1 });
    assert.deepEqual(parseBargeRequest("pieton 2, voiture 1"), { voiture: 1, pieton: 2 });
  });
});
