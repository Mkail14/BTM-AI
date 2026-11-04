# Agent 4 — Backend & base de données : audit pour l'app Flutter

Dépôt web (lecture seule) : `BTM - Batir la Technologie de Mayotte`. Chemins `src/...` et `supabase/migrations/...` relatifs à ce dépôt. Aucune valeur de secret n'est citée.

## Résumé
- Toutes les conversations des comptes sont stockées côté serveur (Postgres/Supabase, tables `conversations` + `messages`) : la synchro web/mobile est naturelle dès que le mobile utilise le même compte. Pas de Realtime sur ces tables.
- Les ÉCRITURES (conversation, messages) sont faites par le serveur Next avec la clé service role (`20261120020000_ecritures_par_le_serveur.sql:1-4`, `src/lib/conversations/repository.ts:27,102,121`). Confirmé : le client n'a plus d'INSERT/UPDATE/DELETE sur `messages`, ni INSERT sur `conversations`.
- Conversations anonymes : uniquement dans le `localStorage` du navigateur (24 h), jamais en base (`src/lib/chat/anonymous-draft.ts:3-8`). Le mobile devra gérer son propre brouillon local.
- Blocage majeur : les routes API n'authentifient que par COOKIES de session (`src/lib/supabase/server.ts:18-37`) ; aucun support de `Authorization: Bearer <jwt>` pour les comptes. Il faut l'ajouter (rétrocompatible) pour que le mobile appelle `/api/chat`.
- Pas de route de renommage, ni de lecture des messages d'une conversation, ni de pagination : la lecture se fait via Server Component (`src/app/(chat)/c/[id]/page.tsx:22-23`). RLS permet toutefois ces lectures en direct.

## Constats

