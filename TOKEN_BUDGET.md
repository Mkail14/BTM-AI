# TOKEN_BUDGET — Tamilya Mobile

_L'environnement ne donne pas à l'orchestrateur la consommation exacte de chaque agent. Les chiffres ne sont notés que lorsqu'ils sont réellement communiqués (notification de fin d'agent). Aucune estimation n'est présentée comme une mesure._

## Règles appliquées
1. Mission ciblée + fichiers précis + format de rapport fixe (`docs/TEAM_RULES.md`).
2. Rapports détaillés écrits dans des fichiers ; réponse à l'orchestrateur limitée à 15 lignes.
3. Contexte commun écrit une fois (`TEAM_RULES.md`, `PROJECT_CONTROL.md`) au lieu d'être répété.
4. Modèle selon la difficulté : opus pour l'architecture et la sécurité, sonnet pour les inventaires (backend, UI/UX), haiku pour les tâches mécaniques futures.
5. Un agent n'est lancé que lorsqu'il a quelque chose à produire.
6. Les agents terminés sont repris avec leur contexte (SendMessage) plutôt que relancés à neuf.
7. Jamais de suppression d'étape de sécurité, de validation ou de test pour économiser.

## Journal des sollicitations
| Date | Agent | Modèle | Mission | Consommation communiquée | Statut |
|---|---|---|---|---|---|
| 2026-11-04 | Orchestrateur | opus | repérage du dépôt (5 commandes shell) | non mesurée | ✅ |
| 2026-11-04 | 1 Architecte | opus | A1 audit architecture | 90 418 tokens pour la reprise (9 outils, 2 min 24) ; consommation avant l'interruption inconnue | ✅ |
| 2026-11-04 | 3 UI/UX | sonnet | A3 audit UX | 77 613 tokens pour la reprise seulement (4 outils, 1 min 55) ; consommation avant l'interruption inconnue | ✅ |
| 2026-11-04 | 4 Backend | sonnet | A4 audit données/API | 113 732 tokens pour la reprise (12 outils, 2 min 33) ; consommation avant l'interruption inconnue | ✅ |
| 2026-11-04 | 5 Sécurité | opus | A5 audit sécurité (+ 2 points transmis par le Backend) | 136 833 tokens pour la reprise (34 outils, 5 min 35) ; consommation avant l'interruption inconnue | ✅ |
| 2026-11-04 | Orchestrateur | opus | vérification de 2 constats + consolidation | non mesurée | ✅ |

| 2026-11-04 | 1 Architecte | opus | B architecture + contrat API (reprise avec contexte, lecture limitée au plan consolidé) | 130 060 tokens (10 outils, 3 min 23) | ✅ |
| 2026-11-04 | Orchestrateur | opus | arbitrage B + question « adresse » réglée par 2 commandes (agent Backend non relancé) | non mesurée | ✅ |

| 2026-11-04 | 4 Backend (nouvel agent) | sonnet | C1 Bearer + /api/me + BUG-1 | 145 347 tokens (46 outils, 11 min 21) | ✅ |
| 2026-11-04 | 5 Sécurité (repris) | opus | C1 revue (+ tests relancés de façon indépendante) | 184 264 tokens (16 outils, 3 min 37) | ✅ |
| 2026-11-04 | 4 Backend (repris) | sonnet | C1 corrections post-revue + règle web | 194 239 tokens (30 outils, 6 min 51) | ✅ |
| 2026-11-04 | Orchestrateur | opus | vérification des corrections (diff + tests) à la place d'une 2e revue Sécurité | non mesurée | ✅ |

| 2026-11-04 | 2 Flutter | sonnet | C2 squelette | 133 308 tokens (55 outils, 14 min 18) | ✅ |
| 2026-11-04 | 3 UI/UX (repris) | sonnet | C2 revue | 103 709 tokens (9 outils, 2 min 23) | ✅ |
| 2026-11-04 | 2 Flutter (repris) | sonnet | C2 corrections + identifiant | 162 900 tokens (26 outils, 7 min 39) | ✅ |

| 2026-11-04 | 3 UI/UX (repris) | sonnet | C2b spec visuelle (captures) | 178 149 tokens (23 outils, 4 min 27) | ✅ |
| 2026-11-05 | 2 Flutter (repris) | sonnet | C2b refonte visuelle (4 itérations de captures) | 298 457 tokens (85 outils, 28 min 29) | ✅ |

