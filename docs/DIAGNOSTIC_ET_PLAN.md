# Tamilya Mobile — Diagnostic initial et plan de développement

_Orchestrateur, 2026-11-04. Sources : `docs/audit/01-architecte.md`, `03-uiux.md`, `04-backend.md`, `05-securite.md`. Les deux constats qui structurent le plan (auth par cookies seulement, repli silencieux du portefeuille) ont été revérifiés dans le code par l'orchestrateur._

## 1. Diagnostic

### Ce qui existe et se réutilise
- **Backend solide** : Next.js 16 + Supabase. Les conversations des comptes sont stockées à 100 % côté serveur. Seul le serveur écrit en base (clé service role). La RLS est activée sur les 29 tables, et 94 tests de sécurité passent en local.
- **Chat en flux** : `POST /api/chat` renvoie du NDJSON (`meta`, `delta`, `replace`, `learned`, `done`, `error`), 14 codes d'erreur documentés. Ce format se décode facilement en Dart.
- **Identité visuelle documentée** : couleurs (accent `#c8295f`, sombre `#f06a9b`), thème clair/sombre, police Geist, rayons. Le site a déjà été adapté au téléphone : bouton retour, clavier, zones sûres.
- **Aucun secret commité** dans les 64 commits.

### Ce qui bloque le mobile
| # | Problème | Source | Impact |
|---|---|---|---|
| B1 | Les routes `/api/**` lisent la session **uniquement dans les cookies** (`src/lib/supabase/server.ts:15-37`) | Archi, Backend, Sécu (consensus) | Une app native ne peut appeler aucune route authentifiée |
| B2 | Aucune route pour lire les messages d'une conversation (rendu par un Server Component) | Archi, Backend | Pas d'historique sur mobile sans solution |
| B3 | Paramètres et suppression de compte en Server Actions | Archi | Ne peuvent pas être appelés depuis l'app |
| B4 | Le quota des invités repose sur le cookie `btm_device` | Backend | Le mode invité ne fonctionne pas tel quel |
| B5 | Flutter SDK absent ; compilation iOS impossible sous Windows | Orchestrateur | Bloque le développement et la publication iOS |

### Risques de sécurité
| Sévérité | Point | Action |
|---|---|---|
| **Élevé, à vérifier** | Rien ne prouve que les migrations `20261120020000` et `20261126000000` sont appliquées en production. Le code masque leur absence (`wallet/topup/route.ts:78`). Si elles manquent, un client qui détient la clé publishable, comme l'app, peut écrire de faux messages, et deux recharges simultanées peuvent dépasser 150 €. | **Vérification par l'utilisateur avant toute sortie mobile** |
| Élevé (conception) | Sans Bearer côté serveur, l'app serait tentée d'écrire directement en base et de contourner quotas et validations | Résolu par la décision D4 |
| Moyen | Pas de CSP ; IP prise dans `X-Forwarded-For` ; aucun plafond global de coût IA ; `/api/aide` accessible sans compte ; admin révoqué actif jusqu'à 1 h | Lot sécurité web, hors chemin critique |
| Faible | UPDATE de `profiles` et `conversations` non restreint par colonne (rien d'exploitable aujourd'hui, `updated_at` protégé par trigger) | P2 |

### Arbitrages de l'orchestrateur
- **Désaccord apparent sur la lecture des messages** : l'architecte propose une nouvelle route `/api/conversations/[id]/messages`, le backend indique que la RLS permet une lecture directe. La sécurité confirme que la lecture directe de `conversations`, `messages` et `profiles` est sûre (propriétaire uniquement, `anon` révoqué). **Décision** : l'app **lit** ces tables directement avec supabase-flutter (aucune nouvelle route, moins de changements sur le web) et **écrit** toujours en passant par le serveur.
- **Navigation** : conversation en plein écran + tiroir latéral, sans barre d'onglets (UI/UX, cohérent avec le site).

