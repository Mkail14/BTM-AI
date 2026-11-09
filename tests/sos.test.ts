import assert from "node:assert/strict";
import { test } from "node:test";
import { sosAlertEmail, sosContactAddedEmail } from "../src/lib/email/templates";
import { payloadSchema } from "../src/lib/mesh/envelope";
import { sosContactsSchema } from "../src/lib/sos/contacts";

const replyKey = "A".repeat(43) + "=";

test("SOS : le format venu de l'app est accepté, position et batterie facultatives", () => {
  assert.ok(payloadSchema.safeParse({ kind: "sos", lat: -12.78, lng: 45.23, accuracy: 12, battery: 34, at: Date.now(), replyKey }).success);
  assert.ok(payloadSchema.safeParse({ kind: "sos", replyKey }).success);
  assert.ok(!payloadSchema.safeParse({ kind: "sos", battery: 140, replyKey }).success);
  assert.ok(!payloadSchema.safeParse({ kind: "sos", text: "x", replyKey }).success);
});

test("SOS : 4 proches au plus, champs vides et doublons retirés", () => {
  assert.deepEqual(sosContactsSchema.parse([" A@b.fr ", "", "a@b.fr", "c@d.fr"]), ["a@b.fr", "c@d.fr"]);
  assert.ok(!sosContactsSchema.safeParse(["pas-une-adresse"]).success);
  assert.ok(!sosContactsSchema.safeParse(["a@b.fr", "b@b.fr", "c@b.fr", "d@b.fr", "e@b.fr"]).success);
});

test("SOS : le mail donne la carte, la batterie et le 112", () => {
  const mail = sosAlertEmail("Amina", "amina@exemple.fr", { lat: -12.78, lng: 45.23, accuracy: 15, battery: 34, at: new Date() }, "https://btm.yt");
  assert.match(mail.subject, /Amina a besoin d'aide/);
  assert.match(mail.html, /google\.com\/maps\?q=-12\.780000,45\.230000/);
  assert.match(mail.text, /34 %/);
  assert.match(mail.text, /112/);
  const sansPosition = sosAlertEmail("Amina", null, { at: new Date() }, "https://btm.yt");
  assert.doesNotMatch(sansPosition.html, /google\.com\/maps/);
  assert.match(sosContactAddedEmail("Amina", "https://btm.yt").subject, /Amina/);
});
