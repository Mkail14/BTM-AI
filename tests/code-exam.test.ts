import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { CodeExamSourceError, centerName, extractAccess, parseCenters, parseSessions } from "@/lib/code-exam/laposte";
import { enforceShimaore } from "@/lib/language/unknown-words";
import { fieldError, normalizePhone, requestSchema } from "@/lib/code-exam/candidate";

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
    assert.match(buildSystemPrompt(undefined, { teacher: true }), /creneaux-code[\s\S]*seule exception/);
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
    assert.equal(normalizePhone("0033 6 12 34 56 78"), "0612345678");
    assert.equal(normalizePhone("639123456"), null);
  });
});
