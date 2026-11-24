import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseApplyInfo } from "@/server/services/live/emploi-territorial-candidature";

/** Morceaux recopiés de vraies pages d'offres de Mayotte (2026-11-25). */
const page = (items: string, extra = "") => `
<a href='/candidature/o976261124000973-animateur-mediabus' class='btn'>Déposer ma candidature</a>${extra}
<h3 class="offre-category">Contact et modalités de candidature</h3>
<div class="p-3 card-body">${items}</div>
<div class="offre-item-text px-3 card-body" id="div_trav_handicap">Travailleurs handicapés</div>
<footer><a href="mailto:contact@emploi-territorial.fr">contact</a></footer>`;

const item = (label: string, value: string, cls = "value") =>
  `<div class="offre-item row p-2"><div class="offre-item-label col-12 col-sm-4 font-weight-bold">${label}</div>
   <div class="offre-item-${cls} col-12 col-sm-8">${value}</div></div>`;

describe("Emploi Territorial : comment postuler", () => {
  it("mail écrit dans le texte (Bandrélé)", () => {
    const info = parseApplyInfo(
      page(item("Contact", "0269638081") + item("Informations complémentaires", "CV et lettre de motivations à transmettre à l&#039;adresse email suivante: grh@bandrele.yt", "text")),
    );
    assert.equal(info.way, "mail");
    assert.deepEqual(info.emails, ["grh@bandrele.yt"]);
    assert.equal(info.phone, "0269638081");
    assert.match(info.form ?? "", /^https:\/\/www\.emploi-territorial\.fr\/candidature\//);
  });

  it("site de l'employeur (Département)", () => {
    const info = parseApplyInfo(
      page(
        item("Informations complémentaires", "Cv et lettre de motivation à déposer sur le site de l&#039;employeur : https://recrutements.mayotte.fr", "text") +
          item("Lien de candidature", '<a href="https://recrutements.mayotte.fr" target="lien_externe_set" rel="noopener">https://recrutements.mayotte.fr</a>'),
      ),
    );
    assert.equal(info.way, "site");
    assert.deepEqual(info.links, ["https://recrutements.mayotte.fr"]);
    assert.deepEqual(info.emails, []);
  });

  it("courrier (Sada), sans bouton du site", () => {
    const html = page(item("Informations complémentaires", "Candidature à adresser à <br />\nMonsieur le Maire de Sada<br />\nBP 107<br />\n97640 SADA", "text")).replace(/<a href='\/candidature[^>]*>[^<]*<\/a>/, "");
    const info = parseApplyInfo(html);
    assert.equal(info.way, "courrier");
    assert.equal(info.form, null);
    assert.equal(info.postal, "Candidature à adresser à\nMonsieur le Maire de Sada\nBP 107\n97640 SADA");
  });

  it("seulement le bouton d'Emploi Territorial", () => {
    const info = parseApplyInfo(page(item("Contact", "0639974817") + item("Informations complémentaires", "Poste ouvert uniquement aux fonctionnaires titulaires.", "text")));
    assert.equal(info.way, "formulaire");
    assert.equal(info.postal, null);
  });

  it("page changée : rien trouvé", () => {
    const info = parseApplyInfo("<html><body>autre chose</body></html>");
    assert.equal(info.way, "inconnu");
    assert.equal(info.note, null);
  });
});
