# Agent 4 Backend — Mission C1 (Bearer, /api/me, BUG-1)

Worktree : `C:\Users\aloal\Documents\Groupe BTM\.worktrees\tamilya-mobile-bearer`, branche `feat/mobile-bearer` (issue de `develop` 0b39a1e). Rien poussé, rien déployé, aucune migration, aucun `.env` touché. Le dossier principal est resté sur `develop`, arbre propre.

## Résumé
- Bearer accepté sans cookie de session ; cookie prioritaire ; Bearer invalide = 401, jamais invité.
- `GET/PATCH/DELETE /api/me` créés ; la logique des Server Actions est extraite dans `src/lib/account/settings.ts` et partagée.
- BUG-1 corrigé (helper `normalizeAddressLine`, testé).
- `npm run lint`, `typecheck`, `test` : tout passe (298 tests, 0 échec). Aucun test n'échouait avant.

## Commits (ordre chronologique, tous terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)
| Hash | Message |
|---|---|
| 1786ddb | Inscription : l'adresse gardait ses espaces de travers (/s+/g au lieu de /\s+/g) |
| fd5c626 | Authentification par jeton Bearer pour l'application mobile |
| 1b89d7f | Route /api/me (GET, PATCH, DELETE) pour l'application mobile |

## Fichiers modifiés
- BUG-1 : `src/components/auth/AuthDialog.tsx` (utilise `normalizeAddressLine`), `src/lib/address-fields.ts` (+ helper), `tests/address-fields.test.ts`.
- Bearer : `src/lib/supabase/bearer.ts` (nouveau), `src/lib/supabase/server.ts`, `src/lib/auth/identity.ts` (nouveau : `userFromClient`, `resolveAuthContext`, type `SessionUser`), `src/lib/auth/session.ts` (délègue à identity, `getAuthContext` renvoie en plus `invalidBearer`), `src/app/api/chat/route.ts`, `src/app/api/aide/route.ts`, `src/app/api/auth/password-notice/route.ts`, `tests/mobile-bearer.test.ts`.
- /api/me : `src/app/api/me/route.ts`, `src/lib/account/{settings,me,confirmation}.ts` (nouveaux), `src/app/parametres/actions.ts` (3 actions déléguées), `src/app/parametres/confirmation.ts` (réexporte), `src/lib/rate-limit/policies.ts` (+ `accountUpdate` 30/h), `tests/api-me.test.ts`.

