# Agent 5 (Sécurité) : revue C1 de la branche `feat/mobile-bearer`

Périmètre : `git diff develop...feat/mobile-bearer`, commits 1786ddb, fd5c626 et 1b89d7f, dans le worktree `C:\Users\aloal\Documents\Groupe BTM\.worktrees\tamilya-mobile-bearer`. Revue en lecture seule : aucune modification, aucun push, aucune requête vers la production ni vers Supabase. J'ai aussi relu le code de `@supabase/auth-js` 2.118.0 installé (`GoTrueClient.getClaims` et `fetchJwk`).

## Verdict : **APPROUVÉ AVEC RÉSERVES**

Je n'ai trouvé aucun contournement de l'authentification ni aucune élévation de privilèges, et pas de régression CSRF. La fusion dans `develop` est acceptable. Avant la **publication de l'app sur les stores**, il faut traiter R-1 (suppression de compte), R-2 (comptes anonymes) et R-3 (appels non limités vers Supabase Auth).

## Résumé (5 lignes max)
- Le Bearer est validé correctement par `getClaims(token)` : signature vérifiée avec les JWKS du projet (ou repli sur `getUser`), expiration contrôlée, `alg` imposé (RS256/ES256), `sub` exigé et rôle `authenticated` exigé. Les jetons `anon`, `service_role`, d'un autre projet, `alg:none`, expirés, mal formés ou en double sont tous refusés.
- Pas de nouveau risque CSRF : un navigateur n'envoie jamais `Authorization` de lui-même, et l'API n'a aucun en-tête CORS. `isSameOrigin` est bien appliqué à PATCH et DELETE `/api/me`.
- `/api/me` PATCH ne modifie que `display_name` et `personality`, sous RLS : aucune élévation possible.
- Réserves : DELETE se contente du mot « SUPPRIMER », sans réauthentification, et la cascade efface le portefeuille et son solde (R-1). Jetons des comptes anonymes non refusés (R-2). Un Bearer forgé provoque 1 à 2 appels à Supabase Auth sans aucune limite (R-3).
- JWT d'un compte supprimé : impact réel faible. Aucune donnée n'est recréée (clés étrangères) et aucun appel IA n'a lieu ; on obtient un 500 au lieu d'un 401. Recommandation : `getUser(token)` sur `/api/me` DELETE et PATCH seulement (R-4).

## Constats

