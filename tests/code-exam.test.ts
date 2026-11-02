import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { CodeExamSourceError, centerName, extractAccess, parseCenters, parseSessions } from "@/lib/code-exam/laposte";
import { enforceShimaore } from "@/lib/language/unknown-words";
import { fieldError, normalizePhone, requestSchema } from "@/lib/code-exam/candidate";
import { FOOD_CATALOG, FOOD_DELIVERY_FEE_CENTS, priceOrder } from "@/lib/food/catalog";
import { dishKindOf, matchFoodQuery } from "@/lib/food/match";

// Extraits des réponses réelles de lecode.laposte.fr (novembre 2026).
const PAGE = `<script>window.__NUXT__.config={public:{siteRoot:"https://www.lecode.laposte.fr",idPartenaire:"partenaire-1",baseApiVente:"https:\\u002F\\u002Fapi.laposte.fr",apiVente:"/silex-vente/v1",apiKey:"cle-1"}}</script>`;

const SALLES = [
  { id: 262, nom: "Bureau La Poste - KAWENI ", adresse: { codePostal: "97600", ville: "MAMOUDZOU" } },
  { id: 1528, nom: "Bureau La Poste - MTSAPERE Mamoudzou", adresse: { codePostal: "97600", ville: "Mtsapere" } },
  { id: 9, nom: "Bureau La Poste - PARIS", adresse: { codePostal: "75001", ville: "PARIS" } },
];

const SESSIONS = [
  { dateDebut: "2026-11-04T08:15:00.000Z", placesDisponibles: 4, statut: "OUVERT", isPrivatisee: false },
  { dateDebut: "2026-11-03T09:15:00.000Z", placesDisponibles: 0, statut: "OUVERT", isPrivatisee: false },
  { dateDebut: "2026-11-05T09:15:00.000Z", placesDisponibles: 3, statut: "OUVERT", isPrivatisee: true },
  { dateDebut: "2026-11-06T09:15:00.000Z", placesDisponibles: 3, statut: "ANNULE", isPrivatisee: false },
  { dateDebut: "2026-11-01T09:15:00.000Z", placesDisponibles: 2, statut: "OUVERT", isPrivatisee: false },
];

describe("horaires du code (La Poste)", () => {
  const now = new Date("2026-11-02T07:00:00Z").getTime();

  it("relit la clé et l'adresse de l'API dans la page publique", () => {
    assert.deepEqual(extractAccess(PAGE), {
      base: "https://api.laposte.fr/silex-vente/v1",
      apiKey: "cle-1",
      partnerId: "partenaire-1",
    });
  });

  it("signale une page changée au lieu de planter", () => {
    assert.throws(() => extractAccess("<html></html>"), (e: CodeExamSourceError) => e.step === "page");
    assert.throws(() => parseCenters({ salles: [] }), (e: CodeExamSourceError) => e.step === "format");
  });

  it("ne garde que les bureaux de Mayotte, avec un nom lisible", () => {
    assert.deepEqual(
      parseCenters(SALLES).map((c) => [c.id, c.name]),
      [
        ["262", "Kaweni"],
        ["1528", "Mtsapere Mamoudzou"],
      ],
    );
    assert.equal(centerName("Bureau La Poste - DZAOUDZI Labattoir"), "Dzaoudzi Labattoir");
  });

  it("garde les sessions ouvertes à venir, complètes comprises, dans l'ordre", () => {
    assert.deepEqual(parseSessions(SESSIONS, "262", now), [
      { centerId: "262", startsAt: "2026-11-03T09:15:00.000Z", places: 0 },
      { centerId: "262", startsAt: "2026-11-04T08:15:00.000Z", places: 4 },
    ]);
  });

  it("apprend le tableau à Awa dans la conversation écrite, mode maître compris", () => {
    assert.match(buildSystemPrompt(undefined, {}), /creneaux-code/);
    assert.match(buildSystemPrompt(undefined, { teacher: true }), /creneaux-code[\s\S]*exception/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { voice: true }), /creneaux-code/);
  });

  it("garde le bloc du tableau intact en mode maître", () => {
    const reply = "Wawe, ono ndjema.\n\n```creneaux-code\n```";
    assert.match(enforceShimaore(reply), /```creneaux-code\n```/);
    assert.match(enforceShimaore("Voici les créneaux disponibles.\n```creneaux-code\n```"), /\n```creneaux-code\n```$/);
  });
});

describe("informations du candidat", () => {
  const valid = {
    civility: "Mme",
    lastName: "Abdallah",
    firstName: "Fatima",
    birthDate: "2008-05-14",
    city: "Mamoudzou",
    phone: "+262 639 12 34 56",
    email: "fatima@example.com",
    centerId: "262",
    startsAt: "2026-11-04T08:15:00.000Z",
    examType: "B",
    neph: "2301 7610 0123",
    snu: true,
  };

  it("accepte des informations complètes et les met au propre", () => {
    const parsed = requestSchema.parse(valid);
    assert.equal(parsed.phone, "0639123456");
    assert.equal(parsed.neph, "230176100123");
  });

  it("refuse ce qui ne peut pas être vrai", () => {
    assert.match(fieldError("birthDate", "2020-01-01") ?? "", /15 ans/);
    assert.match(fieldError("phone", "12345") ?? "", /Numéro invalide/);
    assert.match(fieldError("neph", "1234") ?? "", /12 chiffres/);
    assert.match(fieldError("email", "fatima@") ?? "", /e-mail/);
    assert.match(fieldError("lastName", "R2D2") ?? "", /lettres/);
    assert.match(fieldError("civility", "") ?? "", /Madame ou Monsieur/);
    assert.equal(fieldError("lastName", "M'Tsangamouji-Ali"), null);
  });

  it("reconnaît les numéros de Mayotte et de métropole", () => {
    assert.equal(normalizePhone("0639.12.34.56"), "0639123456");
    assert.equal(normalizePhone("0033 6 24 81 57 93"), "0624815793");
    assert.equal(normalizePhone("639123456"), null);
  });
});

