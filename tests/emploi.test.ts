import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectJobs, jobsBlock, jobsSpecOf, jobsTownFor } from "@/lib/emploi/intent";

describe("offres d'emploi : demande reconnue", () => {
  for (const message of [
    "je veux voir tout les poste actuel a mayotte",
    "montre moi les offres d'emploi",
    "Il y a quoi comme offres de travail à Koungou ?",
    "je cherche du boulot",
    "je recherche un CDI à Mamoudzou",
    "qui recrute en ce moment ?",
    "les postes à pourvoir",
    "il y a des jobs ?",
    "je cherche un poste de boulanger",
    "je voudrais un contrat dans le BTP",
    "j'aimerais travailler comme chauffeur",
  ]) {
    it(message, () => assert.equal(detectJobs(message), true));
  }

  for (const message of ["mon travail me fatigue", "je vais à la poste", "c'est quoi le chômage", "j'ai un poste de télé", "je cherche le bureau de poste", "je dois travailler demain"]) {
    it(`pas une demande : ${message}`, () => assert.equal(detectJobs(message), false));
  }
});

describe("offres d'emploi : commune et bloc", () => {
  it("lit la commune", () => {
    assert.equal(jobsTownFor("qui recrute à Koungou ?"), "Koungou");
    assert.equal(jobsTownFor("offres à Kawéni"), "Mamoudzou");
    assert.equal(jobsTownFor("offres d'emploi"), "");
  });

  it("relit le bloc qu'il écrit", () => {
    assert.deepEqual(jobsSpecOf(jobsBlock({ metier: "infirmier", ville: "Sada" })), { metier: "infirmier", ville: "Sada" });
    assert.deepEqual(jobsSpecOf(jobsBlock()), { metier: "", ville: "" });
  });

  it("ignore le modèle recopié tel quel", () => {
    assert.deepEqual(jobsSpecOf("metier: <métier cherché ou rien>\nville: "), { metier: "", ville: "" });
    assert.equal(jobsSpecOf("metier: rien").metier, "");
  });
});

describe("événements emploi", async () => {
  const { detectEvents, detectIdle, eventLine } = await import("@/lib/emploi/events");

  for (const message of ["il y a des job datings ?", "des événements emploi cette semaine ?", "un salon de l'emploi bientôt ?", "une réunion d'information collective"]) {
    it(`demande : ${message}`, () => assert.equal(detectEvents(message), true));
  }
  for (const message of ["je sais pas quoi faire de mes journées", "je m'ennuie grave", "j'ai rien à faire", "je tourne en rond à la maison", "je sais plus quoi faire"]) {
    it(`journées vides : ${message}`, () => assert.equal(detectIdle(message), true));
  }
  for (const message of ["je sais pas quoi faire à manger", "un événement ce soir ?", "je suis fatigué"]) {
    it(`rien : ${message}`, () => {
      assert.equal(detectEvents(message), false);
      assert.equal(detectIdle(message), false);
    });
  }

  it("ligne du prompt en heure de Mayotte", () => {
    const line = eventLine({ id: 1, title: "Job Dating Restauration", type: "Job dating", town: "Mamoudzou", start: "2026-11-26T05:30:00Z", end: null, remote: false, placesLeft: 10, organizer: null, link: "" });
    assert.match(line, /jeudi 26 novembre.*08:30.*Mamoudzou.*10 places/);
  });
});

