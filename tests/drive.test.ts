import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DRIVE_FOLDER_MIME, formatBytes, guessDriveFolder, organizeDrive, type DriveItem } from "@/lib/drive/folders";
import { buildDriveAuthUrl, DRIVE_SCOPE, readDriveState } from "@/lib/drive/oauth";
import { googleLoginEmail } from "@/lib/drive/identity";

const folder = (id: string, mark: string): DriveItem => ({ id, name: id, mimeType: DRIVE_FOLDER_MIME, appProperties: { tamilya: mark } });

describe("rangement des documents", () => {
  it("propose le dossier d'après le nom du fichier", () => {
    assert.equal(guessDriveFolder("Passeport_Fatima.pdf"), "identite");
    assert.equal(guessDriveFolder("quittance-loyer-octobre.pdf"), "logement");
    assert.equal(guessDriveFolder("Fiche de Paie Mars.PDF"), "travail");
    assert.equal(guessDriveFolder("facture_EDM.pdf"), "factures");
    assert.equal(guessDriveFolder("Attestation d'hébergement Madi.pdf"), "logement");
  });

  it("préfère le mot le plus précis et ne coupe pas les mots", () => {
    assert.equal(guessDriveFolder("bulletin de salaire.pdf"), "travail");
    assert.equal(guessDriveFolder("bulletin T2.pdf"), "ecole");
    assert.equal(guessDriveFolder("technique.pdf"), "autres");
  });

  it("met dans Autres ce qui ne se reconnaît pas", () => {
    assert.equal(guessDriveFolder("IMG_2041.jpg"), "autres");
  });

  it("retrouve les dossiers et trie du plus récent au plus ancien", () => {
    const tree = organizeDrive([
      folder("r", "root"),
      folder("f1", "sante"),
      { id: "a", name: "vieux.pdf", mimeType: "application/pdf", parents: ["f1"], size: "2048", modifiedTime: "2026-01-01T00:00:00Z" },
      { id: "b", name: "recent.pdf", mimeType: "application/pdf", parents: ["f1"], modifiedTime: "2026-06-01T00:00:00Z" },
    ]);
    assert.equal(tree.rootId, "r");
    assert.equal(tree.folderIds.sante, "f1");
    assert.deepEqual(tree.files.map((file) => file.name), ["recent.pdf", "vieux.pdf"]);
    assert.equal(tree.files[0].size, null);
    assert.equal(tree.files[1].size, 2048);
    assert.equal(tree.files[1].folder, "sante");
  });

  it("garde dans Autres un fichier sorti de ses dossiers", () => {
    const tree = organizeDrive([{ id: "a", name: "x.pdf", mimeType: "application/pdf", parents: ["inconnu"] }]);
    assert.equal(tree.files[0].folder, "autres");
  });

  it("écrit les tailles à la française", () => {
    assert.equal(formatBytes(500), "500 o");
    assert.equal(formatBytes(1536), "1,5 Ko");
    assert.equal(formatBytes(15 * 1024 ** 3), "15,0 Go");
  });
});

describe("connexion à Google Drive", () => {
  const key = "secret-de-test";
  const origin = "https://tamilya.yt";
  const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? undefined;

  it("ne demande que l'accès aux fichiers créés par Tamilya, avec un jeton durable", () => {
    const url = new URL(buildDriveAuthUrl("compte-1", origin, 1_000, key)!);
    assert.deepEqual(url.searchParams.get("scope")!.split(" "), ["openid", "email", DRIVE_SCOPE]);
    assert.equal(url.searchParams.get("login_hint"), null);
    const hinted = new URL(buildDriveAuthUrl("compte-1", origin, 1_000, key, "ali@exemple.fr")!);
    assert.equal(hinted.searchParams.get("login_hint"), "ali@exemple.fr");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.match(url.searchParams.get("prompt")!, /consent/);
    assert.equal(url.searchParams.get("redirect_uri"), `${origin}/documents/connexion`);
  });

  it("connecté au site avec Gmail : Google va droit à « Autoriser », sans écran de choix du compte", () => {
    const same = new URL(buildDriveAuthUrl("compte-1", origin, 1_000, key, "ali@gmail.com", true)!);
    assert.equal(same.searchParams.get("prompt"), "consent");
    assert.equal(same.searchParams.get("login_hint"), "ali@gmail.com");
    const other = new URL(buildDriveAuthUrl("compte-1", origin, 1_000, key, "ali@exemple.fr")!);
    assert.equal(other.searchParams.get("prompt"), "select_account consent");
  });

  it("trouve le Gmail avec lequel la personne se connecte, et rien sans compte Google", () => {
    assert.equal(googleLoginEmail([{ provider: "email" }, { provider: "google", identity_data: { sub: "1", email: "ali@gmail.com" } }]), "ali@gmail.com");
    assert.equal(googleLoginEmail([{ provider: "email", identity_data: { email: "ali@exemple.fr" } }]), null);
    assert.equal(googleLoginEmail(null), null);
  });

  it("accepte le retour du compte qui a lancé la demande", () => {
    const state = readDriveState(stateOf(buildDriveAuthUrl("compte-1", origin, 1_000, key)!), "compte-1", 2_000, key);
    assert.equal(state?.redirectUri, `${origin}/documents/connexion`);
  });

  it("refuse un autre compte, un lien expiré ou un lien modifié", () => {
    const state = stateOf(buildDriveAuthUrl("compte-1", origin, 1_000, key)!);
    assert.equal(readDriveState(state, "compte-2", 2_000, key), null);
    assert.equal(readDriveState(state, "compte-1", 1_000 + 11 * 60 * 1000, key), null);
    assert.equal(readDriveState(`${state}x`, "compte-1", 2_000, key), null);
    assert.equal(readDriveState(undefined, "compte-1", 2_000, key), null);
  });
});
