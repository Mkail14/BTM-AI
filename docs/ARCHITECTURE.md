# Tamilya Mobile — Architecture (V1)

_Architecte, 2026-11-04. Consolide `docs/audit/01-architecte.md` et les décisions D4 à D9 de `docs/DIAGNOSTIC_ET_PLAN.md`. Le contrat réseau détaillé est dans `docs/API_CONTRACT_MOBILE.md`. Chemins `src/...` = dépôt web (lecture seule)._

## 1. Principes
1. **Lire en direct, écrire par le serveur** (D5). L'app lit `conversations`, `messages` et `profiles` via supabase_flutter, sous RLS et en tant que propriétaire. Toutes les écritures (message, import, suppression, profil, compte) et tous les appels IA passent par les routes Next `/api/**` avec `Authorization: Bearer <access_token>` (D4).
2. **Aucun secret dans l'app**. Le binaire ne contient que l'URL Supabase, la clé *publishable* et l'URL de l'API. Aucun prompt, aucun lexique, aucune clé IA, Stripe ou service role (exigence 05 §8).
3. **Un seul cerveau**. Prompt, quotas, mémoire et personnalité restent côté serveur. L'app ne réimplémente aucune règle métier, sauf les validations de confort (longueur du message, par exemple), qui reprennent les valeurs du serveur.
4. **Le web reste intact**. Le seul changement web est C1 (Bearer + `/api/me`), sur une branche séparée.
5. **Organisation par fonctionnalité** (D6). Une fonctionnalité ne dépend jamais d'une autre fonctionnalité, seulement de `core/` et `shared/`.

## 2. Arborescence
```
tamilya_mobile/
  pubspec.yaml
  analysis_options.yaml
  env/                       # dev.json, preprod.json, prod.json — NON commités (exemple : env/example.json)
  assets/brand/              # logo, icône, splash (fournis par l'utilisateur)
  assets/fonts/              # Geist (licence à confirmer)
  lib/
    main.dart                # lit Env, initialise Supabase (stockage sécurisé), ProviderScope, runApp
    app.dart                 # MaterialApp.router, thème clair/sombre, localisation fr
    core/
      config/
        env.dart             # API_BASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_ENV (String.fromEnvironment)
        feature_flags.dart   # guestMode, googleSignIn, appleSignIn (cf. §9)
      supabase/
        supabase_bootstrap.dart   # Supabase.initialize(..., authOptions: localStorage sécurisé, PKCE)
        secure_local_storage.dart # implémente LocalStorage de supabase_flutter via flutter_secure_storage
        supabase_providers.dart   # supabaseClientProvider, authStateProvider (Stream<AuthState>)
      network/
        api_client.dart      # instance dio : baseUrl = API_BASE_URL, timeouts, JSON
        auth_interceptor.dart# ajoute Bearer, rafraîchit, gère 401 (cf. §5)
        api_error_parser.dart# corps d'erreur -> ApiFailure (cf. §7)
        network_providers.dart
      streaming/
        ndjson_decoder.dart  # Stream<List<int>> -> Stream<ChatStreamEvent> (cf. §6)
        chat_stream_event.dart   # sealed class
      errors/
        app_failure.dart     # sealed class AppFailure (réseau, api(code), maintenance, session expirée, inconnu)
        error_messages_fr.dart   # libellés repris de src/lib/chat/errors.ts:5-23
      router/
        app_router.dart      # go_router : /login, /signup, /reset, /, /c/:id, /settings, /legal/:page
        auth_guard.dart      # redirection selon session + flag guestMode
        deep_links.dart      # retour OAuth / confirmation e-mail / reset (App Links vérifiés)
      theme/
        tokens.dart          # couleurs, rayons, espacements repris de globals.css (D8, cf. 03-uiux.md §1)
        app_theme.dart       # ThemeData light/dark
      l10n/
        app_fr.arb           # textes repris à l'identique (« Tamilya », jamais « Awa »)
      utils/
        logger.dart          # journal sans jeton ni contenu de message en prod
    shared/
      widgets/               # boutons, champs, dialogues, états vide/erreur/chargement, Markdown
      models/                # PersonalityId, etc. partagés
    features/
      auth/
        data/   auth_repository_impl.dart        # supabase.auth (signUp, signIn, reset, signOut) + /api/auth/password-notice
        domain/ auth_repository.dart, app_user.dart
        presentation/ login_screen.dart, signup_screen.dart, reset_password_screen.dart, new_password_screen.dart, auth_controller.dart
      chat/
        data/   chat_repository_impl.dart        # POST /api/chat (flux), POST /api/conversations (import invité)
                chat_remote_source.dart
        domain/ chat_repository.dart, chat_message.dart, send_message_request.dart
        presentation/ chat_screen.dart, composer.dart (Entrée = saut de ligne, D9), message_bubble.dart, chat_controller.dart
      conversations/
        data/   conversations_repository_impl.dart   # lecture Supabase directe ; suppression DELETE /api/conversations/{id}
        domain/ conversations_repository.dart, conversation_summary.dart, stored_message.dart
        presentation/ conversations_drawer.dart, conversations_controller.dart
      settings/
        data/   account_repository_impl.dart     # GET/PATCH/DELETE /api/me
        domain/ account_repository.dart, profile.dart, personality_card.dart
        presentation/ settings_screen.dart, personality_picker.dart, delete_account_screen.dart, account_controller.dart
      legal/
        presentation/ legal_links.dart            # ouvre /confidentialite etc. dans le navigateur système (url_launcher)
      connect/
        README.md            # « Réservé à Tamilya Connect — ne rien ajouter sans décision de l'orchestrateur. »
  test/
    core/streaming/ndjson_decoder_test.dart
    core/network/api_error_parser_test.dart
    core/network/auth_interceptor_test.dart
    features/*/data/*_repository_impl_test.dart
    features/chat/presentation/chat_controller_test.dart
  integration_test/
    chat_flow_test.dart      # contre préproduction uniquement
```
Navigation (arbitrage UI/UX) : un écran de conversation plein écran avec un tiroir latéral (liste des conversations, accès aux paramètres), sans barre d'onglets.