### 1. Clients Supabase (`src/lib/supabase/`)
- Navigateur : `createBrowserClient(url, publishableKey)` (`client.ts:13`). Clés lues de `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`config.ts:5-7`) : publiques par conception, réutilisables dans Flutter.
- Serveur : `createServerClient` + cookies Next (`server.ts:21-37`). Requêtes avec l'identité de l'utilisateur, RLS appliquée.
- Admin : `createClient(url, SUPABASE_SECRET_KEY)` sans session (`admin.ts:13-21`), `server-only`. Ne doit JAMAIS aller dans l'app mobile.
- Proxy (`src/proxy.ts`, `src/lib/supabase/proxy.ts:41`) rafraîchit la session via `getClaims()` (cookies). Identité côté route : `getAuthContext()` -> `getSessionUser()` -> `client.auth.getClaims()` (`src/lib/auth/session.ts:21-47`) ; rôle admin lu dans `app_metadata.role`.
- Maintenance : `/api/*` répond 503 `{error:"Site en maintenance..."}` + `Retry-After: 600` aux non-admins (`src/proxy.ts:17-22`), forme d'erreur DIFFÉRENTE du contrat chat (chaîne, pas objet).

### 2. Modèle de données consolidé (état final après 40 migrations)
Schéma `public` sauf mention. RLS activée partout ; `anon` n'a aucun droit sur les tables listées.

**Cœur chat**
- `profiles` (init, +personality 20261028180000, +adresse/téléphone 20261112000000) : `id` PK = `auth.users.id` (cascade), `display_name` (<=60), `personality` in (`mechante`,`professionnelle`,`cool`) nullable (ex-`gentille`, 20261030000000), `address_commune` (liste des communes de Mayotte), `address_line` (5-200), `address_lat/lng/accuracy` (bornes Mayotte, tout-ou-rien), `address_updated_at`, `phone` (`^0[1-79]\d{8}$`), `created_at`, `updated_at`. RLS : select/update own. Pas d'INSERT (créé par trigger).
- `conversations` : `id` uuid, `user_id` (défaut `auth.uid()`, cascade), `title` (1-120, défaut « Nouvelle conversation »), `created_at`, `updated_at`. Index `(user_id, updated_at desc)`. RLS : select/update/delete own ; INSERT retiré (20261120020000:3-4).
- `messages` : `id`, `conversation_id` (cascade), `user_id`, `role` in (`user`,`assistant`), `content` (<=40000), `status` in (`complete`,`interrupted`,`error`), `created_at`. Index `(conversation_id, created_at)` et `(user_id, role, created_at)` (20261127000000). RLS : SELECT own uniquement ; INSERT/UPDATE/DELETE révoqués à `authenticated` (20261120020000:1-2). Messages immuables côté client.
- `awa_memories` : `unique(user_id, kind)`, `content` (<=300) ; select/delete own, écriture serveur seule (20261120020000:5-7). `saved_addresses` (<=10 par compte via trigger) : CRUD own direct.

**Config / IA / admin (JWT admin seulement, ou aucun droit client)** : `awa_settings` (singleton id=1 : name défaut « Tamilya », identity, rules, rate_limits, flow_cuts, removed_apis), `awa_knowledge`, `awa_lexicon` (+variants), `awa_words`, `awa_word_requests`, `awa_personalities` (id + behavior jsonb), `awa_branches`, `awa_grammar`, `awa_cleanup_ignored`, `awa_partner_keys` (aucun droit), `ai_providers` (clés chiffrées, aucun droit client), `ai_usage` (admin read), `site_settings` (singleton : maintenance, demo_mode, coordonnées bancaires, bandeau, landing_demo ; aucun droit client), `site_status_log`.

**Services** : `wallets` / `wallet_transactions` (select own, écritures serveur via RPC), `code_exam_requests` (insert retiré, serveur seul), `code_exam_bookings` (select own ; ins/upd/del révoqués), `known_devices`, `app_reviews`, `developer_keys` (aucun droit client).

**Schéma `private`** (fermé aux rôles API) : `rate_limit_counters`, `protected_admins`, `blocked_email_domains`.

**Relations** : `auth.users` 1-1 `profiles` ; `auth.users` 1-N `conversations` 1-N `messages` (cascade) ; `messages.user_id` doit égaler `conversations.user_id` (trigger `messages_owner_matches`, 20261120000000).

**Triggers** : `on_auth_user_created` -> `handle_new_user()` crée le profil (nom depuis `display_name`/`given_name`/`full_name`/`name`, donc OK pour Google, 20261123000000) ; `messages_touch_conversation` (après INSERT message : `conversations.updated_at = now()`) ; `*_set_updated_at` ; `protected_admin_*` et `reject_disposable_email` sur `auth.users` (e-mail jetable : l'inscription échoue avec `check_violation`).

**Fonctions RPC (public)** : toutes réservées à `service_role` ou internes, AUCUNE appelable par `authenticated`/`anon` : `consume_rate_limit`, `admin_platform_stats`, `wallet_complete_topup/fail_topup/spend/refund/reserve_topup`, `set_site_status`, `close_user_sessions`, `report_unknown_word`, `record_ai_usage`. Le mobile ne peut appeler aucune RPC directement.

**Realtime** : seule policy `realtime.messages` pour le topic broadcast `admin-flow`, admin uniquement (`20261102000000_admin_flow_realtime.sql`). Aucune publication `supabase_realtime` sur `conversations`/`messages` (aucune occurrence dans les migrations). Usage applicatif : `lib/ai/flow-events.ts`, page admin circuit seulement.

**Supabase local** (`supabase/local/`) : PostgreSQL de test avec stub Auth (`00_supabase_stub.sql`), données fictives, tests de droits, empreinte de schéma ; ne teste pas Auth/PostgREST/Realtime (`README.md`).

### 3. Contrat API conversations
Toutes les routes : erreur `{"error":{"code":<ChatErrorCode>,"message":<fr>}}` (`src/lib/chat/errors.ts:131-133`). Codes (`src/lib/chat/types.ts:13-27`) : ai_not_configured, rate_limited, signup_required, invalid_request, conversation_too_long, unauthorized, not_found, provider_error, provider_overloaded, timeout, refusal, service_unavailable, flow_cut, internal. Contrôle CSRF `isSameOrigin` sur POST/DELETE : refuse si `Origin` présent et différent du host ; sans `Origin`, accepte sauf `Sec-Fetch-Site: cross-site` (`src/lib/security/request.ts:94-106`) : une app mobile sans en-tête Origin passe.

**GET /api/conversations** (`src/app/api/conversations/route.ts:11-24`) : auth cookie requise. 200 `{conversations:[{id,title,updatedAt}]}` (50 max, tri `updated_at` desc, `Cache-Control: no-store`, `repository.ts:52-60`). 401 `unauthorized`, 500 `internal`. Pas de curseur.

**POST /api/conversations** (`route.ts:30-75`) : import d'une conversation anonyme. Corps strict `{messages:[{role:"user"|"assistant",content:string(1..40000)}]}`, 1 à 10 messages (`validation.ts:95-100`). Limite 10/heure/compte (`policies.ts:21`). 201 `{conversation:{id,title,updatedAt}}`. Erreurs : 403 `invalid_request` (origine), 401 `unauthorized`, 400 `invalid_request`, 429 `rate_limited` + `Retry-After`, 500 `internal`. Titre = `quickTitle` du premier message user.

**DELETE /api/conversations/{id}** (`[id]/route.ts:9-37`) : id non-UUID -> 404 `not_found` ; non connecté 401 ; suppression via RLS avec cascade messages ; 204 sans corps ; 404 si inexistante ou étrangère.

**Pas de renommage** par l'utilisateur : aucune route. Le titre n'est modifié que par le serveur : titre rapide à la création, puis titre IA après la 1re réponse (`nameConversation`, `src/lib/ai/title.ts:15-31`, `UPDATE conversations SET title` via client session, dans `after()`, `chat/route.ts:603-609`).

**Pas de route de lecture des messages** : `/c/[id]` lit `getConversation` + `getRecentMessages(200)` en Server Component (`src/app/(chat)/c/[id]/page.tsx:22-23`). Format `StoredMessage {id,role,content,status,createdAt}` (`types.ts:46-52`).

**POST /api/chat** (`src/app/api/chat/route.ts:106-644`, `maxDuration=120`) :
- Corps strict (`validation.ts:75-90`) : `{message: string 1..4000 (trim), conversationId?: uuid, voice?: boolean, history?: [{role,content}] (<=10 tours, <=60000 car.)}`. Corps brut trop gros -> 413.
- Connecté : `history` ignoré, historique relu en base (60 derniers messages). Sans `conversationId` : crée la conversation (service role) puis insère le message user en parallèle de la génération, puis le message assistant en fin de flux avec `status` complete/interrupted/error, texte tronqué à 40000 (`route.ts:298-311, 590-602`). Conversation > 200 messages (hors admin) : 409 `conversation_too_long`. `conversationId` d'un autre compte : 404 `not_found`.
- Anonyme : `conversationId` interdit (401 `unauthorized`), historique fourni par le client, 10 messages max (409 `conversation_too_long`). Aucune écriture en base.
- Réponse : flux NDJSON `application/x-ndjson`, une ligne JSON par événement (`stream-protocol.ts`) : `meta{conversationId}`, `delta{text}`, `replace{text}`, `learned{words}` (admin), `done{finishReason: stop|length|refusal|other}`, `error{code,message}`. Les erreurs avant flux sont du JSON classique : 403 invalid_request, 400/413 invalid_request, 404 not_found, 409 conversation_too_long, 429 rate_limited (+Retry-After), 403 signup_required (essai épuisé), 503 flow_cut / ai_not_configured / service_unavailable, 500 internal.
- Quotas : connecté 15/min et 300/j ; anonyme par appareil (cookie `btm_device`, 30 j, httpOnly, path `/api`) 6/min et 30/j, par IP 30/min et 300/j, plus essai de 5 messages/30 j par appareil et par IP (`policies.ts:9-20`, `route.ts:50-60, 226-258`). Admins sans quota. Valeurs modifiables par l'admin (`awa_settings.rate_limits`).
- Profil (personnalité, adresse), mémoire et dossier sont lus côté serveur depuis le compte ; jamais fournis par le client.

**Autres** : `src/app/(chat)/actions.ts` ne concerne pas les conversations : 3 server actions réservées à l'admin (apprentissage du shimaoré). Non pertinent pour le mobile. `/api/v1/tamilya` (`src/app/api/v1/tamilya/route.ts:88-92`) : API développeur avec Bearer `tml_...` + clé Gemini fournie par l'appelant ; sans compte ni conversation, ne convient pas comme API de l'app.

### 4. Lecture directe supabase-flutter vs route serveur (selon les policies actuelles)
Possible en direct (rôle `authenticated`, JWT utilisateur) :
- `conversations` : select / update / delete own. Liste paginée (`range`), suppression et renommage possibles en direct.
- `messages` : select own (pagination par `created_at`).
- `profiles` : select/update own. `saved_addresses` : CRUD own. `awa_memories` : select/delete own. `wallets`, `wallet_transactions`, `code_exam_requests`, `code_exam_bookings` : select own.
- Auth : `supabase.auth` (e-mail/mot de passe, Google) avec URL + clé publishable.

DOIT passer par le serveur : envoi de message et création de conversation (`/api/chat`), import anonyme, toute écriture de `messages`/`awa_memories`/`code_exam_requests`, portefeuille (RPC service role), avis, appareils, clés développeur, réglages du site, tout l'admin.

Points suspects (une ligne, à la Sécurité) :
- (a) `conversations` UPDATE own non restreint à `title` : `updated_at` modifiable par le client (tri de liste falsifiable).
- (b) `profiles_update_own` sans restriction de colonnes : toute colonne future sensible serait modifiable.
- (c) Fallback `writer()` sur le client session si la clé secrète manque (`repository.ts:27`) : échouerait en prod, pas de risque, mais masque une mauvaise configuration.

### 5. Synchronisation web/mobile
Source unique = Postgres. Un compte connecté sur mobile voit les mêmes conversations. Pas de temps réel : le web actualise par rechargement. Pour le mobile : rafraîchissement manuel ou à la reprise de l'app (ou nouvelle publication Realtime, changement de schéma hors périmètre minimal). Une réponse en cours n'est enregistrée qu'à la fin du flux côté serveur ; si le client coupe (`cancel()` -> abort) le message assistant reste enregistré avec statut `interrupted`.

## Décisions / recommandations
**P0 — adaptations backend minimales (NON implémentées)**
1. Accepter `Authorization: Bearer <access_token Supabase>` dans `createSupabaseServerClient` / `getAuthContext` (cookie d'abord, sinon Bearer ; client avec en-tête global Authorization, `getClaims(jwt)`). Rétrocompatible. Risque web faible (en-tête supplémentaire) ; vérifier que `src/proxy.ts` ne redirige pas ces appels et que RLS s'applique avec ce client. Concerne GET/POST `/api/conversations`, DELETE, POST `/api/chat`.
2. Anonyme mobile : `isSameOrigin` laisse déjà passer l'absence d'`Origin`, mais le cookie `btm_device` (quota anonyme) n'est pas natif en Flutter. Soit cookie jar côté app, soit en-tête d'appareil signé. Additif ; risque : contournement des quotas (Sécurité).

**P1**
3. `GET /api/conversations/{id}/messages?before=&limit=` et curseur sur la liste : additif, sans risque web. Alternative sans backend : lecture directe RLS.
4. `PATCH /api/conversations/{id}` `{title}` pour renommer : additif ; ou update direct RLS.
5. Forme d'erreur 503 maintenance (`src/proxy.ts:21`) : recommandé de la gérer côté mobile plutôt que de la changer (changement NON rétrocompatible pour le web).

**P2**
6. Realtime sur `messages` / push : nouveau chantier, non nécessaire au MVP.
7. Documenter le flux NDJSON pour Flutter (lecture en flux, découpage par ligne ; référence : `createStreamEventParser`, `stream-protocol.ts:26-47`).

## Fichiers modifiés
Aucun dans le dépôt web. Seul fichier créé : ce rapport.

## Vérifications effectuées
Lecture seule : 40 migrations, `src/lib/supabase/*`, `src/lib/conversations/repository.ts`, `src/lib/chat/{types,validation,errors,limits,stream-protocol,title,anonymous-draft}.ts`, `src/app/api/conversations/**`, `src/app/api/chat/route.ts` (lignes 106-360 et 586-644 lues, reste survolé par grep), `src/app/(chat)/actions.ts`, `src/lib/auth/session.ts`, `src/lib/security/request.ts`, `src/proxy.ts`. Grep : aucun Bearer pour les comptes (seulement `/api/awa`, `/api/cron/laposte`, `/api/v1/tamilya` avec secrets propres) ; aucune publication Realtime sur les tables de chat. Aucune commande vers une base distante, aucun secret lu.

## Non résolu / questions pour l'orchestrateur
- La base de production correspond-elle aux migrations ? (`20261117000000_alignement_production.sql` signale des dérives passées ; `schema_fingerprint.sql` permet la comparaison mais exige un accès, à faire par l'utilisateur.)
- Le mobile offre-t-il l'essai anonyme (5 messages) ? Si oui, trancher le mécanisme d'identifiant d'appareil (P0.2).
- Lecture directe supabase-flutter (liste/lecture/suppression/renommage) ou tout via routes ? P0.1 est requis dans les deux cas pour `/api/chat`.
- `chat/route.ts` lignes 360-586 (prompt, outils repas/barge) non relues : sans impact sur le contrat.

## Dépendances avec d'autres agents
- Sécurité : points RLS (a-c), contournement des quotas anonymes, validation Bearer.
- Architecte / Flutter : lecture directe vs routes, flux NDJSON, cookie `btm_device`, brouillon anonyme local.
- Auth : Google/e-mail (trigger `handle_new_user`, domaines jetables refusés à l'inscription).