describe("commande de repas (prototype)", () => {
  it("calcule le total avec les prix du catalogue et la livraison", () => {
    const order = priceOrder("brochette-mangrove", [
      { itemId: "brochette-mangrove-1", quantity: 2 },
      { itemId: "brochette-mangrove-2", quantity: 1 },
    ]);
    assert.equal(order?.itemsCents, 250 * 2 + 1200);
    assert.equal(order?.totalCents, 250 * 2 + 1200 + FOOD_DELIVERY_FEE_CENTS);
  });

  it("refuse un plat inconnu, d'un autre restaurant, ou une quantité invalide", () => {
    assert.equal(priceOrder("brochette-mangrove", [{ itemId: "delices-dashi-1", quantity: 1 }]), null);
    assert.equal(priceOrder("brochette-mangrove", [{ itemId: "brochette-mangrove-1", quantity: 0 }]), null);
    assert.equal(priceOrder("brochette-mangrove", [{ itemId: "brochette-mangrove-1", quantity: 1.5 }]), null);
    assert.equal(priceOrder("inconnu", [{ itemId: "brochette-mangrove-1", quantity: 1 }]), null);
    assert.equal(priceOrder("brochette-mangrove", []), null);
  });

  it("n'a ni plat gratuit ni identifiant de plat en double", () => {
    const items = FOOD_CATALOG.flatMap((r) => r.menu.flatMap((s) => s.items));
    assert.ok(items.every((i) => i.priceCents > 0));
    assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  });

  it("reconnaît les restaurants cités, même mal écrits", () => {
    const find = (query: string) => matchFoodQuery(query, FOOD_CATALOG).restaurantId;
    assert.equal(find("Délices d'Ashi"), "delices-dashi");
    assert.equal(find("delice d ashi"), "delices-dashi");
    assert.equal(find("brochette mangrove"), "brochette-mangrove");
    assert.equal(find("jéjé pizza"), "jeje-pizza-mamoudzou");
    assert.equal(find("jeje kebab"), "jeje-kebab-mamoudzou");
    assert.equal(find("kebab house"), "kebab-house");
    assert.equal(find("tacos"), null);
    assert.equal(matchFoodQuery("tacos", FOOD_CATALOG).kind, "tacos");
  });

  it("« tacos » ne montre que des tacos, et reconnaît les plats asiatiques", () => {
    const tacos = FOOD_CATALOG.flatMap((r) =>
      r.menu.flatMap((s) => s.items.filter((i) => dishKindOf(i, s.title, r.kind) === "tacos").map((i) => i.name)),
    );
    assert.ok(tacos.length >= 10);
    assert.deepEqual(
      tacos.filter((name) => /caf|th[ée]|frite|potatoes|sandwich|assiette|milk/i.test(name)),
      [],
    );
    assert.equal(dishKindOf({ name: "Nouilles au boeuf" }, "Nouilles", "Spécialités chinoises"), "asiatique");
    assert.equal(dishKindOf({ name: "Sarcives" }, "ENTREE", "Restaurant asiatique"), "asiatique");
  });

  it("n'apprend la commande de repas à Awa que pour les comptes autorisés", () => {
    assert.doesNotMatch(buildSystemPrompt(undefined, {}), /commande-repas/);
    assert.match(buildSystemPrompt(undefined, { foodOrdering: true }), /commande-repas/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { foodOrdering: true, voice: true }), /commande-repas/);
  });
});

describe("bureau du code le plus proche", () => {
  it("classe les bureaux depuis la commune, barge comprise", async () => {
    const { officesByDistance } = await import("@/lib/code-exam/offices");
    assert.equal(officesByDistance("Bandraboua")?.[0].name, "Dzoumogne");
    assert.match(officesByDistance("Pamandzi")?.[0].name ?? "", /Pamandzi|Dzaoudzi/);
    assert.equal(officesByDistance("Mamoudzou")?.at(-1)?.barge, true);
    assert.equal(officesByDistance("Paris"), null);
  });

  it("donne à Awa l'adresse et la consigne de répondre sans le tableau", () => {
    const prompt = buildSystemPrompt(undefined, { home: { commune: "Sada", nearestOffices: "Combani (~9 km)" } });
    assert.match(prompt, /elle habite à Sada/);
    assert.match(prompt, /SANS le bloc/);
  });
});

describe("position et commune", () => {
  it("retrouve la commune d'une position GPS", async () => {
    const { nearestCommune } = await import("@/lib/geo/communes");
    assert.equal(nearestCommune({ lat: -12.7806, lng: 45.2279 }), "Mamoudzou");
    assert.equal(nearestCommune({ lat: -12.7967, lng: 45.2797 }), "Pamandzi");
    assert.equal(nearestCommune({ lat: -12.85, lng: 45.105 }), "Sada");
  });
});
