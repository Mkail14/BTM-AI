import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addWhenToBlock, parseCodeExamWhen, readCodeExamBlock } from "@/lib/code-exam/when";

// Lundi 2 novembre 2026, 20 h 53 à Mayotte (UTC+3).
const now = new Date("2026-11-02T17:53:00Z");
const when = (message: string) => parseCodeExamWhen(message, now);

describe("jour voulu pour le code de la route", () => {
  it("comprend demain, après-demain et aujourd'hui", () => {
    assert.deepEqual(when("je veux que tu me reserve une date pour demain"), { day: "2026-11-03", moment: null });
    assert.equal(when("après-demain c'est possible ?").day, "2026-11-04");
    assert.equal(when("il reste de la place aujourd'hui ?").day, "2026-11-02");
  });

  it("comprend un jour de la semaine et le moment", () => {
    assert.deepEqual(when("vendredi matin à Mtsapéré"), { day: "2026-11-06", moment: "matin" });
    assert.equal(when("lundi prochain").day, "2026-11-09");
    assert.equal(when("jeudi après-midi").moment, "apres-midi");
  });

  it("comprend une date", () => {
    assert.equal(when("le 12 novembre").day, "2026-11-12");
    assert.equal(when("le 15").day, "2026-11-15");
    assert.equal(when("le 1er").day, "2026-12-01");
    assert.equal(when("le 10/12").day, "2026-12-10");
  });

  it("ne voit pas de date quand il n'y en a pas", () => {
    assert.deepEqual(when("où passer le code près de chez moi ?"), { day: null, moment: null });
    assert.equal(when("j'ai 2 questions").day, null);
  });

  it("inscrit le jour dans le bloc et le relit", () => {
    const text = "Voilà :\n```creneaux-code\nMtsapéré Mamoudzou\n```";
    const withWhen = addWhenToBlock(text, { day: "2026-11-03", moment: "matin" });
    assert.match(withWhen, /jour: 2026-11-03\nmoment: matin/);
    assert.equal(addWhenToBlock(withWhen, { day: "2026-11-03", moment: "matin" }), withWhen);
    const inner = withWhen.split("```creneaux-code\n")[1].split("```")[0];
    assert.deepEqual(readCodeExamBlock(inner), { office: "Mtsapéré Mamoudzou", when: { day: "2026-11-03", moment: "matin" } });
    assert.deepEqual(readCodeExamBlock(""), { office: "", when: { day: null, moment: null } });
  });
});
