/**
 * Équipe d'agents de Tamilya : qui appeler pour ce message ? Décidé par des
 * règles, sans appel au modèle (choisir ne doit rien coûter). Une question
 * simple n'appelle personne ; une question difficile appelle 2 ou 3
 * spécialistes au plus, jamais toute l'équipe.
 *
 * Rôles et ce qu'ils font vraiment :
 * - coordinateur (team.ts) : choisit, lance en parallèle, borne temps et jetons, transmet les notes ;
 * - chercheur, analyste, développeur, linguiste, planificateur : un appel Gemini court chacun ;
 * - vérificateur : relit les notes des autres avant la réponse (seulement si un fait vient d'internet) ;
 * - mémoire : sans appel, choisit les souvenirs utiles et ne les donne qu'aux agents qui en ont besoin ;
 * - audio et narrateur : moteur de la lecture en 3D et des chansons (src/lib/lecture, src/lib/music), pas ici.
 */
import { isComplexRequest, needsWebSearch } from "../depth";

export type SpecialistId = "chercheur" | "analyste" | "developpeur" | "linguiste" | "planificateur";

export type TeamPlan = {
  /** Spécialistes à appeler en parallèle, du plus utile au moins utile (3 au plus). */
  specialists: SpecialistId[];
  /** Le vérificateur relit les notes avant la réponse. */
  verify: boolean;
  /** Pourquoi cette équipe (journaux du serveur). */
  reason: string;
};

export const MAX_SPECIALISTS = 3;

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/’/g, "'");

const LINGUIST = /\b(shimaore|shimaor|mahorais|kibushi|traduis|traduire|traduction|tradui[st]?|comment (?:on|tu) dit|comment dit-on|ca veut dire|veut dire quoi|que veut dire|signifie)\b/;
const DEVELOPER =
  /\b(code|coder|bug|beug|erreur \d+|message d'erreur|plante|application|appli|site (?:web|internet)|logiciel|ordinateur|pc|android|iphone|smartphone|wifi|wi-fi|routeur|box internet|excel|tableur|formule|python|javascript|html|css|sql|programm\w*|serveur|base de donnees|api|mot de passe|piratage|virus)\b/;
const PLANNER =
  /\b(plan|planifie\w*|planning|etapes?|organise\w*|projet|demarches?|lancer|monter|creer (?:une|un|mon|ma)|ouvrir (?:une|un|mon|ma)|calendrier|programme|par ou commencer|comment m'y prendre|feuille de route|objectifs?)\b/;
const ANALYST =
  /\b(analyse\w*|compare\w*|comparaison|difference|avantages?|inconvenients?|rentab\w*|budget|cout\w*|prix|chiffres?|calcul\w*|risques?|strategie|avis|conseil\w*|vaut-il mieux|lequel|laquelle|choisir|pourquoi)\b/;

/** Messages qui ont déjà leur propre chemin (commande, ticket, carte, chanson…) : pas d'équipe. */
export type PlanContext = {
  /** Réponse à l'oral : la vitesse prime, jamais d'équipe. */
  voice: boolean;
  /** Mode maître (leçon de shimaoré) : chemin à part. */
  master: boolean;
  /** Un parcours dédié s'ouvre déjà (repas, barge, devis, trajet, cyclone, chanson, lecture, attestation). */
  dedicatedFlow: boolean;
  /** La personne conteste la réponse précédente. */
  challenged: boolean;
  /** Personne connectée : les visiteurs sans compte n'ouvrent pas d'équipe (coût). */
  signedIn: boolean;
};

const SOLO = (reason: string): TeamPlan => ({ specialists: [], verify: false, reason });

export function planTeam(message: string, context: PlanContext): TeamPlan {
  if (context.voice) return SOLO("vocal");
  if (context.master) return SOLO("mode maître");
  if (context.dedicatedFlow) return SOLO("parcours dédié");
  if (!context.signedIn) return SOLO("visiteur sans compte");
  const complex = context.challenged || isComplexRequest(message);
  if (!complex) return SOLO("question simple");

  const text = normalize(message);
  const picked: SpecialistId[] = [];
  const research = context.challenged || needsWebSearch(message);
  if (research) picked.push("chercheur");
  if (LINGUIST.test(text)) picked.push("linguiste");
  if (DEVELOPER.test(text)) picked.push("developpeur");
  if (PLANNER.test(text)) picked.push("planificateur");
  // Question de shimaoré : pas d'analyste, qui inventait des mots (essai réel du 2026-11-08) ;
  // seul le linguiste, limité au dictionnaire validé, travaille dessus.
  const shimaore = picked.includes("linguiste");
  if (!shimaore && (ANALYST.test(text) || picked.length === 0)) picked.push("analyste");

  const specialists = picked.slice(0, MAX_SPECIALISTS);
  // Un seul analyste n'apporte presque rien à la réflexion approfondie de la réponse elle-même :
  // la question reste en solo (pas d'appel ni d'attente en plus).
  if (specialists.length === 1 && specialists[0] === "analyste") return SOLO("question complexe, réflexion seule");
  return {
    specialists,
    // Relecture seulement quand des faits viennent d'internet et qu'un autre agent s'en sert.
    // Relecture aussi pour le shimaoré : le vérificateur signale tout mot non validé.
    verify: (specialists.includes("chercheur") && specialists.length >= 2) || shimaore,
    reason: context.challenged ? "réponse contestée" : "question complexe",
  };
}
