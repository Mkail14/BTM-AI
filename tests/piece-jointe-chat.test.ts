import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAT_ATTACHMENT_MAX_BYTES, withAttachmentLabel } from "@/lib/chat/attachment";
import { chatRequestSchema } from "@/lib/chat/validation";

const pdf = { name: "facture.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.7").toString("base64") };

describe("photo ou document joint à une question", () => {
  it("accepte une photo ou un PDF avec la question", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "C'est quoi ce papier ?", attachment: pdf }).success, true);
    assert.equal(chatRequestSchema.safeParse({ message: "Et ça ?", attachment: { ...pdf, mimeType: "image/jpeg" } }).success, true);
  });

  it("refuse un autre format, un contenu abîmé ou trop lourd", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "?", attachment: { ...pdf, mimeType: "application/zip" } }).success, false);
    assert.equal(chatRequestSchema.safeParse({ message: "?", attachment: { ...pdf, data: "pas du base64 !" } }).success, false);
    const heavy = "A".repeat(Math.ceil(CHAT_ATTACHMENT_MAX_BYTES / 3) * 4 + 4);
    assert.equal(chatRequestSchema.safeParse({ message: "?", attachment: { ...pdf, data: heavy } }).success, false);
  });

  it("garde le nom du fichier dans la conversation, pas son contenu", () => {
    assert.equal(withAttachmentLabel("Résume-le", "facture.pdf"), "📎 facture.pdf\nRésume-le");
    assert.equal(withAttachmentLabel("Bonjour", undefined), "Bonjour");
  });
});
