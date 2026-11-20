import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

/**
 * Chaque route de src/app/api doit vérifier qui l'appelle (compte connecté, secret, signature,
 * ticket, clé de développeur...), sauf si elle est déclarée publique ci-dessous, exprès.
 * Une nouvelle route oubliée fait échouer ce test : on ajoute la vérification, ou on l'inscrit ici.
 */
const PUBLIQUES: Record<string, string> = {
  "accueil/conversation": "conversation d'exemple de l'accueil",
  "code-exam": "horaires publics de La Poste (lecture en cache)",
  cyclones: "cyclones en cours, données publiques",
  emploi: "offres d'emploi publiques, en cache",
  "emploi/evenements": "événements emploi publics, en cache",
  "mesh/key": "clé publique du serveur pour Tamilya Connect",
};

/** Ce qui compte comme vérification de l'appelant, dans la route ou dans son contrôleur. */
const GARDE =
  /getAuthContext|signedIn\(|isPartnerRequest|authorized\(request\)|verifyRelay|verifyWebhook|verifyHookSignature|verifySignature|readLiveTicket|findDeveloperKey|findDeveloperWidget|isSameOrigin/;

const API = join(process.cwd(), "src", "app", "api");
const SRC = join(process.cwd(), "src");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

/** Texte de la route et des contrôleurs qu'elle réexporte (@/server/controllers/...). */
function code(route: string): string {
  const text = readFileSync(route, "utf8");
  const controllers = [...text.matchAll(/from "@\/(server\/controllers\/[^"]+)"/g)].map((m) => readFileSync(join(SRC, `${m[1]}.ts`), "utf8"));
  return [text, ...controllers].join("\n");
}

describe("routes de l'API", () => {
  for (const route of routes(API)) {
    const name = relative(API, route).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
    it(`${name} vérifie qui l'appelle, ou est publique exprès`, () => {
      if (name in PUBLIQUES) return;
      assert.match(code(route), GARDE, `Route sans vérification : ${name}. Ajoute-la, ou inscris la route dans PUBLIQUES avec la raison.`);
    });
  }

  it("la liste des routes publiques ne garde pas de route disparue", () => {
    const names = new Set(routes(API).map((r) => relative(API, r).replace(/\\/g, "/").replace(/\/route\.ts$/, "")));
    for (const name of Object.keys(PUBLIQUES)) assert.ok(names.has(name), `Route publique introuvable : ${name}`);
  });
});
