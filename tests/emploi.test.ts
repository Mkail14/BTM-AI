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

describe("offres France Travail : page publique de recherche", () => {
  const li = (id: string, title: string, company: string, place: string, contract: string, hours: string, published: string) =>
    `<li data-id-offre="${id}" class="result"><a id="pagelink" class="media with-fav" role="button" href="/offres/recherche/detail/${id}"><div class="media-body"><h2 data-intitule-offre="${id}" class="t4 media-heading"><span class="media-heading-title">${title}</span></h2><p translate="no" class="subtext">\n${company}\n - <span>${place}</span></p><p class="description">Texte...</p><p class="contrat visible-xs">${contract}\n - ${hours}</p><p class="date">\n${published}\n</p></div><div class="media-right media-middle hidden-xs"><p class="contrat">${contract}<span class="type-contrat">${hours}</span></p></div></a></li>`;
  const html = `<h1 class="title">\n482 offres\n<span class="subtitle">\n - Mayotte (976)\n</span></h1><ul>${li("216VDFR", "UN ADULTE RELAIS (H/F)", "MAIRIE", "976 - MAMOUDZOU", "CDI", "Temps plein", "Publié aujourd'hui")}${li("216VMNT", "Gestionnaire de paie (H/F)", "SOGEA MAYOTTE", "976 - Mayotte", "Intérim", "Non renseigné", "Publié il y a 3 jours")}</ul>`;
  // 25 novembre 2026, 10 h à Mayotte.
  const now = Date.parse("2026-11-25T07:00:00Z");

  it("lit le total et chaque offre avec employeur, commune, contrat, date et lien", async () => {
    const { parseFranceTravailPage } = await import("@/server/services/live/france-travail-site");
    const { offers, total } = parseFranceTravailPage(html, now);
    assert.equal(total, 482);
    assert.equal(offers.length, 2);
    const [first, second] = offers;
    assert.equal(first.id, "ft-216VDFR");
    assert.equal(first.title, "UN ADULTE RELAIS (H/F)");
    assert.equal(first.company, "MAIRIE");
    assert.equal(first.place, "Mamoudzou");
    assert.equal(first.kind, "CDI");
    assert.equal(first.hours, "Temps plein");
    assert.equal(first.date, "2026-11-24T21:00:00.000Z");
    assert.equal(first.source, "France Travail");
    assert.equal(first.link, "https://candidat.francetravail.fr/offres/recherche/detail/216VDFR");
    assert.equal(second.place, null);
    assert.equal(second.kind, "MIS");
    assert.equal(second.hours, null);
    assert.equal(second.date, "2026-11-21T21:00:00.000Z");
  });

  it("page changée : pas de total trouvé", async () => {
    const { parseFranceTravailPage } = await import("@/server/services/live/france-travail-site");
    assert.deepEqual(parseFranceTravailPage("<html><body>Nouveau site</body></html>", now), { offers: [], total: null });
  });
});
