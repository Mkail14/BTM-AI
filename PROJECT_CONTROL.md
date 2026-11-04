# PROJECT_CONTROL — Tamilya Mobile

_Tenu par l'orchestrateur. Dernière mise à jour : 2026-11-04._

## État global
**Phases A, B et C1 terminées ; revue de sécurité de C1 en cours ; C2 en attente du SDK Flutter.** Diagnostic : `docs/DIAGNOSTIC_ET_PLAN.md`. Architecture : `docs/ARCHITECTURE.md`. Le dépôt web n'est modifié que sur la branche locale `feat/mobile-bearer` (non poussée).

## Capacités multi-agents réellement disponibles
- Sous-agents Claude Code : lancement en arrière-plan, en parallèle, choix du modèle (opus/sonnet/haiku), isolation possible en worktree Git.
- Reprise avec le contexte : SendMessage. Les agents ne communiquent pas entre eux : tout passe par l'orchestrateur et `docs/audit/`.
- Consommation de tokens communiquée seulement à la fin de chaque exécution d'agent.
- Limite d'usage de 5 h du compte atteinte avec 4 agents simultanés : **2 agents maximum en parallèle**.
- Manquent sur la machine : Flutter SDK, Supabase CLI, `gh`. iOS : compilation impossible sous Windows.

## Sources
| Élément | Emplacement |
|---|---|
| Dépôt web Tamilya (BTM AI) | `..\BTM - Batir la Technologie de Mayotte` — Next.js 16, Supabase, propre, commit `0b39a1e` |
| Projet mobile | ce dossier |
| Règles de l'équipe | `docs/TEAM_RULES.md` |
| Rapports d'audit | `docs/audit/01-architecte.md`, `03-uiux.md`, `04-backend.md`, `05-securite.md` |

## Agents
| # | Agent | Modèle | État |
|---|---|---|---|
| 1 | Architecte | opus | ✅ A1 terminé — à reprendre en phase B |
| 2 | Flutter | — | ⏸ phase C (Flutter SDK requis) |
| 3 | UI/UX | sonnet | ✅ A3 terminé — à reprendre en C2 |
| 4 | Backend | sonnet | ✅ A4 + C1 terminés |
| 5 | Sécurité | opus | ✅ revue de C1 rendue |
| 6 | QA | — | ⏸ phase D |
| 7 | Performance | — | ⏸ phase D |
| 8 | Documentation | — | ⏸ phase D |

## Missions
- Terminées : A1, A3, A4, A5 ; consolidation par l'orchestrateur (2 constats revérifiés dans le code).
- ✅ **C1 VALIDÉE par l'orchestrateur (2026-11-04)** : corrections post-revue c9cc767 (R-2, R-3), 2f546dc (R-6), ddba4a3 (R-4), 5448158 (R-1, web + mobile). Orchestrateur : diff relu (bearer.ts, identity.ts, server.ts, settings.ts), noms de colonnes du portefeuille vérifiés, expiration Stripe vérifiée ; lint OK, typecheck OK, **319/319 tests**. Branche NON fusionnée, NON poussée : intégration soumise à l'utilisateur. À tester à la main : retour sur `?rubrique=suppression` après reconnexion (web).
- Terminée : **C1** — branche `feat/mobile-bearer` (worktree `..\.worktrees\tamilya-mobile-bearer`) : 1786ddb BUG-1, fd5c626 Bearer (getClaims), 1b89d7f /api/me. lint/typecheck OK, 298/298 tests. Pas poussée. Ouvert : JWT d'un compte supprimé valide jusqu'à son expiration. Rapport `docs/missions/C1-backend.md`.
- Terminée : **B** — `docs/ARCHITECTURE.md` + `docs/API_CONTRACT_MOBILE.md` (Architecte), arbitrages A1-A5 ajoutés en fin d'ARCHITECTURE.md.
- En cours :
  - **Installation de Flutter** : annulée à la demande de l'utilisateur (connexion lente) ; l'utilisateur l'installe lui-même puis relance l'orchestrateur. Dossier partiel supprimé.