## 2. Décisions techniques validées par l'orchestrateur (réversibles)
- **D4** — Réutiliser les routes Next existantes, avec un seul changement transversal : accepter `Authorization: Bearer <jwt Supabase>` quand il n'y a pas de cookie. *(Modifie l'auth du web : **votre accord est requis**.)*
- **D5** — Lectures directes par supabase-flutter (RLS) ; écritures (message, import, compte, portefeuille) uniquement par le serveur.
- **D6** — Flutter organisé par fonctionnalité : `features/{auth,chat,conversations,settings}` + `features/connect/` vide réservé à Tamilya Connect.
- **D7** — Riverpod 2, dio (intercepteur Bearer, annulation), supabase_flutter pour l'auth, jeton dans le stockage sécurisé du système, décodeur NDJSON typé.
- **D8** — Thème Flutter dérivé exactement des tokens de `globals.css`. Libellés repris tels quels (« Tamilya », jamais « Awa »).
- **D9** — Sur mobile, la touche Entrée fait un saut de ligne ; l'envoi se fait par le bouton.

## 3. Périmètre de la V1 mobile
**V1** : chat en flux, connexion/inscription par e-mail, historique des conversations, personnalité, paramètres essentiels, suppression du compte dans l'app (exigée par les stores), pages légales, thème clair/sombre, splash et icône.
**V2** : voix, portefeuille, code de la route, repas, barge, notifications, aide.
**Hors périmètre** : administration, Tamilya Connect.

## 4. Plan
| Étape | Contenu | Agents | Prérequis |
|---|---|---|---|
| **B** | `ARCHITECTURE.md` consolidé + contrat d'API mobile | Architecte (repris avec son contexte) | — |
| **C1** | Branche `feat/mobile-bearer` du dépôt web : Bearer dans `server.ts`, route compte (`/api/me` : profil, personnalité, suppression), identifiant d'appareil invité si retenu, tests. **Aucun déploiement.** | Backend → revue Sécurité | Votre accord sur D4 |
| **C2** | Squelette Flutter, thème, composants, navigation | Flutter + UI/UX | Flutter SDK installé |
| **C3** | Auth, chat en flux, historique, paramètres | Flutter (+ Backend pour le contrat) | C1 + C2 |
| **D** | Tests fonctionnels et d'erreur, Android/iOS, démarrage et mémoire, nouvel audit sécurité, doc d'installation et de compilation | QA, Performance, Sécurité, Documentation | C3 |
| **E** | Corrections, validation finale | Agents concernés | D |

Les étapes B et C2 peuvent démarrer sans attendre C1. Maximum 2 agents simultanés (limite d'usage du compte).

## 5. Ce dont l'orchestrateur a besoin de vous
1. **Accord sur D4** : modifier `server.ts` dans le site web pour accepter le jeton Bearer, sur une branche séparée, sans déploiement.
2. **Migrations en production** : dans Supabase → Database → Migrations (ou `supabase migration list`), confirmer que `20261120020000` et `20261126000000` sont bien appliquées.
3. **Mode invité sur mobile** : le garder en V1 (il faut alors adapter le quota par appareil côté serveur) ou exiger un compte ?
4. **Connexions sociales** : Google en V1 ? Si oui, Apple impose en pratique « Se connecter avec Apple ». Les deux modifient la configuration Supabase Auth.
5. **Environnements** : y a-t-il un projet Supabase et une URL de préproduction ? Sinon, l'app se branche sur la production en lecture et en test uniquement.
6. **Outils** : installer le SDK Flutter + Android Studio. Pour iOS, un Mac ou un service de compilation macOS (payant, donc votre accord).
7. **Éléments de marque** : logo vectoriel (SVG) ou PNG 1024×1024, et confirmation de la licence de la police Geist (open source SIL OFL, *à vérifier*).
8. **Portefeuille (V2)** : à quoi sert le solde ? Pour des biens numériques consommés dans l'app, Apple et Google imposent leur système de paiement ; pour des services physiques (repas, barge), Stripe reste possible. À trancher avant la V2.
