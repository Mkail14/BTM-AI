// Copie les questions fréquentes du site (src/lib/help/faq.ts) dans l'APK, pour la page
// d'aide de l'app (HelpScreen.java), lisible même sans internet. À relancer quand la FAQ change :
//   (depuis « Version Site web ») node node_modules/tsx/dist/cli.mjs "../Version Android/tamilya_android/tools/faq-json.mjs"
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "..", "..", "Version Site web", "src", "lib", "help", "faq.ts");
const { FAQ, HELP_TOPICS } = await import(pathToFileURL(site).href);
const out = join(here, "..", "app", "src", "main", "assets", "aide", "faq.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ faq: FAQ, topics: HELP_TOPICS }, null, 1) + "\n");
console.log("FAQ copiée :", FAQ.reduce((n, t) => n + t.questions.length, 0), "questions ->", out);
