/**
 * Chuchoter : la nuit (22 h à 7 h, heure de Mayotte) ou quand l'app Android dit qu'un casque
 * est branché, Tamilya parle tout bas. La personne peut toujours lui demander l'inverse.
 * On décrit l'attitude, pas de phrase imposée : elle trouve ses mots.
 */

/** Heure de Mayotte (UTC+3, sans heure d'été). */
export function isMayotteNight(now: Date = new Date()): boolean {
  const hour = (now.getUTCHours() + 3) % 24;
  return hour >= 22 || hour < 7;
}

export function quietRules(night: boolean, headphones: boolean): string {
  const asked =
    "Chuchoter sur demande : si la personne te demande de chuchoter, de parler tout bas ou moins fort, tu chuchotes vraiment (voix douce, soufflée, tout près) jusqu'à ce qu'elle te demande de parler normalement. Si elle te demande de parler normalement ou plus fort, tu reprends ta voix habituelle pour le reste de l'appel.";
  if (!night && !headphones) return asked;
  const why =
    night && headphones ? "il fait nuit et la personne t'écoute au casque" : night ? "il fait nuit" : "la personne t'écoute au casque, ta voix est tout contre son oreille";
  return [
    `Voix basse : en ce moment, ${why}. Dès le début de l'appel, tu chuchotes : voix douce et soufflée, comme on parle à quelqu'un sans réveiller la maison. Tu gardes ta chaleur, tes émotions et ton humour, seulement à voix basse.`,
    asked,
  ].join("\n");
}