## 3. Couches et règles de dépendance
```
presentation (Widgets)  ->  providers Riverpod (Notifier/AsyncNotifier/StreamNotifier)
      ->  domain (interfaces de repository + entités immuables)
      <-  data (implémentations)  ->  sources : ApiClient (dio)  |  SupabaseClient
```
Règles (vérifiées en revue, puis par un lint d'import si possible) :
- Un widget n'importe ni `dio` ni `supabase_flutter`. Il lit uniquement des providers.
- Un provider dépend d'une **interface** de repository (`domain/`). Son implémentation est fournie par un provider surchargeable dans les tests (`overrideWith`).
- Seul `data/` connaît les URL, les noms de tables et les DTO JSON. Pour basculer une opération entre Supabase direct et une route Next, on ne modifie qu'un fichier `*_repository_impl.dart`.
- `features/X` n'importe jamais `features/Y`. Ce qui doit être partagé va dans `shared/`. La seule exception est le routeur dans `core/router`, qui assemble les écrans.
- Les entités `domain/` sont immuables (freezed) et ne contiennent pas de logique réseau.
- Les erreurs remontent sous forme de `AppFailure` typé. Une exception dio ou Postgrest ne sort jamais de `data/`.

## 4. Gestion d'état : Riverpod
- `authStateProvider` (StreamProvider sur `onAuthStateChange`) est la source de vérité de la session. Le routeur s'y abonne via `refreshListenable`.
- `conversationsControllerProvider` (AsyncNotifier) gère la liste. Il la recharge au démarrage, au retour au premier plan (`AppLifecycleState.resumed`), après un `done` et 5 s après la création d'une conversation (titre IA, comme `ChatView.tsx:412-414`). Le serveur ne publie rien en Realtime (04 §2).
- `chatControllerProvider(conversationId?)` (Notifier, famille) gère la liste des `ChatMessage` affichés, l'état du flux et l'annulation.
- Version : la décision D7 dit « Riverpod 2 ». Riverpod 3 est la ligne stable actuelle. Choisir la **dernière stable** au moment de C2 et figer la version majeure (voir §11).

## 5. Session et authentification
- **Initialisation** : `Supabase.initialize(url, publishableKey, authOptions: FlutterAuthClientOptions(authFlowType: AuthFlowType.pkce, localStorage: SecureLocalStorage(), pkceAsyncStorage: <stockage sécurisé>))`. Les jetons sont stockés dans le Keychain (iOS) et le Keystore / EncryptedSharedPreferences (Android), jamais dans SharedPreferences (05 §1). Sur iOS, utiliser `first_unlock_this_device` sans synchronisation iCloud. Sur Android, `android:allowBackup="false"` ou une règle d'exclusion.
- **Rafraîchissement** : supabase_flutter rafraîchit automatiquement le jeton. L'intercepteur dio relit `auth.currentSession` à **chaque** requête et ne met jamais le jeton en cache. Si `session.isExpired` (ou si elle expire dans moins de 30 s), il appelle `auth.refreshSession()` avant d'envoyer, avec un seul rafraîchissement à la fois (verrou `Completer`).
- **Intercepteur Bearer** : `Authorization: Bearer <accessToken>` sur les appels vers `API_BASE_URL` uniquement, jamais vers un autre domaine. Aucun en-tête `Origin` n'est envoyé, ce qui permet de passer `isSameOrigin` (`src/lib/security/request.ts:26-31`).
- **401** : l'app tente un seul `refreshSession()`, puis rejoue la requête. Si elle obtient encore 401, ou si le rafraîchissement échoue, elle appelle `auth.signOut(scope: local)`, vide les caches Riverpod (`ref.invalidate`) et redirige vers `/login` avec le message « Ta session a expiré. Reconnecte-toi. ». Une requête de flux déjà commencée n'est jamais rejouée (cf. §6).
- **Déconnexion** : `signOut(scope: local)` par défaut, avec une option « Se déconnecter de tous les appareils » qui appelle `signOut(scope: global)` (05 §9). Elle efface le stockage sécurisé et les providers.
- **Liens e-mail** (confirmation d'inscription, réinitialisation) : App Links et Universal Links vérifiés, avec une URL de redirection mobile **exacte** ajoutée dans Supabase (05 §4). Aucune réutilisation de `/auth/callback` du web.
- **Exigence pour C1, à transmettre au Backend** : quand un Bearer est **présent mais invalide**, `/api/chat` doit répondre `401 unauthorized` et **ne pas** traiter la requête comme celle d'un invité. Sinon, un jeton expiré consommerait silencieusement l'essai invité. Par ailleurs, côté serveur, `getClaims()` (`src/lib/auth/session.ts:79`) doit recevoir le jeton explicitement (`getClaims(token)`), car un client sans cookie n'a pas de session stockée à vérifier.

## 6. Flux de chat : décodeur NDJSON
Format serveur : `application/x-ndjson`, une ligne JSON terminée par `\n` par événement (`src/lib/chat/stream-protocol.ts:4-6`, `src/lib/chat/types.ts:30-38`).

```dart
sealed class ChatStreamEvent {}
final class MetaEvent    extends ChatStreamEvent { final String conversationId; }
final class DeltaEvent   extends ChatStreamEvent { final String text; }
final class ReplaceEvent extends ChatStreamEvent { final String text; }   // mode admin, rare : remplace tout le texte
final class LearnedEvent extends ChatStreamEvent { final List<({String french, String shimaore})> words; } // admin : ignoré en V1
final class DoneEvent    extends ChatStreamEvent { final FinishReason finishReason; } // stop | length | refusal | other
final class ErrorEvent   extends ChatStreamEvent { final ChatErrorCode code; final String message; }
```
- **Décodage** : `response.data.stream` (dio `ResponseType.stream`) passe dans `utf8.decoder`, puis `LineSplitter`, puis `jsonDecode`. Une ligne vide, illisible ou de `type` inconnu est **ignorée**, comme dans `stream-protocol.ts:10-28`. Cela garde la compatibilité avec de futurs événements. Le reste du tampon est traité à la fin du flux.
- **Avant le flux** : si le statut n'est pas 200 ou si le `Content-Type` n'est pas NDJSON, l'app lit le corps JSON d'erreur, puis le transforme en `ApiFailure` (§7).
- **Application** : `meta` mémorise `conversationId` (nouvelle conversation : l'app remplace la route par `/c/:id` sans reconstruire l'écran). `delta` ajoute le texte, avec un rendu limité à environ 30 images/s. `replace` remplace le texte. `done` marque le message `complete`, ou `interrupted` si `finishReason` vaut `length`. `error` marque le message `interrupted` s'il a déjà du texte, sinon `error`, et affiche `message` (même logique que `ChatView.tsx:341-349`).
- **Annulation** (bouton « Arrêter ») : `CancelToken.cancel()` ferme la connexion. Le serveur s'arrête (`AbortSignal.any([... request.signal ...])`, `route.ts:453`) et enregistre la réponse avec le statut `interrupted`. L'app affiche « Génération arrêtée. ».
- **Fin sans `done` ni `error`** : le message reçoit le statut `interrupted` (« Réponse interrompue. »).
- **Coupure réseau pendant le flux** : un flux NDJSON **ne peut pas reprendre** là où il s'est arrêté, car le serveur n'a pas de reprise. Stratégie :
  1. marquer le message local `interrupted` (« La connexion avec le serveur a été interrompue. », ou « Tu es hors ligne… » si `connectivity_plus` indique une absence de réseau) ;
  2. si l'utilisateur est connecté et que l'app connaît le `conversationId`, recharger les messages depuis Supabase au retour du réseau, car c'est le serveur qui fait foi ;
  3. proposer « Réessayer ». Ce bouton **renvoie le message** : le serveur enregistre alors un second message utilisateur (comportement identique au web, `ChatView.tsx:442-446`).
- **Pas de rejeu automatique** de `POST /api/chat`, ni par l'intercepteur 401, ni par une logique de réessai, parce qu'il consomme du quota et crée un message.
- **Délais** : `connectTimeout` de 15 s. Le `receiveTimeout` est désactivé pour le flux (jusqu'à 120 s côté serveur, `route.ts:48`). L'app surveille plutôt l'inactivité : sans aucun octet pendant 60 s, la connexion est considérée comme coupée.

## 7. Gestion des erreurs
Deux formes de corps d'erreur existent côté serveur et le parseur doit accepter les deux :
- `{"error":{"code":"<ChatErrorCode>","message":"<fr>"}}` pour le chat et les conversations (`src/lib/chat/errors.ts:25-27`), et pour `/api/me` (proposé) ;
- `{"error":"<texte fr>"}` pour la maintenance renvoyée par le proxy (`src/proxy.ts:22`, statut 503 + `Retry-After: 600`) et pour les autres routes (food, barge, wallet…).

| Code / cas | HTTP typique | Comportement app |
|---|---|---|
| `ai_not_configured` | 503 | Bandeau d'erreur et bouton « Réessayer plus tard » |
| `rate_limited` | 429 | Afficher le message. Lire `Retry-After`, désactiver l'envoi jusqu'à la fin du délai et afficher un compte à rebours |
| `signup_required` | 403 | Invité (flag) : ouvrir l'inscription avec le motif |
| `invalid_request` | 400/403/413 | Message serveur (zod : premier problème). Le message tapé reste dans le composer |
| `conversation_too_long` | 409 | Proposer « Nouvelle conversation » et bloquer le composer |
| `unauthorized` | 401 | Procédure de session expirée (§5) |
| `not_found` | 404 | Conversation supprimée ailleurs : retirer de la liste et revenir à une nouvelle conversation |
| `provider_error` | 500/flux | Message + « Réessayer » |
| `provider_overloaded` | 503/flux | Idem, avec la suggestion « dans quelques instants » |
| `timeout` | flux | Idem |
| `refusal` | flux | Message, sans « Réessayer » |
| `service_unavailable` | 503 | Message + « Réessayer » |
| `flow_cut` | 503 | « Tamilya est en pause… », sans réessai automatique |
| `internal` | 500 | Message générique + « Réessayer » |
| **Maintenance** `{error:string}` | 503 + `Retry-After` | Écran plein « Maintenance » avec nouvel essai après `Retry-After` (600 s), puis bouton manuel |
| Réseau (pas de réponse) | — | « Vérifie ta connexion internet. » |
| Code inconnu | — | Afficher `message` s'il existe, sinon le libellé `internal` |

Les libellés de repli (quand le serveur n'envoie pas de message) reprennent à l'identique les textes de `src/lib/chat/errors.ts:5-23`. Les erreurs Supabase (lecture directe) sont converties en `AppFailure.network` ou `AppFailure.sessionExpired` (JWT expiré : code PGRST301 ou statut 401). Les messages techniques ne sont jamais affichés.

## 8. Configuration par environnement
- Lancement : `flutter run --dart-define-from-file=env/dev.json`. Le fichier `env/*.json` contient **uniquement** :
  `APP_ENV` (dev|preprod|prod), `API_BASE_URL` (https://…), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, et les flags (§9).
- Ces valeurs sont **publiques par conception** : la clé publishable est extractible du binaire, ce qui est acceptable puisque la RLS protège les données. Aucune autre clé ne doit jamais apparaître dans `env/`, dans `--dart-define` ou dans les assets (05 §2). `env/*.json` est ignoré par git, et un `env/example.json` contient des valeurs fictives.
- `Env` valide au démarrage que `API_BASE_URL` commence par `https://` (sauf en dev local) et que toutes les valeurs sont présentes. Sinon, l'app affiche un écran d'erreur de configuration. Elle n'autorise aucun trafic en clair (pas de `cleartextTraffic`, pas d'exception ATS, 05 §6).
- Les identifiants d'application, les schémas et les domaines de liens se définissent par *flavor* (dev/preprod/prod) côté Android et iOS. Point en attente : l'utilisateur n'a pas encore répondu sur l'existence d'une préproduction.

## 9. Options non tranchées : flags (prévues, non implémentées)
| Flag (`--dart-define`) | Défaut V1 | Si activé : ce qui change |
|---|---|---|
| `FEATURE_GUEST_MODE` | `false` (compte obligatoire) | **App** : le garde laisse `/` accessible sans session. Le chat envoie `{message, history}`, avec l'historique local limité à 10 tours et 60 000 caractères (`src/lib/chat/limits.ts:11,15`). L'app tient un compteur local d'essai et affiche l'écran `signup_required`. Après l'inscription, elle importe la conversation via `POST /api/conversations`. **Serveur (C1)** : identifiant d'appareil `X-Device-Id` (UUID généré et stocké en sécurisé) accepté à la place du cookie `btm_device` (`route.ts:168`), sinon l'app doit utiliser un cookie jar persistant. Avec ce flag, le quota par IP pèse fortement (CGNAT à Mayotte, 05 §5). **Recommandation** : rester sur `false` en V1. |
| `FEATURE_GOOGLE_SIGNIN` | `false` | **App** : `google_sign_in` natif, puis `auth.signInWithIdToken(provider: google, idToken, nonce)`. **Config** : client OAuth Android et iOS dans Google Cloud, et ID clients autorisés dans Supabase Auth → Google. Le profil est créé par le trigger (nom repris de `given_name`/`full_name`, 04 §2). Sur iOS, cela impose en pratique `FEATURE_APPLE_SIGNIN`. |
| `FEATURE_APPLE_SIGNIN` | `false` | **App** : `sign_in_with_apple`, puis `signInWithIdToken(provider: apple, ...)` avec un nonce. **Config** : capacité « Sign in with Apple » (compte Apple Developer) et fournisseur Apple dans Supabase. Le nom n'est transmis qu'à la première connexion : prévoir un écran « Ton nom » si `display_name` est vide. |

Les flags sont lus dans `core/config/feature_flags.dart`. Les écrans concernés testent le flag. Aucun code mort n'est livré en V1 : seules les interfaces et les points d'extension sont prévus (`AuthRepository.signInWithGoogle()` lève `UnimplementedError` tant que le flag est faux).

## 10. Sécurité mobile (rappel des exigences 05 §82-92 appliquées ici)
Stockage sécurisé des jetons (§5). Clé publishable uniquement (§8). Lectures directes limitées à `conversations`, `messages` et `profiles` en V1. Toutes les écritures passent par `/api/**`. HTTPS obligatoire. Pages légales et paiements (V2) ouverts dans le navigateur système, jamais dans une WebView avec JavaScript injecté. Les journaux ne contiennent ni jeton, ni e-mail complet, ni contenu de message (`core/utils/logger.dart`, désactivé en release sauf erreurs anonymisées). Captures d'écran : aucune restriction en V1.

## 11. Paquets (versions à figer au moment de C2 : prendre la dernière stable publiée sur pub.dev et vérifier la compatibilité avec le SDK Flutter installé)
| Paquet | Usage | Version |
|---|---|---|
| `flutter_riverpod`, `riverpod_annotation` | État | dernière stable (voir §4 : Riverpod 2 ou 3) |
| `riverpod_generator`, `build_runner` (dev) | Génération | dernière stable compatible |
| `supabase_flutter` | Auth + lectures RLS | dernière stable (ligne 2.x) |
| `flutter_secure_storage` | Jetons | dernière stable |
| `dio` | HTTP + flux + annulation | dernière stable (ligne 5.x) |
| `go_router` | Navigation + deep links | dernière stable |
| `freezed`, `freezed_annotation`, `json_serializable`, `json_annotation` | Modèles immuables / JSON | dernière stable |
| Rendu Markdown | Réponses de Tamilya | **à choisir en C2** : `flutter_markdown` a été annoncé comme abandonné par l'équipe Flutter. Évaluer `flutter_markdown_plus` ou `markdown_widget` (GFM : tableaux, listes) |
| `url_launcher` | Pages légales, liens | dernière stable |
| `connectivity_plus` | Hors ligne | dernière stable |
| `flutter_localizations` (SDK), `intl` | Français | version liée au SDK |
| `flutter_native_splash`, `flutter_launcher_icons` (dev) | Splash, icône | dernière stable |
| `very_good_analysis` **ou** `flutter_lints` (dev) | Lint | dernière stable (choix C2) |
| `mocktail`, `http_mock_adapter` (dev) | Tests | dernière stable |
| Plus tard (flags) : `google_sign_in`, `sign_in_with_apple` ; V2 : `speech_to_text`, `flutter_tts` | | dernière stable |

## 12. Conventions de développement
- **Nommage** : fichiers en `snake_case.dart`, types en `PascalCase`, membres en `camelCase`. Suffixes : `*Screen` (page routée), `*Controller` (Notifier), `*Repository` (interface) / `*RepositoryImpl`, `*Dto` (JSON réseau), `*Provider`. Un widget public par fichier.
- **Branches** : `main` protégée. Une mission = une branche `feat/<module>` (`feat/core-network`, `feat/chat-stream`…), et `fix/<sujet>` pour les corrections. Fusion après revue de l'orchestrateur (TEAM_RULES §3). Commits au format Conventional Commits (`feat(chat): décodeur NDJSON`).
- **Qualité, obligatoire avant revue** : `dart format --set-exit-if-changed .`, `flutter analyze` **sans aucun avertissement ni info**, `flutter test` au vert.
- **Tests obligatoires** :
  - `NdjsonDecoder` : lignes coupées entre deux morceaux, plusieurs événements dans un morceau, ligne invalide ignorée, type inconnu ignoré, reste sans `\n` final traité, UTF-8 multioctet coupé (emoji, accents) ;
  - `ApiErrorParser` : les deux formes d'erreur, les 14 codes, un code inconnu, `Retry-After` ;
  - `AuthInterceptor` : ajout du Bearer, rafraîchissement unique en cas d'accès concurrent, 401 suivi d'un rafraîchissement et d'un rejeu, 401 répété suivi d'une déconnexion, absence de rejeu de `/api/chat` ;
  - chaque `*RepositoryImpl` (dio simulé avec `http_mock_adapter`, Supabase derrière une petite interface simulable) ;
  - `ChatController` : delta, replace, done, error, annulation, coupure réseau.
- **Interdits** : `print` (utiliser le logger) ; `dynamic` non justifié ; appel réseau dans un widget ; secret dans le dépôt.
- **Revue** : toute PR qui touche `core/network`, `core/supabase` ou au stockage passe par la revue Sécurité.

---

## Arbitrages de l'orchestrateur (2026-11-04, après la mission B)
- **A1 — Bearer invalide → 401, jamais de bascule en invité.** Accepté. Ajouté au périmètre C1 : le serveur valide le jeton explicite (`getClaims(token)`).
- **A2 — `GET/PATCH/DELETE /api/me`** : accepté, y compris la lecture des personnalités (`awa_personalities`, aucun droit client). Seule nouvelle route de C1.
- **A3 — D7 amendée** : Riverpod **dernière version stable** au moment de C2, pas forcément la 2. Même règle pour tous les paquets : version fixée et vérifiée lors de C2.
- **A4 — Flux coupé** : pas de reprise, pas de renvoi automatique de `/api/chat` ; on recharge depuis Supabase, et « Réessayer » est une action explicite de l'utilisateur. Le doublon possible en base est accepté, comme sur le web.
- **A5 — Adresse à l'inscription** (vérifié par l'orchestrateur) : la base l'accepte comme **optionnelle** (le trigger `handle_new_user` la met à null si elle est invalide, `20261123000000_inscription_google.sql:23-31`), mais le formulaire web l'**exige** (`AuthDialog.tsx:633`). Le mobile V1 reprend le comportement du web (commune + adresse obligatoires), car elles servent au profil du chat (`src/lib/chat/profile.ts:27`) et au code de la route.
