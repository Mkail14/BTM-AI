# Architecte logiciel — Audit d'architecture du web BTM AI pour Tamilya Mobile

Chemins relatifs au dépôt web `BTM - Batir la Technologie de Mayotte` (lecture seule, rien modifié).

## Résumé (5 lignes max)
Next.js 16 App Router + Supabase (Auth, Postgres RLS). Toute l'IA est côté serveur ; le chat passe par `POST /api/chat`, qui renvoie un flux **NDJSON** (une ligne JSON par événement : `meta/delta/replace/learned/done/error`).
**Bloquant n°1 pour le mobile** : toutes les routes utilisateur lisent l'identité **uniquement via les cookies @supabase/ssr** (`getAuthContext` → `createSupabaseServerClient`). Aucune n'accepte de jeton Bearer Supabase aujourd'hui.
Le contrôle CSRF `isSameOrigin` laisse passer un client natif (pas d'en-tête `Origin`) : pas d'obstacle.
Plusieurs fonctions utilisateur n'ont pas de route API (Server Actions, Server Components) : lecture des messages d'une conversation, paramètres, profil, adresses, avis, mémoire.
Recommandation : modifier **un seul point** côté web (client Supabase serveur qui accepte `Authorization: Bearer <access_token>`), puis ajouter quelques routes API manquantes ; le web reste inchangé (cookies prioritaires).

## Constats (chaque constat cite fichier:ligne)

### 1. Vue d'ensemble
- Stack : `package.json:21-34` — next 16.4.3, react 19.3, @supabase/ssr 0.12, supabase-js 2.118, @anthropic-ai/sdk, zod 4, maplibre-gl, qrcode, nodemailer. Tests `node:test` + tsx (`package.json:10`), `npm run check` = lint + typecheck + tests (`package.json:11`). 34 fichiers dans `tests/`.
- Hébergement Vercel, région `dub1` (`vercel.json:3`). `maxDuration = 120` s pour le chat (`src/app/api/chat/route.ts:48`).
- `next.config.ts:3-4` : cacheComponents désactivé, tout rendu à la demande (session). En-têtes de sécurité globaux `next.config.ts:5-15` (X-Frame-Options DENY, HSTS, Permissions-Policy micro/géoloc self).
- Proxy (ex-middleware) `src/proxy.ts:13-38` : rafraîchit la session cookie, mode maintenance (503 JSON sur `/api/*`, `src/proxy.ts:20-23`), redirection des pages privées (`src/lib/auth/redirect.ts:15-22` : `/c/`, `/parametres`, `/portefeuille`, `/utilisation`, `/admin`). Le mobile doit gérer le **503 maintenance** sur toutes les routes.
- Variables d'environnement (noms seulement, `.env.example`) : `AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_BASE_URL, AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, AI_EFFORT, AI_DISABLE_REASONING, AI_KEYS_SECRET, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, RATE_LIMIT_SALT, CRON_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_PASSWORD, SEND_EMAIL_HOOK_SECRET, SITE_URL`. Seules `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont publiques par conception et pourront être embarquées dans l'app.
- `src/lib` : `ai/` (fournisseurs anthropic/gemini/openai-compatible, chaîne de repli, prompt système, mémoire, personnalités, lexique), `chat/` (protocole de flux, validation zod, limites, voix web), `conversations/repository.ts` (accès tables `conversations`, `messages`, `profiles`), `language/` (shimaoré), `wallet/` (Stripe + RPC), `food/`, `barge/`, `code-exam/` (La Poste), `live/` (emploi, actu), `site/` (flags, bandeau, maintenance), `developers/` (clés API publiques), `rate-limit/`, `security/`, `email/`, `admin/`.

### 2. Authentification
- Serveur : `src/lib/supabase/server.ts:15-37` — `createServerClient` lié **exclusivement** à `cookies()`. `getSessionUser` utilise `auth.getClaims()` (JWT vérifié) `src/lib/auth/session.ts:73-89` ; `getAuthContext` mémorisé par requête `src/lib/auth/session.ts:95-99`. Rôle admin lu dans `app_metadata.role` du JWT (README §3).
- Navigateur : `createBrowserClient` `src/lib/supabase/client.ts:10-14`. Connexion e-mail/mot de passe `src/components/auth/AuthDialog.tsx:507`, inscription `:651`, Google OAuth avec `redirectTo .../auth/callback` `:342-345`, reset mot de passe `src/app/auth/mot-de-passe-oublie/ForgotPasswordForm.tsx:19`. Callback PKCE / token_hash `src/app/auth/callback/route.ts:13`.
- Conséquence : en Flutter, `supabase_flutter` gère connexion/inscription/OAuth/reset directement (deep link à ajouter aux Redirect URLs Supabase) ; il faut ensuite que les routes Next acceptent l'`access_token`.
- CSRF : `isSameOrigin` `src/lib/security/request.ts:26-39` — sans `Origin`, accepte si `sec-fetch-site` ≠ `cross-site` (`:28-31`). Un client Dart (`http`/`dio`) n'envoie aucun des deux → **accepté**.
- Cookie appareil invité `btm_device` posé par `/api/chat` (`src/app/api/chat/route.ts:50, 168-170, 633-640`, path `/api`) et `/api/auth/device` (`src/app/api/auth/device/route.ts:24-31`). Le quota d'essai invité (5 messages/30 j par appareil, 30 par IP, `src/app/api/chat/route.ts:53-58, 243-250`) repose dessus : en mobile, il faut un **cookie jar persistant** (ou un futur en-tête `X-Device-Id`).

### 3. Flux de conversation de bout en bout
1. Client `src/components/chat/ChatView.tsx:353-363` : `POST /api/chat` JSON. Connecté : `{message, conversationId?}` ; invité : `{message, history}` (historique gardé côté navigateur). Schéma strict `src/lib/chat/validation.ts:23-38` (`message`, `conversationId` uuid, `voice` bool, `history` ≤ limites). Corps max 128 Ko (`route.ts:51,144`).
2. Serveur `src/app/api/chat/route.ts:106-` : origine (`:107`), coupures de circuit admin (`:127-132`), fournisseur IA (`:135-140`), validation (`:143-164`), auth cookies (`:167`), lectures parallèles contexte (conversation, profil/personnalité, mémoire, dossier, live, food/barge) (`:175-219`), quotas (`:222-250`, 429 + `Retry-After`, 403 `signup_required`), création conversation/message, puis flux.
3. Flux : `ReadableStream` (`route.ts:456-460`), en-têtes `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no` (`route.ts:624-631`). Encodage `src/lib/chat/stream-protocol.ts:4-6` ; événements `src/lib/chat/types.ts:30-38` : `meta{conversationId}` (`route.ts:472`), `delta{text}`, `replace{text}` (`:503,552`, mode admin), `learned{words}` (`:565`, admin), `done{finishReason}`, `error{code,message}`. Erreurs avant flux = JSON `chatErrorBody` avec codes `src/lib/chat/types.ts:13-27`. Réponses fixes (leçon) au même format `route.ts:95-104`.
4. Annulation : `AbortSignal.any([abort, request.signal, timeout])` `route.ts:453` ; la génération s'arrête si le client coupe (message enregistré `interrupted`). Travail après réponse via `after()` (titre IA, mémoire) `route.ts:279,440,489,605`.
5. Client lit le flux `ChatView.tsx:378-385` (TextDecoderStream + parseur ligne à ligne). Après fin : rafraîchit la liste (`:412-414`), titre IA relu 5 s après.
6. Écritures messages via `writer = getSupabaseAdminClient() ?? supabase` `src/lib/conversations/repository.ts:27` (clé secrète côté serveur) → le mobile **ne doit pas** écrire les messages lui-même.
7. Historique d'une conversation : **aucune route API** ; chargé en Server Component `src/app/(chat)/c/[id]/page.tsx:18-25` (RLS). Liste : `GET /api/conversations` (`src/components/layout/ChatShell.tsx:64`), suppression `DELETE /api/conversations/[id]` (`src/components/layout/Sidebar.tsx:93`), import du brouillon invité `POST /api/conversations` (`ChatView.tsx:452`).
8. Server Actions du chat `src/app/(chat)/actions.ts:23,64,115` : toutes **admin** (`requireAdminAction`, `:24`) — enseigner un mot shimaoré, corriger, deviner. Hors scope mobile.
9. Server Actions utilisateur `src/app/parametres/actions.ts:21-216` : profil, personnalité, suppression du compte, adresse, téléphone, oubli mémoire, carnet d'adresses, avis. **Non appelables** depuis Flutter → à exposer en routes API (ou Supabase direct si RLS l'autorise, à confirmer par l'agent Backend).
10. Voix : web = `SpeechRecognition`/`speechSynthesis` du navigateur (`src/lib/chat/voice.ts:29-34,111`), flag `voice:true` envoyé au chat. Page `/voix` admin seulement (`src/app/voix/page.tsx:3`). En mobile : `speech_to_text` + `flutter_tts` natifs, même API.

### 4. Tableau des routes `src/app/api/**`
Légende réutilisable : **oui** = utilisable tel quel par mobile ; **adapter** = auth cookie à remplacer/compléter par Bearer ; **non** = serveur-à-serveur / web-only.

| Route | Méthode | Auth | Mobile | Remarque |
|---|---|---|---|---|
| `/api/chat` | POST | cookie Supabase (optionnel, invité permis) + cookie `btm_device` | **adapter** | Cœur MVP. NDJSON. `route.ts:106-167` |
| `/api/conversations` | GET | cookie | **adapter** | Liste. `conversations/route.ts:11-12` |
| `/api/conversations` | POST | cookie + same-origin | **adapter** | Import brouillon invité. `:30-35` |
| `/api/conversations/[id]` | DELETE | cookie + same-origin | **adapter** | `[id]/route.ts:9-23`. **Manque GET messages** |
| `/api/accueil/conversation` | GET | public | oui | Démo d'accueil, cache 60 s. `accueil/conversation/route.ts:7-9` |
| `/api/aide` | POST | cookie (optionnel) + same-origin | adapter | Bulle d'aide/FAQ. `aide/route.ts:54-60` |
| `/api/notifications` | GET | cookie | adapter | Cloche. `notifications/route.ts:17-18` |
| `/api/wallet` | GET | cookie | adapter | Solde + transactions. `wallet/route.ts:6-7` |
| `/api/wallet/topup` | POST | cookie + same-origin | adapter | Renvoie `url` Stripe Checkout, retour construit sur `request.nextUrl.origin` (`topup/route.ts:53,66`) → prévoir retour deep link / navigateur externe. Attention règles stores (achats numériques) |
| `/api/wallet/webhook` | POST | signature Stripe | non | Stripe → serveur. `webhook/route.ts:17-22` |
| `/api/food` | GET/POST | cookie + same-origin | adapter | Commande repas ; dernière commande dans un **cookie signé** `src/lib/food/last-order.ts:38,50`. Réservé admin/démo sauf `FOOD_ORDERING=all` (`src/lib/food/access.ts:11-14`) |
| `/api/barge` | GET/POST | cookie + same-origin | adapter | Tickets de barge, accès conditionnel (`src/lib/barge/access.ts`). `barge/route.ts:26,60` |
| `/api/code-exam` | GET | public | oui | Créneaux La Poste. `code-exam/route.ts:10` |
| `/api/code-exam/requests` | GET/POST | cookie + same-origin | adapter | Demandes de réservation. `requests/route.ts:49,79` |
| `/api/route` | GET | cookie | adapter | Itinéraire (suivi livreur). `route/route.ts:42-43` |
| `/api/auth/device` | POST | cookie | adapter | Notifie connexion nouvel appareil (cookie appareil). `device/route.ts:18-31` |
| `/api/auth/password-notice` | POST | cookie | adapter | E-mail « mot de passe changé ». `password-notice/route.ts:15-16` |
| `/api/auth/email-hook` | POST | signature webhook Supabase | non | Send Email Hook. `email-hook/route.ts:16-24` |
| `/api/awa` | POST | Bearer secret partenaire (`awa_partner_keys`) | non | Sites partenaires serveur-à-serveur. `awa/route.ts:60-64` |
| `/api/v1/tamilya` | POST | Bearer clé développeur + `x-gemini-key` | non | API publique développeurs, pas pour l'app (ne jamais y mettre de clé embarquée). `v1/tamilya/route.ts:88-97` |
| `/api/ai/relay` | POST | signature HMAC `x-relay-*` | non | Relais IA interne. `ai/relay/route.ts:29-35` |
| `/api/cron/laposte` | GET | Bearer `CRON_SECRET` | non | Tâche planifiée. `cron/laposte/route.ts:9-12` |
| `/auth/callback` | GET | code PKCE / token_hash | non (web) | Le mobile utilise le deep link de supabase_flutter |

### 5. Inventaire fonctionnel (hors admin) → priorité mobile
| Fonctionnalité web | Source | Priorité |
|---|---|---|
| Chat avec Tamilya en flux (Markdown, arrêt, réessai) | `ChatView.tsx`, `/api/chat` | **MVP** |
| Essai invité (5 messages) puis inscription obligatoire | `route.ts:243-250` | **MVP** |
| Connexion / inscription e-mail + mot de passe, Google, mot de passe oublié | `AuthDialog.tsx`, `auth/*` | **MVP** |
| Historique : liste, ouverture, suppression, titre auto | `/api/conversations*`, `c/[id]/page.tsx` | **MVP** |
| Import de la conversation invitée après inscription | `ChatView.tsx:448-470` | MVP |
| Paramètres : profil (nom), personnalité de Tamilya, mémoire (voir/oublier), déconnexion, suppression du compte (obligatoire stores) | `parametres/actions.ts` | **MVP** (suppression compte) / V2 reste |
| Mode vocal (dictée + lecture de la réponse) | `lib/chat/voice.ts`, `voice:true` | V2 |
| Bandeau d'annonce, mode maintenance | `lib/site/announcement.ts`, `proxy.ts:20` | MVP (lecture) |
| Notifications (cloche) | `/api/notifications` | V2 (push natif plus tard) |
| Aide / FAQ | `/api/aide`, `lib/help/faq.ts`, `/aide` | V2 |
| Utilisation (quotas) | `/utilisation` | V2 |
| Portefeuille + recharge Stripe | `/portefeuille`, `/api/wallet*` | V2 (risque règles App Store/Play) |
| Examen du code : créneaux + réservation | `/api/code-exam*` | V2 |
| Commande de repas, suivi livreur (carte) | `/api/food`, `/api/route` | V2 (fonction bridée, admin/démo) |
| Tickets de barge (QR) | `/api/barge` | V2 |
| Adresses (carnet, GPS), téléphone, avis | `parametres/actions.ts:99-216` | V2 |
| Pages légales : confidentialité, groupe BTM, partenaires | `src/app/confidentialite` etc. | MVP (WebView/lien, exigé stores) |
| Espace développeurs (clés API) | `/developpeurs` | Hors scope |
| Administration, enseignement shimaoré, `/voix`, circuit | `/admin/*`, `(chat)/actions.ts` | Hors scope |
| Tamilya Connect | — | Réservé `features/connect/` |

## Décisions / recommandations (priorisées P0/P1/P2)

### P0 — Stratégie backend : réutiliser les routes Next + accepter un Bearer Supabase
Comparaison :
- **A. Routes Next + Bearer** (recommandé) : l'IA, les quotas, la mémoire, le prompt, les écritures par clé secrète (`repository.ts:27`) et les fournisseurs restent au serveur. Une seule logique métier pour web et mobile. Aucune clé IA dans l'app.
- **B. Supabase direct** : impossible pour le chat (IA et écritures côté serveur) ; dupliquerait la logique (quotas, validation) en Dart ; dépend entièrement des RLS. À réserver aux **lectures simples** déjà couvertes par RLS (ex. messages d'une conversation), après validation agent Sécurité.

Changement web minimal proposé (mission à valider par l'orchestrateur ET l'utilisateur, car auth) :
1. Dans `src/lib/supabase/server.ts:15-37` : si la requête porte `Authorization: Bearer <jwt>` **et aucun cookie de session**, créer le client avec `global.headers.Authorization` (la RLS s'applique à ce jeton) ; `getClaims()` (`session.ts:79`) vérifie déjà la signature. Lecture de l'en-tête via `headers()` de `next/headers`. Les cookies restent prioritaires → **comportement web identique**.
2. Ne pas appliquer ce Bearer aux routes qui utilisent déjà `authorization` pour autre chose (`/api/awa`, `/api/v1/tamilya`, `/api/cron/*`) : elles n'appellent pas `getAuthContext`, donc pas de conflit, mais à couvrir par un test.
3. Nouvelles routes : `GET /api/conversations/[id]/messages` (reprend `c/[id]/page.tsx:21-25`), `GET/PATCH /api/me` (profil, personnalité), `DELETE /api/me` (suppression compte), `GET/DELETE /api/me/memory`. Elles appellent les mêmes fonctions que les Server Actions (aucune duplication).
4. Identifiant appareil invité : accepter un en-tête `X-Device-Id` (uuid) en plus du cookie `btm_device` (`route.ts:168`), ou cookie jar côté Dart en attendant.
5. Tests node:test ajoutés pour : Bearer valide, Bearer invalide → invité, cookie prioritaire.
Impact web : nul fonctionnellement si cookies prioritaires ; risque = surface d'auth élargie → revue Sécurité obligatoire.

### P0 — Architecture Flutter proposée
```
lib/
  main.dart / app.dart            # bootstrap, ProviderScope, router
  core/
    config/        # Env (URL API, URL + clé publishable Supabase via --dart-define)
    network/       # ApiClient (dio), intercepteur Bearer + refresh, gestion 401/429/503
    streaming/     # NdjsonDecoder (Stream<List<int>> -> Stream<ChatStreamEvent>)
    errors/        # AppFailure + mapping des ChatErrorCode (types.ts:13-27)
    router/        # go_router + garde auth + deep links (OAuth, reset)
    theme/ l10n/   # fr (+ shimaoré plus tard)
  features/
    auth/          data/ (AuthRepository -> supabase_flutter) domain/ presentation/
    chat/          data/ (ChatRepository -> POST /api/chat) domain/ presentation/
    conversations/ data/ domain/ presentation/
    settings/      ...
    guest_trial/   (compteur local, import brouillon)
    connect/       # RÉSERVÉ Tamilya Connect — vide (README seulement)
  shared/widgets/
```
- **Gestion d'état : Riverpod 2 (riverpod_generator)**. Pourquoi : injection des repositories sans BuildContext (testabilité, override en test), `StreamNotifier` naturel pour le flux NDJSON, `AsyncValue` pour chargement/erreur, annulation par `ref.onDispose`. Bloc possible mais plus verbeux pour une petite équipe.
- **HTTP : dio** (intercepteurs, `ResponseType.stream`, `CancelToken` pour « Arrêter » → coupe la requête, le serveur marque `interrupted` via `request.signal`, `route.ts:453`). `cookie_jar` + `dio_cookie_manager` pour `btm_device` tant que `X-Device-Id` n'existe pas.
- **Auth : supabase_flutter** (session persistée, refresh auto ; flux PKCE ; deep link `tamilya://auth-callback` à ajouter côté Supabase). L'intercepteur lit `Supabase.instance.client.auth.currentSession?.accessToken` et ajoute `Authorization: Bearer`. Aucune autre clé que la publishable dans l'app.
- **Streaming** : lire `response.data.stream`, `utf8.decoder` puis `LineSplitter`, `jsonDecode` par ligne, ignorer lignes invalides (même règle que `stream-protocol.ts:10-28`). Modèle `sealed class ChatStreamEvent` (meta/delta/replace/learned/done/error). Vérifier sur Vercel que le flux n'est pas tamponné (en-têtes déjà prévus `route.ts:627-628`).
- **Repositories** : interfaces dans `domain/`, implémentations dans `data/` (`ChatRepository`, `ConversationRepository`, `ProfileRepository`, `AuthRepository`). Seule la couche `data` connaît les URL / Supabase : permet de basculer route Next ↔ Supabase direct sans toucher l'UI.
- Modèles : `freezed` + `json_serializable`.

### P1 — Conventions de développement
- Dart : `snake_case.dart`, classes `PascalCase`, un widget public par fichier, suffixes `*Repository`, `*Notifier`, `*Screen`, `*Dto`.
- Branches : `main` protégée, `feat/<module>`, `fix/<sujet>`, une mission = une branche (TEAM_RULES §3) ; commits Conventional Commits (`feat(chat): ...`).
- Lint : `very_good_analysis` ou `flutter_lints` + `analysis_options.yaml` strict ; `dart format` ; `flutter analyze` sans avertissement en CI.
- Tests : unitaires pour `NdjsonDecoder`, mapping d'erreurs, repositories (mock dio via `http_mock_adapter`) ; widget tests pour chat ; 1 test d'intégration de bout en bout contre un environnement de préproduction (jamais la prod sans accord).
- Config : `--dart-define-from-file=env/dev.json` (non commité), environnements dev/preprod/prod.
- Textes en français centralisés (`l10n/app_fr.arb`).

### P2
- Contrat d'API versionné (`/api/...` → documenter le contrat NDJSON dans le dépôt web, `src/lib/chat/types.ts` = source de vérité) ; à terme préfixe `/api/mobile/v1` si divergences.
- Push notifications natives (FCM/APNs) remplaçant la cloche en V2.

## Fichiers modifiés (normalement : aucun pendant l'audit)
Dépôt web : aucun. Projet mobile : création de `docs/audit/01-architecte.md` uniquement.

## Vérifications effectuées (commandes lancées, résultats)
- Lecture : `package.json`, `next.config.ts`, `vercel.json`, `README.md` (début), `src/proxy.ts`, `src/lib/supabase/{server,client}.ts`, `src/lib/auth/session.ts`, `src/lib/security/request.ts`, `src/lib/chat/{stream-protocol,types,validation}.ts`, `src/app/api/chat/route.ts` (l.1-250 + fin), `(chat)/actions.ts`, `c/[id]/page.tsx`, extraits de `ChatView.tsx`, `AuthDialog.tsx`, `/api/awa`, `/api/v1/tamilya`, `/api/code-exam`, `/api/accueil/conversation`.
- `grep` des motifs d'auth (`getAuthContext`, `isSameOrigin`, `authorization`, signatures) sur les 21 routes API ; `grep` des `fetch("/api…")` côté client ; `grep cookies()` dans `src/lib` (cookies utilisés aussi par `food/last-order.ts`, `wallet/demo.ts`, `admin/unlock.ts`).
- Aucune commande de build/test lancée (lecture seule).

## Non résolu / questions pour l'orchestrateur
1. **Accord utilisateur** pour la modification auth du web (Bearer dans `src/lib/supabase/server.ts`) + nouvelles routes : bloquant pour tout le MVP connecté.
2. URL de l'API cible pour le mobile (prod Vercel ? préproduction disponible ?) et projet Supabase de test.
3. Portefeuille / recharge Stripe dans l'app : accepté au regard des règles Apple/Google (achat de crédit numérique) ou exclu de la V1 ?
4. Google OAuth requis au MVP mobile ? (impose deep link + config Supabase et, sur iOS, probablement « Sign in with Apple »).
5. Le mode invité (5 messages sans compte) doit-il exister sur mobile ?
6. Agent Backend/Sécurité : les RLS de `messages`/`conversations`/`profiles` permettent-elles une lecture directe sûre depuis le client mobile (option B pour les lectures) ?

## Dépendances avec d'autres agents
- Backend + Sécurité : valider le design Bearer (l. P0), RLS des lectures, rate limit par `X-Device-Id`, suppression de compte.
- UI/UX : rendu Markdown, états `interrupted/error`, blocs spéciaux insérés dans les réponses (food, barge, code-exam : `src/lib/*/intent.ts`) à afficher ou ignorer en MVP.
- QA : tests du décodeur NDJSON et du flux bout en bout.