describe("offres d'emploi : flux Emploi Territorial", () => {
  const item = (guid: string, title: string, employer: string, place: string, deadline: string, type = "Emploi permanent - vacance d'emploi") => `
    <item>
      <guid isPermaLink="false">https://www.emploi-territorial.fr/:${guid}</guid>
      <title><![CDATA[${title}]]></title>
      <link><![CDATA[https://www.emploi-territorial.fr/offre/${guid.toLowerCase()}-poste?mtm_campaign=rss]]></link>
      <description><![CDATA[
        <div class="employeur"><strong>Employeur : </strong> ${employer}</div>
        <div class="metier"><strong>Métier(s) : </strong> Chargé d&#039;accueil</div>
        <div class="datecand"><strong>Date limite de candidature : </strong> ${deadline}</div>
        <div class="typeemploi"><strong>Type d'emploi : </strong> ${type}</div>
        <div class="tempstravail"><strong>Temps de travail : </strong> Temps complet (35h00)</div>
        <div class="lieutravail"><strong>Lieu de travail : </strong> ${place}</div>
      ]]></description>
      <pubDate>Fri, 13 Nov 2026 00:00:00 +0000</pubDate>
    </item>`;
  const xml = `<rss><channel><title>Emploi-Territorial</title>${item("O976261112000177", "Agent (e ) administratif (ve)", "COMMUNE DE CHIRONGUI", "Chirongui", "14/12/2026")}${item("O976261112000200", "Gardien", "CONSEIL DEPARTEMENTAL DE MAYOTTE", "M'Tsangamouji", "01/12/2026", "Remplacement temporaire d'un agent sur emploi permanent")}</channel></rss>`;

  it("lit chaque offre avec employeur, commune, date limite et lien propre", async () => {
    const { parseTerritorialRss } = await import("@/server/services/live/emploi-territorial");
    const [first, second] = parseTerritorialRss(xml);
    assert.equal(first.id, "et-O976261112000177");
    assert.equal(first.title, "Agent (e ) administratif (ve)");
    assert.equal(first.company, "Commune de Chirongui");
    assert.equal(first.place, "Chirongui");
    assert.equal(first.contract, "Emploi permanent");
    assert.equal(first.kind, "PUBLIC");
    assert.equal(first.job, "Chargé d'accueil");
    assert.equal(first.hours, "Temps complet (35h00)");
    assert.equal(first.deadline, "2026-12-14");
    assert.equal(first.date, "2026-11-13T00:00:00.000Z");
    assert.equal(first.source, "Emploi Territorial");
    assert.equal(first.link, "https://www.emploi-territorial.fr/offre/o976261112000177-poste");
    // « M'Tsangamouji » devient la commune telle que la liste l'écrit, pour que le filtre de commune les regroupe.
    assert.equal(second.place, "Mtsangamouji");
    assert.equal(second.company, "Conseil Departemental de Mayotte");
    assert.equal(second.contract, "Remplacement");
  });

  it("ignore un élément sans titre ou avec un lien étranger", async () => {
    const { parseTerritorialRss } = await import("@/server/services/live/emploi-territorial");
    const bad = `<rss><item><title>Pub</title><link>https://exemple.com/x</link></item><item><title></title><link>https://www.emploi-territorial.fr/offre/x</link></item></rss>`;
    assert.deepEqual(parseTerritorialRss(bad), []);
  });
});

describe("offres d'emploi : la liste ne s'ouvre jamais vide", () => {
  const offer = (title: string, place: string, job: string | null = null) => ({
    id: title, title, company: null, place, contract: null, kind: "PUBLIC" as const, hours: null, salary: null, job, date: null, deadline: null, source: "Emploi Territorial", link: "",
  });
  const offers = [offer("Assistant (e ) administrative", "Koungou"), offer("Secrétaire de mairie", "Sada"), offer("Policier municipal", "Mamoudzou", "Agent de police")];

  it("garde des filtres qui trouvent quelque chose", async () => {
    const { fixJobsSpec, matchJobs } = await import("@/lib/emploi/intent");
    assert.deepEqual(fixJobsSpec(offers, { metier: "administrative", ville: "Koungou" }), { metier: "administrative", ville: "Koungou" });
    assert.equal(matchJobs(offers, { metier: "police" }).length, 1);
  });

  it("métier absent de la commune mais présent ailleurs : toute l'île", async () => {
    const { fixJobsSpec } = await import("@/lib/emploi/intent");
    assert.deepEqual(fixJobsSpec(offers, { metier: "secrétaire", ville: "Koungou" }), { metier: "secrétaire", ville: "" });
  });

  it("métier absent partout : sans métier, commune gardée", async () => {
    const { fixJobsSpec } = await import("@/lib/emploi/intent");
    assert.deepEqual(fixJobsSpec(offers, { metier: "boulanger", ville: "Koungou" }), { metier: "", ville: "Koungou" });
  });
});
