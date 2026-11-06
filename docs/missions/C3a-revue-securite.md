# Agent 5 (Sécurité) : revue C3a de l'authentification de l'app mobile

Périmètre : `git diff main...feat/c3a-auth -- tamilya_mobile tools` (38 fichiers, +2979 / −116). Lecture seule : je n'ai rien modifié, je n'ai envoyé aucune requête vers la production ni aucun message de chat, et je n'ai pas relancé les serveurs de développement. Versions résolues dans `pubspec.lock` : dio 5.11.1, flutter_secure_storage 11.2.0, supabase_flutter 2.18.3, gotrue 2.27.3.

## Verdict : **APPROUVÉ AVEC RÉSERVES**

Aucun secret n'est embarqué. Le Bearer n'est envoyé qu'à l'hôte de l'API et le rejeu est borné. Les erreurs ne divulguent rien et il n'y a pas d'énumération de comptes au-delà de ce que fait déjà le site web. La branche peut être fusionnée. Les réserves portent sur trois points : M-1 (le proxy de développement écoute sur toutes les interfaces), M-2 (rien n'interdit un build web ou http en production), et quelques durcissements natifs à faire **avant la première publication sur les stores** (F-1 à F-3).

## Constats

### 1. Stockage de la session
| # | Sévérité | Fichier:ligne | Constat | Correction exacte |
|---|---|---|---|---|
| — | OK | `lib/core/supabase/secure_local_storage.dart:13-18`, `lib/core/bootstrap.dart:42-43` | Sur iOS et Android, la session et le vérificateur PKCE sont stockés dans `flutter_secure_storage`, jamais dans SharedPreferences. Sur iOS, l'option `KeychainAccessibility.first_unlock_this_device` rend la donnée disponible après le premier déverrouillage et la garde sur l'appareil : **pas de synchronisation iCloud** ni de migration par sauvegarde chiffrée. Sur Android, flutter_secure_storage 11 chiffre avec une clé du Keystore. | — |
| — | OK | `lib/features/auth/data/supabase_auth_repository.dart:137-143,178` | La déconnexion appelle `signOut(scope: local)` : la session est révoquée côté serveur quand le réseau répond, puis `removePersistedSession` efface la clé du coffre même si le serveur est injoignable. Un 401 persistant passe par `expire()`, qui fait la même chose. | — |
| F-1 | Faible | `android/app/src/main/AndroidManifest.xml:2` | `android:allowBackup` n'est pas défini, donc la sauvegarde automatique est active par défaut. Les préférences chiffrées de flutter_secure_storage sont sauvegardées, mais la clé du Keystore ne l'est pas. Restaurées sur un nouvel appareil, elles sont indéchiffrables : erreurs au démarrage ou session fantôme. Il n'y a pas de fuite du jeton, puisque seul le texte chiffré part en sauvegarde. | Dans `<application …>`, ajouter `android:allowBackup="false"` et `android:fullBackupContent="false"`, ou des règles `dataExtractionRules` qui excluent `FlutterSecureStorage`. Les deux options figurent dans la documentation de flutter_secure_storage. |
| F-2 | Faible | `secure_local_storage.dart:13-18` | Sur iOS, le Keychain **survit à la désinstallation** : après une réinstallation, l'utilisateur est reconnecté sans le vouloir, par exemple sur un téléphone revendu sans avoir été réinitialisé. | Au premier lancement, si un indicateur `installed` est absent de SharedPreferences, appeler `FlutterSecureStorage().deleteAll()` puis poser l'indicateur. C'est un correctif de 10 lignes dans `bootstrap.dart`, avant `Supabase.initialize`. |
| M-2a | Moyenne | `lib/core/bootstrap.dart:42-43` | Sur le **web**, la session reste dans le `localStorage` du navigateur, lisible par n'importe quel script de la page en cas de XSS. Ce choix est documenté (`C3a-auth.md`, « Écarts avec ARCHITECTURE »), mais **rien n'empêche** un build web de production. | Dans `Env.validate`, ajouter `if (kIsWeb && appEnv == 'prod') return 'Build web non autorisé en production.';`, ou une vérification équivalente dans `bootstrap()`. Une version web de production exigerait une autre conception : jeton en mémoire seulement, ou cookie HttpOnly via le site. |