- Valeurs par défaut retenues en attendant les réponses de l'utilisateur (réversibles, via les flags d'ARCHITECTURE §9) : mode invité **désactivé** en V1, connexion **e-mail uniquement** (Google et Apple désactivés : « Se connecter avec Apple » n'est donc pas exigée).
- En attente : C2 (squelette Flutter, **SDK en cours de téléchargement**), C3, D, E.

## Décisions techniques validées
- D1 Flutter · D2 dépôt web en lecture seule sans accord · D3 Connect hors périmètre (module réservé)
- D4 Réutiliser les routes Next + Bearer dans `server.ts` — **proposée, accord utilisateur requis**
- D5 Lectures directes par supabase-flutter (RLS sûre, confirmée par la Sécurité) ; écritures par le serveur
- D6 Organisation par fonctionnalité + `features/connect/` vide · D7 Riverpod 2, dio, supabase_flutter, stockage sécurisé, NDJSON typé
- D8 Thème = tokens de `globals.css` · D9 Entrée = saut de ligne sur mobile
- Arbitrage : pas de nouvelle route de lecture des messages (D5 à la place de la proposition de l'architecte).

## Problèmes critiques
- Aucun critique confirmé.
- ✅ **S1 RÉSOLU (selon l'utilisateur, 2026-11-04 : migrations réappliquées en production avec succès ; non vérifiable par l'orchestrateur, aucun accès à la base distante)**. Ancien libellé : : migrations `20261120020000` et `20261126000000` peut-être absentes en production ; leur absence est masquée par le code (`wallet/topup/route.ts:78`, repli sur `PGRST202`).
- **B1** : auth par cookies seulement (`src/lib/supabase/server.ts:15-37`), vérifié.

## Bugs connus (site web)
- Mineur : si Stripe n'envoie jamais `checkout.session.expired`, une recharge reste « pending » et bloque la suppression du compte (passage manuel par le support). Backlog.
- R-5 : un changement de nom peut envoyer jusqu'à 30 e-mails par heure · R-7 : `/api/auth/device` sans `X-Device-Id` envoie un e-mail à chaque appel (préexistants, backlog)
- Suppression du compte sur le WEB : la cascade effaçait le portefeuille et son solde sans ré-authentification. **Décision de l'utilisateur (2026-11-04) : même règle que sur mobile** (refus si solde > 0, connexion récente exigée). Confiée au Backend dans les corrections C1.
- **BUG-1 (confirmé par l'orchestrateur)** : `src/components/auth/AuthDialog.tsx:657`, `address.line.replace(/s+/g, " ")` utilise `/s+/` au lieu de `/\s+/` : à l'inscription, toutes les lettres « s » de l'adresse sont remplacées par des espaces (« rue des Roses » → « rue de Ro e »). Correction d'un caractère. Les adresses déjà enregistrées sont peut-être abîmées.
- Absence de CSP ; IP prise dans `X-Forwarded-For` ; pas de plafond global de coût IA ; `/api/aide` accessible sans compte ; admin révoqué actif jusqu'à 1 h ; UPDATE de `profiles` non restreint par colonne (P2).

## Tests réalisés
- `npm run db:tests-securite` sur base **locale** (agent Sécurité) : 94 OK, 0 échec.
- Recherche de secrets dans HEAD + 64 commits : aucun trouvé.

## Risques identifiés
- R1 Flutter SDK absent · R2 iOS sans Mac · R3 dérive base de production / migrations · R4 règles des stores pour le portefeuille · R5 Apple impose « Se connecter avec Apple » si Google est proposé · R6 logo : pas de SVG ni de 1024 px dans le dépôt ; le meilleur fichier source est `public/brand/icone-maskable-512.png` (512×512, « b » crème #F3E9DC environ, avec étoiles, sur fond #111111). Décision : agrandi en 1024 px pour le développement ; un original 1024 px ou vectoriel du graphiste sera nécessaire avant la publication sur les stores (le motif est simple, une vectorisation propre est aussi possible) · R7 secrets de production sur le poste (non commités)

## Prochaines étapes
1. Recevoir les réponses de l'utilisateur (plan, section 5).
2. Phase B : reprendre l'Architecte pour `ARCHITECTURE.md` (peut démarrer sans attendre).
3. C2 dès que Flutter est installé ; intégration de C1 après verdict de la Sécurité.