## Fonctionnement du Bearer
`createSupabaseServerClient()` choisit la source (`chooseAuthSource`) :
1. un cookie `sb-*-auth-token[.N]` existe : chemin cookie historique, strictement inchangé, l'en-tête Authorization est ignoré (cookie prioritaire, pas de mélange) ;
2. sinon `Authorization: Bearer <jwt>` bien formé (3 segments base64url, 8 Ko max) : `createClient(url, clé publishable, { persistSession:false, autoRefreshToken:false, global.headers.Authorization })`. PostgREST reçoit le jeton de l'utilisateur, donc RLS appliquée. Le jeton est associé au client dans une `WeakMap` ;
3. Bearer vide ou mal formé (dont une clé `sb_secret_…`, qui n'est pas un JWT) : client « Bearer refusé » ;
4. autre schéma (Basic…) ou rien : invité comme avant.

`userFromClient` : pour un client Bearer, `verifyBearerClaims` appelle `auth.getClaims(token)` puis exige `sub` et `role === "authenticated"` (une clé anon ou service_role legacy est donc refusée). `getAuthContext()` renvoie `invalidBearer = !user && client Bearer`. Les routes qui acceptent les invités (`/api/chat`, `/api/aide`) répondent 401 `unauthorized` dans ce cas ; les routes qui exigent un compte renvoyaient déjà 401 quand `user` est nul. Après la suppression d'un compte, voir le point 1 des écarts.

### Choix de l'API Supabase : `getClaims(token)`
Version installée : `@supabase/supabase-js` 2.118.0 (`auth-js` ci-joint). `getClaims(jwt)` décode le jeton, rejette un jeton expiré (`validateExp`), vérifie la signature localement avec les JWKS du projet (clés asymétriques, mis en cache, aucun appel réseau par requête) et retombe sur `getUser(token)` (appel au serveur Auth) pour une clé symétrique. C'est déjà l'API utilisée par le site (`session.ts`, `proxy.ts`) : même niveau de garantie, même rôle admin lu dans `app_metadata`, et pas d'aller-retour réseau supplémentaire par message de chat. `getUser(token)` aurait détecté un compte supprimé, mais coûte un appel Auth à chaque requête (chat : 15/min) ; non retenu, voir écart 1. `getSession()` est exclu (non vérifié, signalé comme non fiable dans la doc auth-js).

## Routes V1 mobile vérifiées
Toutes passent par `getAuthContext()` donc par ce chemin : `POST /api/chat`, `GET/POST /api/conversations`, `DELETE /api/conversations/{id}`, `POST /api/auth/password-notice` (corrigée : `auth.getUser(bearerTokenOf(client))`, car un client Bearer n'a pas de session stockée ; identique au site pour un client cookie), `GET/PATCH/DELETE /api/me`. Les autres routes (`wallet`, `food`, `barge`, `notifications`, `code-exam`, `route`) en bénéficient aussi. `/api` n'est pas un chemin protégé du proxy : pas de redirection pour un appel sans cookie. La maintenance (503 forme B) s'applique toujours.
`isSameOrigin` : inchangé et vérifié par test. Sans Origin (mobile) : accepté ; Origin différent : refusé, avec ou sans Bearer ; sans Origin mais `Sec-Fetch-Site: cross-site` : refusé ; même origine : accepté.

## /api/me
- GET : `{ profile:{email,displayName,personality|null}, personalities:[PersonalityCard], defaultPersonality }` (`Cache-Control: no-store`). `email` vient du JWT.
- PATCH : zod strict `{ displayName?, personality? }`, au moins un champ ; `displayName` utilise `profileSchema` (trim, 60 max : « 60 caractères maximum. »), `personality` utilise `isPersonalityId` (« Personnalité inconnue. »). Réponse `{ profile, message }` ; e-mail `notifyAccountChange` seulement si le nom change ; limite 30/h/compte (429 `rate_limited` + `Retry-After`, fail closed comme les autres limiteurs).
- DELETE : `{ confirmation: "SUPPRIMER" }` strict ; 200 `{message}` ; 400 invalid_request ; 403 invalid_request (admin protégé) ; 503 service_unavailable (pas de clé service role) ; 500 internal. Pas de `signOut` (c'est l'app qui le fait).
- Erreurs au format A `{error:{code,message}}`. 401 `unauthorized` sans identité. `isSameOrigin` appliqué à PATCH et DELETE.
- Server Actions : mêmes messages, mêmes contrôles et même ordre qu'avant ; `revalidatePath` et le `signOut` cookie restent dans les actions.

## Vérifications (dans le worktree)
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run typecheck` (`next typegen && tsc --noEmit`) : OK, aucune erreur.
- `npm test` : `# tests 298 / suites 102 / pass 298 / fail 0 / cancelled 0 / skipped 0`. Nouveaux : `tests/mobile-bearer.test.ts` (23), `tests/api-me.test.ts` (18), +1 dans `tests/address-fields.test.ts`. Aucun test préexistant en échec, donc rien à prouver sur `develop`.
- Tests : Bearer valide, invalide/expiré/exception → pas d'utilisateur et `invalidBearer` vrai, jeton anon/service_role refusé, Bearer vide sans appel Supabase, invité inchangé (`invalidBearer` faux), cookie prioritaire, client Bearer envoie bien `Authorization: Bearer` et `apikey` (fetch simulé), CSRF, `/api/me` GET/PATCH/DELETE (401, validation, limites, erreurs). Tout avec des doubles ; aucun appel à Supabase.
- Non testé automatiquement : l'assemblage dans les handlers Next (`createSupabaseServerClient` lit `cookies()`/`headers()`, hors portée de node:test) ni le 401 effectif de `/api/chat` ; le test de contexte couvre `invalidBearer`, le handler le convertit en 401 (3 lignes). Aucun essai contre un vrai projet.

## À examiner en priorité par l'agent Sécurité
1. Jeton d'un compte supprimé : `getClaims` ne vérifie que signature et expiration, donc le JWT d'un compte supprimé reste accepté jusqu'à son expiration. Effets : `/api/me` GET renvoie un profil vide, `/api/chat` échoue à l'écriture (500 probable, pas 401 comme l'espère le contrat §4). Option : `getUser(token)` sur `/api/me`, ou test d'existence dans `/api/chat`.
2. `chooseAuthSource` : un cookie `sb-…-auth-token` expiré ou forgé fait ignorer un Bearer valide (cookie prioritaire par conception) ; vérifier qu'il n'y a pas de contournement en sens inverse (cookie valide + Bearer d'un autre compte : le cookie gagne, le Bearer est ignoré).
3. Pas de lien jeton/appareil : un jeton volé est utilisable depuis n'importe où jusqu'à expiration ; le rôle `admin` du JWT est honoré aussi en Bearer (les routes admin sont des Server Actions/pages, pas d'API Bearer, mais `isAdmin` lève les quotas du chat).
4. CSRF : l'absence d'Origin est acceptée (comme avant). Une requête cookie sans Origin ni `Sec-Fetch-Site` passe encore ; c'est le comportement historique, non modifié.
5. Quotas invités : un Bearer invalide ne bascule plus en invité (vérifié), mais l'invité mobile sans cookie `btm_device` reçoit un nouvel identifiant à chaque appel (contournement du quota par appareil, P0.2 de l'audit, non traité, `X-Device-Id` est hors C1).
6. `/api/me` PATCH : e-mail déclenché à chaque changement de nom, limite 30/h ; DELETE : irréversible, protégé par la confirmation textuelle seulement.
7. `password-notice` : `getUser(token)` interroge Auth ; vérifier que la fenêtre « 3 minutes » reste le seul garde-fou.

## Écarts avec `API_CONTRACT_MOBILE.md` (à reporter par l'orchestrateur)
1. §4 DELETE, remarque : « `/api/chat` doit renvoyer 401 après suppression » n'est PAS garanti (voir point Sécurité 1). Pas de test pour cela.
2. §1 : le Bearer exige un vrai JWT (3 segments) ; un jeton hors forme donne 401, y compris une clé `sb_…`.
3. §4 PATCH : 400 également pour corps vide/JSON invalide/champ inconnu (message « Aucun réglage à enregistrer. » ou message zod) ; ajout du 429 `rate_limited` + `Retry-After` (limite 30/h implémentée, non plus « à proposer »).
4. §4 GET : `Cache-Control: no-store` ajouté.
5. `/api/aide` renvoie aussi 401 (forme B `{error: "..."}`) pour un Bearer refusé ; `/api/route` etc. renvoient 401 forme propre à la route.
6. `getAuthContext()` renvoie un champ de plus, `invalidBearer` (interne).

## Non résolu / questions pour l'orchestrateur
- Faut-il valider via `getUser(token)` pour détecter les comptes supprimés (coût réseau) ? Décision Sécurité/orchestrateur.
- Fin de lignes : le dépôt est en CRLF dans l'arbre de travail ; mes nouveaux fichiers sont en LF (git avertit « LF will be replaced by CRLF »), sans effet sur le dépôt.

## Dépendances
- Sécurité (points ci-dessus) ; Architecte/Flutter (contrat, gestion du 401 `unauthorized` = retour à l'écran de connexion) ; fusion de `feat/mobile-bearer` dans `develop` à décider par l'utilisateur.

## Corrections post-revue (revue sécurité `C1-revue-securite.md`)
Mêmes règles : pas de push, pas de migration, pas de .env. R-5 et R-7 non traités (backlog, comportement web préexistant).

| Hash | Correction |
|---|---|
| c9cc767 | R-2 : jetons `is_anonymous: true` refusés (Bearer). R-3 : contrôle local sans réseau avant `getClaims` : `alg` dans {ES256, RS256, HS256}, `iss = <SUPABASE_URL>/auth/v1`, `aud = authenticated`. (R-8 couvert au passage.) |
| 2f546dc | R-6 : cookie `sb-*` présent mais sans session ET Bearer présent : le Bearer prend le relais (`selectClient`). Cookie valide : il prime. Bearer mal formé : refus. Un navigateur n'envoie pas Authorization : web inchangé. |
| ddba4a3 | R-4 : `getUser(token)` sur `/api/me` PATCH et DELETE, uniquement pour un client Bearer (401 si erreur ou autre id). Pas sur GET, ni le chat, ni le chemin cookie. |
| 5448158 | R-1 (web ET mobile, décision de l'utilisateur) : voir ci-dessous. |

### R-1 : suppression de compte (logique partagée `removeAccount`)
- Authentification récente (< 10 min). Donnée retenue : `amr[].timestamp` (le plus récent) du JWT, exposée en `SessionUser.authenticatedAt`. `iat` est écarté : il change à chaque rafraîchissement automatique du jeton, sans que l'utilisateur ait prouvé son identité. `amr` absent : traité comme trop ancien (refus prudent).
- Portefeuille : refus si `wallets.balance_cents > 0` (« Ton portefeuille contient encore X €. Utilise ou fais rembourser ton solde avant de supprimer ton compte. », montant via `formatEuros`) ou si une recharge `topup` est `pending` (« Une recharge de ton portefeuille est en cours. Attends qu'elle soit terminée avant de supprimer ton compte. »). Lecture sous RLS (client de l'utilisateur) ; erreur de lecture : refus 500, rien n'est supprimé. Le portefeuille de démonstration (cookie fictif) n'est pas concerné.
- Route : 401 `reauth_required` ; 409 `wallet_not_empty` (deux codes ajoutés à `ChatErrorCode`). L'app doit refaire une connexion (mot de passe ou Google) puis réessayer ; une reconnexion neuve donne un `amr` récent.
- Web (changements visibles) : `ProfileFormState` reçoit `code?: "reauth_required"` ; `DeleteAccount.tsx` affiche le message et un bouton « Me reconnecter » : déconnexion locale puis `authRequiredPath("/parametres?rubrique=suppression")`, c'est-à-dire la fenêtre de connexion existante (e-mail + mot de passe, ou Google), qui ramène sur la rubrique. Pas de refonte. Le refus du solde s'affiche via le message d'erreur existant. Non vérifié dans un navigateur (pas de projet Supabase d'essai) : à tester à la main par l'utilisateur, notamment le retour sur `?rubrique=suppression` après connexion.
- Note : `DELETE_CONFIRMATION` et les autres règles inchangés ; `SessionUser` gagne `authenticatedAt` (champ interne).

### Résultats exacts (worktree, après 5448158)
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run typecheck` : OK, aucune erreur.
- `npm test` : `# tests 319 / suites 108 / pass 319 / fail 0 / cancelled 0 / skipped 0` (298 avant corrections, +21).
- Tests ajoutés : rejet local (autre projet, alg none/ES512, aud, charge illisible : `getClaims` jamais appelé), anonyme, relais cookie/Bearer (4 cas), R-4 (PATCH, DELETE, GET non concerné, cookie inchangé, chemin Bearer par défaut avec `getUser(token)`), `amr`, DELETE : connexion trop ancienne / absente / 9 min, solde, recharge, portefeuille illisible, cœur partagé.

### Suites possibles (hors mission)
- Limite par IP des Bearer refusés (`bad-bearer:<ip>`), non faite sur consigne. Le contrôle local (R-3) retire déjà le coût réseau des jetons forgés ; reste le cas d'un jeton à signature fausse mais `iss/alg/aud` corrects, qui coûte encore un `getClaims` (JWKS en cache pour un `kid` connu).
- `getUser(token)` sur les routes de paiement (`wallet/topup`, `food`, `barge`, `code-exam`) comme la revue le suggérait : non demandé.
- R-5 (e-mails de changement de nom), R-7 (`X-Device-Id`) : backlog.