### 2. Secrets
| # | Sévérité | Fichier:ligne | Constat | Correction |
|---|---|---|---|---|
| — | OK | branche `feat/c3a-auth`, `tamilya_mobile/` et `tools/` | `git grep` des motifs `sb_secret_`, `service_role`, `SUPABASE_SECRET`, `AI_API_KEY`, `sk-…`, `AIza…`, JWT `eyJ…` et `sb_publishable_…` : **aucun résultat**. `lib/core/config/env.dart` ne lit que `APP_ENV`, `FORCE_THEME`, `API_BASE_URL`, `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. | — |
| — | OK | `.gitignore:21-22` | `tamilya_mobile/config/*.json` est ignoré (avec une exception pour `*.example.json`) ; `git check-ignore` le confirme pour `config/dev.json`. `git log --all -- tamilya_mobile/config/dev.json` est **vide** : le fichier n'a jamais été commité. Seuls `config/dev.example.json` et `env/example.json` (des valeurs d'exemple) sont suivis. | — |
| — | OK | `config/dev.json` (local, non suivi) | Sa clé est de type `sb_publishable_…` (longueur 46) : c'est **la seule clé embarquée**, publique par conception. Le fichier ne contient pas de clé secrète. | — |

### 3. Client API (`lib/core/network/`)
| # | Sévérité | Fichier:ligne | Constat | Correction exacte |
|---|---|---|---|---|
| — | OK | `auth_interceptor.dart:33-48` | Le Bearer n'est ajouté que si l'hôte **et** le port sont ceux de `API_BASE_URL`. Une URL absolue vers un autre domaine part sans jeton (cas couvert par un test). Le jeton est relu à chaque requête, jamais conservé dans un champ. | — |
| — | OK | `auth_interceptor.dart:64-95`, `supabase_auth_repository.dart:163-175` | Sur un 401 : un seul rafraîchissement, partagé par toutes les requêtes concurrentes (verrou à deux niveaux), puis **un seul** nouvel essai (`_kRetried`). Si le 401 persiste ou si le rafraîchissement échoue, `expire()` déconnecte et renvoie `SessionExpiredFailure`. Les erreurs autres que 401 au nouvel essai sont transmises telles quelles. | — |
| — | OK | `auth_interceptor.dart:74-75` | Les requêtes marquées `noReplay` ne sont jamais rejouées. Le mécanisme n'est pas encore utilisé : le chat réel arrive en C3b. | Exiger en C3b que `POST /api/chat` passe `extra: {AuthInterceptor.kNoReplay: true}`, avec un test. |
| F-3 | Faible | `auth_interceptor.dart:75,86` | Sur une requête `noReplay`, un 401 entraîne **une déconnexion immédiate, sans tentative de rafraîchissement**. Le cas est rare, puisque `currentAccessToken` rafraîchit à l'avance dans les 30 dernières secondes, mais une horloge décalée ou un jeton révoqué déconnecteraient l'utilisateur au milieu d'un message. | Remplacer la condition par `if (!alreadyRetried && await _refreshOnce()) { if (noReplay) return handler.reject(DioException(requestOptions: options, response: err.response, type: DioExceptionType.badResponse, error: const RetryableAuthFailure())); … }` : l'interface propose alors « Renvoyer », et la déconnexion n'a lieu que si le rafraîchissement échoue. |
| F-4 | Faible | `auth_interceptor.dart:35`, `api_client.dart:15-25` | `_isApiCall` compare l'hôte et le port, **pas le schéma**. Dio suit les redirections par défaut (jusqu'à 5). dart:io ne transmet plus `Authorization` lors d'une redirection vers un autre hôte depuis la correction de CVE-2022-0451, et les navigateurs le retirent aussi. Le risque est donc théorique, mais l'API ne fait jamais de redirection. | Dans `BaseOptions`, ajouter `followRedirects: false, maxRedirects: 0`. Dans `_isApiCall`, ajouter `o.uri.scheme == base.scheme &&`. |
| — | OK | branche entière | Aucun `print`, `debugPrint`, `log(` ni `LogInterceptor` dans `lib/`. `toFailure` et `ApiErrorParser` ne renvoient que `code`, `message` et le texte du serveur, jamais les en-têtes de la requête. | Règle à poser pour la suite : n'ajouter un `LogInterceptor` qu'en `kDebugMode`, avec `requestHeader: false`. |

### 4. Formulaires et messages d'erreur
| # | Sévérité | Fichier:ligne | Constat | Correction |
|---|---|---|---|---|
| — | OK | `supabase_auth_repository.dart:106-121` | « Mot de passe oublié » donne la même issue que le compte existe ou non ; seuls la saturation et l'échec réseau sont signalés. | — |
| — | OK | `lib/features/auth/domain/auth_messages.dart:1-28` | Connexion : un message unique, « E-mail ou mot de passe incorrect. ». `email_not_confirmed` n'apparaît qu'après un mot de passe correct, car Supabase vérifie d'abord le mot de passe. Les codes inconnus reçoivent un message générique, sans détail technique. | — |
| F-5 | Faible | `auth_messages.dart:188-190` | Le message « Un compte existe déjà avec cette adresse » révèle qu'une adresse a un compte. Supabase **ne renvoie ce code que si la confirmation d'e-mail est désactivée** ; sinon, il répond par un faux utilisateur. Le comportement est identique au site (`AuthDialog.tsx:44-68`). | Laisser la confirmation d'e-mail activée dans Supabase (à vérifier) ; sinon, remplacer le message par « Si l'adresse est libre, tu vas recevoir un e-mail de confirmation. ». |
| — | OK | `lib/features/auth/domain/signup_rules.dart:33-104` | Validation côté client alignée sur le site : nom de 60 caractères maximum, normalisation des espaces, adresse de 5 à 200 caractères, mot de passe d'au moins N caractères avec une lettre et un chiffre et qui ne contient pas l'e-mail, format d'e-mail. Le serveur (`handle_new_user` et les contraintes CHECK) **revalide tout**. Champ mot de passe en `obscureText` avec `autofillHints` (gestionnaire de mots de passe). Les adresses jetables ne sont pas refusées côté app ; la base les refuse. | — |

### 5. Routes `/recette/*` et `FORCE_THEME`
| # | Sévérité | Fichier:ligne | Constat | Correction exacte |
|---|---|---|---|---|
| — | OK, en partie | `lib/core/config/env.dart:12`, `lib/core/router/app_router.dart:65-70,82-92` | `forceTheme` est une `const String.fromEnvironment`. Si `FORCE_THEME` n'est pas défini, `Env.forceTheme.isNotEmpty` vaut faux à la compilation : les routes ne sont pas enregistrées et le bloc de connexion factice n'est jamais exécuté (élagué par le compilateur en release). Dans un build normal, elles sont **inactives**. | — |
| F-6 | Faible | `app_router.dart:65-70,77` | Si quelqu'un compile un build de production **avec** `FORCE_THEME`, `/recette/chat` appelle `signIn` sur le dépôt **réel** avec un compte factice : échec sans danger. Mais `/recette/*` reste dans la liste des chemins `open` sans condition (ligne 77), ce qui fera de ces routes des cibles de liens profonds une fois les App Links en place. | (a) Encadrer : `const bool kRecette = bool.fromEnvironment('dart.vm.product') == false && Env.forceTheme != '';`, ou `!kReleaseMode && Env.forceTheme.isNotEmpty`, et utiliser `kRecette` aux lignes 65, 77 et 82. (b) **Retirer** les routes `/recette/*` et `_RecetteAuth` avant la première version bêta sur les stores (fin de C3, avant C4 ou la publication), et garder `FORCE_THEME` limité au thème. |

### 6. Proxy de développement `tools/dev-proxy.js`
| # | Sévérité | Fichier:ligne | Constat | Correction exacte |
|---|---|---|---|---|
| M-1 | **Moyenne** | `tools/dev-proxy.js:29` | `.listen(PORT)` sans hôte écoute sur **toutes les interfaces** (`::` et `0.0.0.0`). Sur un réseau partagé (Wi-Fi public, bureau), n'importe qui peut joindre `:8090/api/*`. Le proxy transmet tous les en-têtes, y compris `Host` (ligne 17), donc `isSameOrigin` accepte la requête. Le serveur Next local tourne avec `.env.local`, qui contient les **secrets de production** (clé IA, clé secrète Supabase : audit 05, A-5). Un visiteur du réseau consomme donc la clé IA de production via `/api/chat` en invité, ou attaque la base de production via les routes serveur. | Ligne 29 : `.listen(PORT, "127.0.0.1", () => …)`. Lancer Next avec `next dev -p 3100 -H 127.0.0.1`, car `next dev` écoute lui aussi sur toutes les interfaces par défaut. En développement, utiliser idéalement un projet Supabase et une clé IA **de test**, pas ceux de production. |
| — | Faible | `tools/dev-proxy.js:16-22` | Aucun délai d'expiration, aucune limite de taille. Sans conséquence si l'écoute est réservée à localhost. | — |

### 7. Configuration de build
| # | Sévérité | Fichier:ligne | Constat | Correction exacte |
|---|---|---|---|---|
| M-2b | Moyenne | `lib/core/config/env.dart:36-47` | `http` est accepté vers `localhost` et `127.0.0.1` **quelle que soit la valeur de `APP_ENV`**. Un build de production configuré par erreur avec `config/dev.json` (`http://localhost:8090`) serait accepté : il ne fonctionnerait simplement pas, sans fuite. En revanche, rien ne vérifie qu'un build `prod` n'embarque pas la configuration de développement. | Dans `validate`, si `Env.appEnv == 'prod'`, exiger `https` partout, refuser `localhost` et vérifier que `SUPABASE_PUBLISHABLE_KEY` commence par `sb_publishable_`. Refuser aussi tout `sb_secret_` dans tous les environnements : `if (k.startsWith('sb_secret_')) return 'Clé secrète interdite dans l'app.';`. |
| — | Info | `android/app/src/main/AndroidManifest.xml`, `ios/Runner/Info.plist` | Pas de `usesCleartextTraffic` ni d'exception ATS : http est interdit par défaut en release sur iOS, et sur Android à partir de l'API 28. C'est bien. | Garder cet état. Pour le développement Android en http, utiliser seulement un `network_security_config` propre au profil `debug`. |

## Fichiers modifiés
- Aucun. Seul fichier créé : `docs/missions/C3a-revue-securite.md`. Les fichiers `PROJECT_CONTROL.md` et `TOKEN_BUDGET.md`, signalés comme modifiés par `git status`, l'étaient déjà par l'orchestrateur avant ma revue.

## Vérifications effectuées
- `git diff main...feat/c3a-auth --stat -- tamilya_mobile tools`. Lecture de `secure_local_storage.dart`, `bootstrap.dart`, `main.dart`, `env.dart`, `auth_interceptor.dart`, `api_client.dart`, `session_tokens.dart`, `supabase_auth_repository.dart`, `auth_messages.dart`, `app_router.dart` (lignes 55-125), `tools/dev-proxy.js`, et des extraits de `signup_rules.dart`, `api_error_parser.dart` et `api_account_repository.dart`.
- `git grep` des secrets et des journaux sur `feat/c3a-auth` : aucun résultat. `git check-ignore -v tamilya_mobile/config/dev.json` : ignoré. `git log --all -- tamilya_mobile/config/dev.json` : vide. Type de clé de `dev.json` déterminé par un script, sans afficher sa valeur.
- Recherche de `allowBackup`, `usesCleartextTraffic`, `NSAppTransportSecurity` et `followRedirects` : aucun réglage trouvé (défauts décrits plus haut).
- `flutter analyze` et `flutter test`, avec le SDK de `C:\Users\aloal\dev\flutter\bin` : `flutter analyze` affiche « No issues found! » (code de sortie 0) ; `flutter test` affiche « +44: All tests passed! » (44 réussis, 0 échec, code de sortie 0). Aucun fichier suivi n'a été modifié.

## Non résolu / questions pour l'orchestrateur
1. La confirmation d'e-mail est-elle activée dans Supabase ? Elle conditionne F-5.
2. Une version web de production est-elle prévue ? Si oui, il faut une conception dédiée (M-2a).
3. Pour le développement, peut-on avoir un projet Supabase et une clé IA de test, distincts de la production (M-1) ?

## Dépendances
- **Flutter** : M-1, M-2a, M-2b, F-3, F-4 et F-6(a) maintenant (corrections courtes) ; F-1 et F-2 avec C3 natif ; F-6(b) avant la bêta ; `noReplay` sur le chat en C3b.
- **Backend** : rien de nouveau. Les réserves R-1 à R-3 de C1 restent ouvertes.