### 1. Contournements de l'authentification Bearer
| Cas | Comportement observé (code) | Résultat |
|---|---|---|
| Jeton signé pour un autre projet | Le `kid` est inconnu des JWKS du projet, donc `fetchJwk` renvoie null et le code se replie sur `getUser(token)` auprès de **notre** serveur Auth, qui refuse (`auth-js GoTrueClient.js:5536-5547`). | Refusé |
| `role: anon` (clé publishable legacy) ou `service_role` | `verifyBearerClaims` exige `role === "authenticated"` (`src/lib/supabase/bearer.ts:90`). Une clé `sb_secret_…` ou `sb_publishable_…` ne correspond pas à `JWT_SHAPE` (`bearer.ts:34,43`). | Refusé, OK |
| `alg: none`, `HS256`, ou `kid` absent | Repli sur `getUser(token)`, donc validation par le serveur Auth. `alg` inconnu avec un `kid` valide : `getAlgorithm` lève une erreur, rattrapée à `bearer.ts:92`. Signature vide : refusée par `JWT_SHAPE`. | Refusé |
| Jeton expiré | `validateExp` est appelé parce que le jeton est passé en argument (`GoTrueClient.js:5526-5535`). | Refusé, puis 401 |
| En-tête mal formé ou en double | `Headers.get` joint les valeurs en `"Bearer a, Bearer b"`, qui ne correspond pas à `JWT_SHAPE`, donc `bearer-malformed`, `invalidBearer` vaut vrai et la route répond 401 (`bearer.ts:40-43`, `src/lib/auth/identity.ts:44`). Taille limitée à 8 Ko. | OK |
| Cookie `sb-*-auth-token` invalide ou étranger **et** Bearer valide | Le cookie prime : le chemin cookie ne donne pas d'utilisateur et `invalidBearer` est faux (`server.ts:29`, `bearer.ts:38`). Sur `/api/chat`, la requête est **traitée comme celle d'un invité** (quota invité), sans 401. C'est une rétrogradation, pas une élévation. | **R-6** Faible |
| Cookie valide **et** Bearer d'un autre compte | Le cookie gagne, le Bearer est ignoré. Pas de mélange d'identités. | OK |
| Autres chemins d'identité | Toutes les routes `/api/**` qui identifient l'utilisateur passent par `getAuthContext`, puis `createSupabaseServerClient` et `userFromClient` (14 routes, vérifié par `grep`). `proxy.ts` lit seulement les cookies, ce qui sert uniquement à la maintenance et aux redirections de pages, sans effet sur `/api`. `/api/awa`, `/api/v1/tamilya` et `/api/cron` lisent `Authorization` pour **leurs propres** secrets, sans passer par `getAuthContext` : pas d'interférence. | OK |
| Bearer sur les Server Actions et pages admin | Les pages appellent `requireAdmin` à partir du JWT : un admin peut lire une page admin avec son Bearer, ce qui revient à utiliser son cookie. Les **actions** admin appellent `getUser()` **sans** jeton (`src/lib/admin/action-auth.ts:17`). Sur un client Bearer, il n'y a pas de session, donc refus : on échoue en mode fermé. | OK (à documenter) |
| Jeton de compte **anonyme** Supabase (`is_anonymous: true`, rôle `authenticated`) | Accepté par `verifyBearerClaims`. Si les connexions anonymes sont activées dans le projet, n'importe qui peut fabriquer des comptes sans e-mail et obtenir chacun 300 messages IA par jour. | **R-2** Moyenne, à vérifier |
| Jeton volé | Aucun lien entre le jeton et l'appareil ; le jeton reste utilisable jusqu'à son expiration (environ 1 h). C'est le comportement normal d'un JWT Supabase et cela atténue l'impact. Le rôle admin du JWT lève toujours le quota du chat (constat C-2 de l'audit 05). | Accepté (pas d'action C1) |

### 2. CSRF
- Un navigateur ne peut pas ajouter `Authorization` à une requête vers un autre site sans un preflight CORS accepté. L'API n'envoie aucun `Access-Control-Allow-*`. Une requête venant d'un site attaquant arrive donc **toujours** par le chemin cookie, exactement comme avant. Pas de régression.
- `isSameOrigin` est appliqué sur `/api/me` PATCH et DELETE (`src/app/api/me/route.ts:24,32`) et reste inchangé ailleurs. De toute façon, un PATCH ou un DELETE en JSON envoyé depuis un autre site déclenche un preflight, qui est refusé.
- Le seul cas « sans Origin » accepté (`src/lib/security/request.ts:28-31`) est historique. Il ne concerne que les clients hors navigateur, qui n'ont pas les cookies de la victime.

### 3. `/api/me`
| # | Sévérité | Fichier:ligne | Constat | Correction proposée |
|---|---|---|---|---|
| R-1 | **Moyenne** | `src/lib/account/settings.ts:89-112`, `src/lib/account/me.ts:153-163` | DELETE n'exige qu'un jeton valide et le mot « SUPPRIMER », sans réauthentification. Avec un jeton volé (jusqu'à 1 h), un attaquant détruit le compte. `deleteUser` est une suppression définitive : la cascade efface `wallets` et `wallet_transactions` (`20261111000000_wallets.sql:8,15`). Le **solde est perdu**, une recharge Stripe en cours sera payée sans écriture correspondante, et l'historique financier disparaît, alors que les pièces comptables doivent être conservées. C'est le même défaut que la Server Action web existante, mais le mobile l'expose davantage. | (a) Avant `deleteUser`, refuser avec un 409 si `balance_cents > 0` ou s'il existe une recharge `pending`, avec le message « vide ou fais rembourser ton portefeuille d'abord ». (b) Exiger une authentification récente : `getUser(token)` et `last_sign_in_at` de moins de 5 minutes, ou un mot de passe ou un OTP de réauthentification. (c) À terme, une suppression douce ou une anonymisation qui conserve `wallet_transactions` (le choix relève de l'orchestrateur et de l'utilisateur). |
| R-5 | Faible | `src/lib/account/me.ts:118-121`, `settings.ts:56-58` | PATCH : 30 requêtes par heure, et chaque changement de nom envoie un e-mail à l'adresse du compte. Cela fait jusqu'à 30 e-mails par heure via le SMTP OVH, sur sa propre adresse. Les colonnes modifiables sont limitées à `display_name` (zod, 60 caractères maximum) et `personality` (liste fermée), via le client RLS : **aucune élévation possible**. | Ramener la limite des changements de nom à 5 par heure, ou regrouper les notifications (au plus un e-mail toutes les 10 minutes). |
| — | OK | `me.ts:67-94` | GET renvoie seulement `email` (lu dans le JWT), `displayName`, `personality` et des `PersonalityCard` (`id`, `label`, `emoji`, `description`, `sample` : pas de consignes système). Réponse en `no-store`. Pas de fuite. | — |
| — | OK | `me.ts:99-107` | `strictObject` : un champ inconnu (`role`, `id`, …) donne un 400. | — |

### 4. JWT d'un compte supprimé (point ouvert du Backend)
Ce qui se passe réellement, d'après le code :
- **`/api/chat`** : l'utilisateur, lu dans le JWT, existe encore côté serveur, donc le compteur de quota de cet identifiant est consommé, sans conséquence. Avec `conversationId`, la lecture RLS ne trouve rien (les conversations ont été supprimées en cascade) et la route répond **404**. Sans `conversationId`, `createConversation` échoue sur la clé étrangère `auth.users`, d'où un **500 `internal`** (`src/app/api/chat/route.ts:302-320`). Cela se produit **avant** l'appel au modèle : **aucun coût IA**. `saveMemories` (dans `after`) échoue sur la clé étrangère, ce qui donne seulement un journal d'erreur. **Aucune donnée n'est recréée**, puisque toutes les tables liées à l'utilisateur ont une clé étrangère vers `auth.users` avec `on delete cascade`.
- **`/api/me`** : GET renvoie un profil vide avec un 200 au lieu d'un 401. PATCH écrit 0 ligne sous RLS et répond 200 avec un profil vide ; le compte étant supprimé, un e-mail de changement de nom peut partir vers l'ancienne adresse (faible). DELETE : `deleteUser` sur un identifiant absent renvoie une erreur, donc un 500.
- **Exposition** : au plus la durée de vie restante du jeton (environ 1 h), uniquement pour le titulaire du jeton. Le comportement est le même aujourd'hui sur le web avec le cookie (`getClaims` local) : **pas une régression**.

Options :
| Option | Coût | Avis |
|---|---|---|
| A. Accepter | 0. Le contrat doit alors dire « après une suppression, l'app efface ses jetons ; le serveur peut répondre 404 ou 500 pendant au plus 1 h ». | Acceptable pour `/api/chat`. |
| B. `getUser(token)` sur les seules routes sensibles (`/api/me` PATCH et DELETE, ainsi que `wallet/topup`, `code-exam/requests`, `food`, `barge` : actions rares) | 1 aller-retour vers Supabase Auth (environ 50 à 150 ms depuis dub1) pour ces requêtes peu fréquentes. Le quota Auth n'est pas un problème à ces volumes. Détecte aussi les comptes **bannis** ou supprimés, et donne `last_sign_in_at` pour R-1 (b). | **Recommandée (R-4)** |
| C. `getUser(token)` partout | 1 aller-retour par message de chat (jusqu'à 15 par minute et par utilisateur), donc latence supplémentaire et risque d'atteindre les limites de débit d'Auth. | Non recommandé |
| D. Durée du JWT ramenée de 1 h à 10–15 min | Paramètre du tableau de bord Supabase. Plus de rafraîchissements côté app, mais c'est gratuit. | Complément utile à A ou B |

Si le projet utilise encore une clé de signature **symétrique** (HS256 legacy), `getClaims` appelle déjà `getUser` à chaque requête : l'option C est alors déjà en place sans le dire, et le compte supprimé est déjà refusé. À vérifier dans Supabase (Settings → JWT Keys).

### 5. Autres constats
| # | Sévérité | Fichier:ligne | Constat | Correction proposée |
|---|---|---|---|---|
| R-2 | Moyenne (à vérifier) | `src/lib/supabase/bearer.ts:89-90` | Les jetons de comptes anonymes Supabase sont acceptés (voir §1). | Ajouter `if (claims.is_anonymous === true) return null;` à `bearer.ts:90`, et la même règle dans `userFromClient` pour le chemin cookie (`identity.ts:25-26`). Vérifier que « Anonymous sign-ins » est désactivé dans Supabase. |
| R-3 | Moyenne | `bearer.ts:84-87`, `auth-js GoTrueClient.js:5426-5434,5544` | Sans authentification et sans limite de débit, un Bearer forgé avec un `kid` aléatoire provoque **un téléchargement des JWKS** (le cache ne contient que les `kid` connus) **plus un `getUser`** vers Supabase Auth, à chaque requête. Un attaquant peut ainsi épuiser les limites de débit d'Auth du projet, ce qui bloque les connexions de tous, ou ralentir l'API. C'était déjà faisable avec un faux cookie, mais un en-tête rend l'attaque triviale. | Dans `chooseAuthSource` ou `verifyBearerClaims`, décoder l'en-tête **avant** d'appeler Supabase et refuser localement avec un 401 si `alg ∉ {ES256, RS256}`, si `kid` est absent, ou si `iss ≠ ${SUPABASE_URL}/auth/v1` (si le projet est en HS256, ne garder que le contrôle de l'`iss`). Ajouter une limite par IP pour les Bearer refusés, par exemple 30 par minute avec `consumeRateLimits` sur la clé `bad-bearer:<ip haché>`. |
| R-4 | Faible | `src/lib/account/me.ts:109,155` | Compte supprimé ou banni accepté jusqu'à l'expiration du jeton (§4). | Option B : `const { error } = await supabase.auth.getUser(bearerTokenOf(supabase))` en tête de `patchMe` et `deleteMe` (et des routes de paiement), avec un 401 `unauthorized` en cas d'erreur. Sur un client cookie, `getUser()` sans argument. |
| R-6 | Faible | `src/lib/supabase/bearer.ts:38` | Cookie `sb-*` présent mais invalide, avec un Bearer valide : la requête est traitée en invité au lieu d'utiliser le Bearer. | Si le chemin cookie ne donne pas d'utilisateur **et** qu'un en-tête Bearer est présent, refaire la résolution avec le Bearer (le cookie garde la priorité quand il est valide). Ou, plus simple : documenter côté Flutter « ne jamais conserver de cookies `sb-*` » (client HTTP sans CookieJar pour l'API). |
| R-7 | Faible | `src/app/api/auth/device/route.ts:24-25` (inchangé, mais désormais joignable en Bearer) | Le mobile n'envoie pas le cookie `btm_appareil`. Chaque appel enregistre alors un nouvel appareil et envoie l'e-mail « nouvel appareil », et `known_devices` grossit sans limite. | Accepter un en-tête `X-Device-Id` (UUID stocké dans `flutter_secure_storage`) à la place du cookie, et ajouter une limite de 10 par heure et par compte. C'est hors du périmètre C1 : à reporter. |
| R-8 | Faible | `bearer.ts:87` | `getClaims` ne vérifie ni `iss` ni `aud`. Aujourd'hui sans conséquence, puisque les clés sont propres au projet. | Couvert par la vérification locale de l'`iss` proposée en R-3, plus `aud === "authenticated"`. |
| — | Info | `identity.ts:22-27` | Le chemin cookie n'exige toujours pas `role === "authenticated"`, contrairement au Bearer. Asymétrie sans risque (un cookie contient un jeton d'utilisateur). | Harmoniser en appliquant le même contrôle aux deux chemins. |
| — | OK | `src/app/api/auth/password-notice/route.ts:23` | `getUser(bearerTokenOf(supabase))` : validation par le serveur, avec la fenêtre de 3 minutes sur `updated_at` comme garde-fou. L'envoi ne peut aller qu'à l'adresse du compte. Pas de limite de débit, ce qui était déjà le constat C-4 de l'audit 05. | Ajouter 5 par heure et par compte (P2, hors C1). |
| — | OK | `1786ddb` (`src/lib/address-fields.ts`) | Correction de la regex `\s+` : pas d'impact sécurité, et les contraintes CHECK en base restent en place. | — |

## Fichiers modifiés
- Aucun dans le dépôt principal ni dans le worktree. Fichier créé : `Nouveau dossier/docs/missions/C1-revue-securite.md`.
- Seuls effets locaux : les artefacts de `next typegen` et de la compilation des tests (dossiers ignorés par git), voir ci-dessous.

## Vérifications effectuées
- `git log`, `git diff develop...feat/mobile-bearer --stat` : 19 fichiers, +967 / −82.
- Lecture intégrale de `bearer.ts`, `server.ts`, `identity.ts`, `session.ts`, `me.ts`, `settings.ts`, `api/me/route.ts` et du diff de `chat`, `aide`, `password-notice`, `parametres/actions.ts` et `policies.ts`.
- Lecture de `node_modules/@supabase/auth-js` 2.118.0 : `getClaims`, `fetchJwk`, `validateExp`, `getAlgorithm`, et le cache global `GLOBAL_JWKS` (partagé entre les clients, par `storageKey`).
- `grep` des appels `getAuthContext`, `createSupabaseServerClient`, `auth.getUser` et `auth.getSession` dans `src/`.
- Dans le worktree : `npm run lint`, `npm run typecheck` et `npm test`. Résultats : lint, 0 erreur (code de sortie 0) ; typecheck, `next typegen` puis `tsc --noEmit` sans erreur (code de sortie 0) ; tests, **298 tests, 102 suites, 298 réussis, 0 échec, 0 ignoré**. Les **298/298 annoncés sont confirmés de façon indépendante**. `git status --short` est vide après les commandes : le worktree est resté propre.

## Non résolu / questions pour l'orchestrateur
1. Le projet Supabase est-il en clés de signature asymétriques (ES256/RS256) ou encore en HS256 legacy ? Cela change le coût réel de R-3 et R-4.
2. « Anonymous sign-ins » est-il désactivé (R-2) ?
3. Politique de suppression de compte avec un solde non nul ou des pièces comptables : refus, remboursement, ou suppression douce (R-1) ? La décision revient à l'utilisateur.
4. Durée de vie du JWT : la ramener à 15 minutes ?

## Dépendances
- **Backend (04)** : R-1 (a) et (b), R-2, R-3 et R-4 sont des corrections courtes dans `bearer.ts`, `me.ts` et `settings.ts`. R-7 doit être planifié avec `X-Device-Id`.
- **Flutter** : client HTTP sans CookieJar pour l'API (R-6) ; un 401 `unauthorized` ramène à l'écran de connexion ; après DELETE, effacer les jetons sans attendre la réponse du serveur.
