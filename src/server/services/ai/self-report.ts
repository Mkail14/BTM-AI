import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { getFeatureSwitches } from "@/server/services/site/features";
import { FEATURES } from "@/lib/site/features-rules";
import type { TamilyaBrain } from "@/server/services/ai/brain";

/*
 * Pour son administrateur seulement : Tamilya connaît chacune de ses fonctions
 * (comment elle marche, ce qu'elle vaut, allumée pour tous ou non) et ses chiffres
 * du moment. Demandé le 2026-11-26. La liste vient de /admin/fonctionnalites
 * (FEATURES) : une fonction ajoutée là apparaît ici toute seule.
 */

/** Ce qui n'est pas dans /admin/fonctionnalites : toujours là, pour tout le monde. */
const ALWAYS = [
  "Conversation écrite : Gemini écrit tes réponses ; le serveur ajoute à chaque message ce qui sert (vocabulaire, connaissances, mémoire, infos en direct).",
  "Recherche sur internet : Wikipédia seulement (les 3 premiers articles lus), plus Google quand la clé Gemini l'accepte. DuckDuckGo a été retiré le 2026-11-26 (il bloquait le site). Limite : pas d'actualité fine ni de petits sites.",
  "Cartes et lieux de Mayotte : OpenFreeMap et OSRM, gratuits ; seulement des faits sûrs sur les communes.",
  "Shimaoré : seulement le vocabulaire, les phrases et la grammaire validés. Un mot inconnu part dans les Questions de l'admin ; une correction en conversation va au dictionnaire et compte dès le message suivant.",
  "Mémoire : tu te souviens de ce que chaque utilisateur t'a dit d'important (page Mémoire de l'admin).",
  "Application Android : le site dans une application, plus Tamilya Connect (messages sans internet, sur Android seulement, jamais sur le site).",
];

const COUNT_WAIT_MS = 2000;
const CACHE_MS = 60_000;
let cached: { counts: { words: number | null; questions: number | null }; at: number } | null = null;

/** Questions et mots en attente de l'admin, comptés sans les lire (2 s au plus, gardés 1 min). */
async function pendingCounts(): Promise<{ words: number | null; questions: number | null }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.counts;
  const admin = getSupabaseAdminClient();
  if (!admin) return { words: null, questions: null };
  const count = (table: string) =>
    admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count: n, error }) => (error ? null : (n ?? 0)));
  const counts = await Promise.race([
    Promise.all([count("awa_word_requests"), count("awa_questions")]).then(([words, questions]) => ({ words, questions })),
    new Promise<{ words: null; questions: null }>((resolve) => setTimeout(() => resolve({ words: null, questions: null }), COUNT_WAIT_MS)),
  ]).catch(() => ({ words: null, questions: null }));
  if (counts.words !== null || counts.questions !== null) cached = { counts, at: Date.now() };
  return counts;
}

/** Le bloc à donner à Tamilya quand son administrateur lui parle. */
export async function adminSelfReport(brain: TamilyaBrain): Promise<string> {
  const [switches, pending] = await Promise.all([getFeatureSwitches().catch(() => null), pendingCounts()]);
  const features = FEATURES.map((f) => {
    const on = switches ? switches[f.id] : f.default;
    const notes = [
      on ? "allumée pour tous" : "éteinte pour le public (les admins l'ont)",
      "restricted" in f && f.restricted ? `attente d'accord : ${f.restricted}` : null,
      "costly" in f && f.costly ? "coûte des appels Gemini" : null,
    ].filter(Boolean);
    return `- ${f.label} : ${"details" in f && f.details ? f.details : f.summary} (${notes.join(" ; ")})`;
  });
  const pendingLine =
    pending.words === null || pending.questions === null
      ? "- En attente de ton administrateur : pas lu à temps cette fois (regarde Demandes et Questions dans /admin)."
      : `- En attente de ton administrateur : ${pending.words} mot(s) inconnu(s) signalé(s) et ${pending.questions} question(s).`;
  return [
    "TES FONCTIONS ET TES CHIFFRES (fiable, pour ton administrateur ; s'il te demande ce que tu sais faire, comment marche une fonction ou où tu en es, réponds avec ceci, sans rien inventer) :",
    "Toujours là :",
    ...ALWAYS.map((line) => `- ${line}`),
    "Fonctions réglées dans /admin/fonctionnalites :",
    ...features,
    "Tes chiffres en ce moment :",
    `- Shimaoré : ${brain.words.length} mots, ${brain.lexicon.length} phrases et ${brain.grammar.length} règles de grammaire validés.`,
    pendingLine,
    `- Connaissances vérifiées : ${brain.knowledge.length} fiche(s).`,
    "Ce que ces chiffres ne disent pas (la justesse de tes réponses, la vitesse du vocal), tu ne le mesures pas toi-même : dis-le au lieu de l'inventer.",
  ].join("\n");
}
