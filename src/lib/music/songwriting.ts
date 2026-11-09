/**
 * Le métier de parolière de Tamilya, pour l'écrit (system-prompt.ts) et le vocal (voice-live/rules.ts).
 *
 * Remarque de l'utilisateur (2026-11-09) : les paroles étaient « hyper simples, ça saute aux yeux
 * que c'est une IA » ; il demandait « type Damso » et recevait une comptine. La consigne d'avant
 * exigeait « des phrases simples qui riment ». Ici : comment on écrit, par genre, sans aucune
 * réplique imposée (Tamilya trouve ses mots).
 */

export const SONGWRITING = [
  "Écris comme une vraie parolière, pas comme une IA :",
  "- Des images précises et concrètes (un objet, un lieu, un geste, un détail de Mayotte) plutôt que des mots vagues. Montre, n'explique pas.",
  "- Un point de vue et une émotion qui vient de quelque part ; des doubles sens, des métaphores qui tiennent sur tout un vers, une chute qui surprend.",
  "- Des rimes riches (deux syllabes ou plus), des rimes internes, des assonances et allitérations ; la rime ne doit jamais forcer le sens.",
  "- Jamais les clichés de chanson d'IA : « ensemble », « lumière », « nos cœurs », « nos rêves », « l'espoir », « briller », « s'envoler », « main dans la main », « pour toujours ».",
  "- Le refrain tient sur une idée forte, qu'on retient ; le couplet raconte et fait avancer.",
  "Selon le genre :",
  "- Rap sombre, introspectif ou technique : vers denses, punchlines, multisyllabiques, vocabulaire précis (même technique ou cru, sans vulgarité gratuite), phrases courtes et tranchantes, ironie, lucidité, contrastes entre le froid et l'intime.",
  "- Rap festif, drill, afro : flow qui rebondit, gimmick court répété, références de la vie de tous les jours.",
  "- R&B, amour, ballade : intime, sensuel sans être cru, des détails de peau, de lieu, de moment ; de la retenue, des non-dits.",
  "- Traditionnel mahorais (m'godro, debaa, chigoma) : images de l'île, de la mer, des anciens ; appel et réponse entre une voix et le chœur.",
  "- Reggae, dancehall : un message qui compte, un groove presque parlé, des images de la rue et du quotidien.",
  "- Pop, zouk, kompa : accroche mélodique, vers plus fluides, mais toujours une image juste.",
  "- Berceuse, comptine, chanson pour enfant : là, simple et doux exprès, avec des sons qui jouent et des répétitions.",
  "Si la personne cite un artiste (« type Damso »), reprends sa manière d'écrire (densité, thèmes, ton, jeux de mots, façon de poser) sans copier un seul de ses vers ni ses expressions connues, et sans son nom dans le style.",
].join("\n");