| 2026-11-05 | 2 Flutter (repris) | sonnet | C3a connexion réelle | 416 508 tokens (89 outils, 25 min 50) | ✅ |
| 2026-11-05 | 5 Sécurité (repris) | opus | C3a revue (interrompue par la limite de 5 h, reprise) | 219 148 tokens pour la reprise (11 outils, 2 min 33) | ✅ |
| 2026-11-05 | 2 Flutter (nouvel agent, brief court) | sonnet | C3b chat réel + corrections sécurité C3a | 165 110 tokens (59 outils, 12 min 19) | ✅ |
| 2026-11-05 | 2 Flutter (nouvel agent) | sonnet | C4a orbe + portefeuille + écran rouge + œil mot de passe | 243 013 tokens (81 outils, 24 min 06) | ✅ |

**Total communiqué : 2 992 808 tokens** (A 418 596 + B 130 060 + C1 145 347 + revue C1 184 264 + corrections C1 194 239 + C2 133 308 + revue C2 103 709 + corrections C2 162 900 + spec C2b 178 149 + refonte C2b 298 457 + C3a 416 508 + revue C3a 219 148 + C3b 165 110 + C4a 243 013) (la part consommée avant l'interruption n'est pas connue).

## Incidents
- 2026-11-04 : les 4 agents d'audit se sont arrêtés sur la limite d'usage de 5 h du compte (HTTP 429). Avant la reprise, aucun rapport n'était écrit. À 18 h, ils ont été repris avec leur contexte (SendMessage) plutôt que relancés à neuf, pour ne pas refaire les lectures déjà faites.
- Leçon : 2 agents opus + 2 sonnet en parallèle ont épuisé la fenêtre de 5 h. Pour les phases suivantes, lancer au plus 2 agents à la fois et réserver opus aux tâches critiques.

- 2026-11-05 : 2e arrêt sur la limite de 5 h (revue Sécurité C3a), alors qu'un seul agent tournait. Cause probable : le contexte de l'agent Flutter est devenu très long à force de reprises (416 k pour C3a). Optimisation retenue : pour C3b, lancer un **nouvel** agent Flutter avec un brief court (ARCHITECTURE + rapports C2/C3a) plutôt que de reprendre l'agent actuel. Résultat : C3b en 165 k (contre 416 k pour C3a).
- 2026-11-05 : le système a arrêté les serveurs de dev en arrière-plan faute de mémoire (Next :3100, proxy :8090, Flutter :8091, anciens serveurs :8098/:8099, Chrome de démonstration). Non relancés sans demande de l'utilisateur.

## Appels évités
- Agents 2, 6, 7, 8 non lancés en phase A (aucun code mobile à construire, tester, mesurer ou documenter) : 4 lancements évités.
- Repérage initial fait par l'orchestrateur (structure du dépôt) et transmis à chaque agent : évite 4 explorations complètes en double.
- Audit visuel du site en ligne non lancé : le code source contient les mêmes informations.
- Les soupçons RLS du Backend ont été transmis à l'agent Sécurité pendant qu'il travaillait encore : évite une seconde passe de sécurité.
- Désaccord sur la lecture des messages réglé par l'orchestrateur à partir des rapports, sans relancer d'agent.
- Constats clés revérifiés par 1 commande ciblée de l'orchestrateur au lieu d'une contre-expertise par un agent.

## Écarts aux règles
- **Économie qui a coûté cher** : en phase A, j'ai renoncé à l'audit visuel du site en ligne pour économiser des tokens. Résultat : C2 ne ressemble pas au site et une passe C2b est nécessaire. Règle ajoutée : toute mission d'interface se compare à des captures du site réel.
- C1 a été confié à un **nouvel** agent Backend au lieu de reprendre l'agent A4 avec son contexte. Le nouvel agent relira les fichiers d'auth que A4 connaissait déjà. Compensation : le rapport 04 lui est indiqué comme point de départ. À éviter pour les phases suivantes.

## Optimisations possibles
- La re-vérification des corrections C1 sera faite par l'orchestrateur (diff + tests), et non par une nouvelle revue complète de l'agent Sécurité, sauf si le diff touche autre chose que les points R-1 à R-6.
- Phase B : reprendre l'architecte (SendMessage) avec les synthèses des autres rapports plutôt que lui faire relire leurs fichiers en entier.
