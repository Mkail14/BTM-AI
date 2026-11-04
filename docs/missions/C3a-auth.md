# Agent 2 Flutter — Mission C3a : connexion au compte et client API
Branche `feat/c3a-auth`. Projet : `tamilya_mobile/`.

## Résumé
- Connexion e-mail + mot de passe, inscription (nom, commune, adresse obligatoires, arbitrage A5) et mot de passe oublié sont réels, par Supabase, dans la feuille de connexion existante. Apparence inchangée.
- Session persistée par flutter_secure_storage (iOS/Android) ; stockage navigateur par défaut sur le web (dev). Garde de routes : accueil sans session, chat avec session.
- Client API dio : Bearer courant relu à chaque requête, un rafraîchissement puis un nouvel essai sur 401, déconnexion propre si le 401 persiste, erreurs typées (formes A et B, maintenance).
- `/api/me` GET et PATCH branchés dans Paramètres (nom, personnalité). DELETE non branché (C3c).
- `flutter analyze` : No issues found. `flutter test` : 44 tests, All tests passed. `flutter build web --dart-define-from-file=config/dev.example.json` : réussi.

## Constats et réalisations
Commits : `f811144` outillage de dev ; puis réseau (dio + intercepteur + erreurs), auth réelle, paramètres `/api/me`, tests (hashes dans `git log`).

Paquets (versions résolues) : `supabase_flutter 2.18.3` (gotrue 2.27.3), `dio 5.11.1`, `flutter_secure_storage 11.2.0`. `Supabase.initialize(publishableKey: ..., authFlowType: pkce)`.

Architecture (ARCHITECTURE §3 respectée : seul `data/` connaît Supabase et dio) :
- `core/network/` : `api_client.dart` (dio, délais 15 s connexion / 30 s envoi et réception, aucun cookie), `auth_interceptor.dart`, `api_error_parser.dart`, `session_tokens.dart`.
- `core/errors/` : `AppFailure` étendu (`NetworkFailure`, `ApiFailure`, `MaintenanceFailure`, `AuthFailure`, `SessionExpiredFailure`) ; libellés de repli de `errors.ts`.
- `core/supabase/secure_local_storage.dart` : `LocalStorage` et stockage PKCE dans le Keychain (`first_unlock_this_device`) / Keystore.
- `core/bootstrap.dart` : lit `Env`, valide (https obligatoire, http seulement vers localhost), initialise Supabase, surcharge les providers (dépôts réels). Sans aucune configuration : mode maquette (dépôts factices, comme avant). Configuration invalide : écran d'erreur, aucun trafic.
- `features/auth/` : `AuthRepository` (signIn, signUp, requestPasswordReset, resendConfirmation, signOut, `sessionChanges`), `SupabaseAuthRepository` (implémente aussi `SessionTokens`), `describeAuthError` (reprise de `AuthDialog.tsx:44-68`), `signup_rules.dart` (17 communes, validation adresse 5 à 200 caractères, critères du mot de passe, normalisation : reprise de `src/lib/address-fields.ts`, `address.ts`, `auth/signup.ts`), `auth_forms.dart` (formulaires).
- Inscription : métadonnées `display_name`, `address_commune`, `address_line` (`AuthDialog.tsx:651-658`). Même écran de confirmation que l'adresse existe ou non. Mot de passe oublié : même écran quel que soit le compte (seuls la saturation et le réseau sont signalés, comme `ForgotPasswordForm.tsx`). « Renvoyer l'e-mail » si `email_not_confirmed`.
- Google et Apple : toujours masqués par leurs flags.
- Session : `sessionProvider` suit `sessionChanges` ; le routeur a un `refreshListenable` et redirige vers `/` sans session (seuls `/`, `/splash`, `/legal/*` sont ouverts) ; à la déconnexion, le provider du compte est invalidé. L'arbitrage de premier écran de C2b est conservé.
- Intercepteur : jeton ajouté aux seuls appels vers `API_BASE_URL` ; 401 : un seul `refresh()` partagé entre requêtes simultanées, un seul nouvel essai ; sinon `expire()` (déconnexion locale) et `SessionExpiredFailure`. Les requêtes marquées `extra['noReplay']` (le chat, C3b) ne sont jamais rejouées. `currentAccessToken()` rafraîchit d'avance un jeton qui expire sous 30 s.
- Paramètres : `AccountRepository` (`load`, `updateDisplayName`, `updatePersonality`), `ApiAccountRepository` (GET/PATCH `/api/me`), choix du nom (boîte de dialogue) et de la personnalité (feuille de cartes envoyées par le serveur). Les `Fake*` restent pour les tests et le mode maquette.

## Procédure de test pour l'UTILISATEUR (avec son propre compte)
Prérequis : le serveur Next local (`http://localhost:3100`, branche `feat/mobile-bearer`) tourne, et `tamilya_mobile/config/dev.json` existe (non commité).
1. Terminal 1, dossier `tamilya_mobile` : `flutter build web --dart-define-from-file=config/dev.json` (ou `flutter run -d web-server --web-port 8091 --dart-define-from-file=config/dev.json`, démarrage plus lent).
2. Si build : servir `build/web` sur le port 8091 (par exemple `node <serve.js> build/web 8091`, ou tout serveur statique sur 8091).
3. Terminal 2, dossier racine du projet mobile : `node tools/dev-proxy.js` (port 8090 : `/api` vers 3100, le reste vers 8091).
4. Ouvrir `http://localhost:8090` dans Chrome. Taper un message dans le champ de l'accueil, valider : la feuille de connexion s'ouvre. « Continuer avec l'e-mail », saisir e-mail et mot de passe de son compte, « Se connecter » : fondu vers le chat. Un mauvais mot de passe affiche « E-mail ou mot de passe incorrect. ».
5. Menu (tiroir) puis « Paramètres » : le nom et l'e-mail s'affichent (GET `/api/me`). « Profil » change le nom ; « Tamilya » change la personnalité (PATCH). « Se déconnecter » ramène à l'accueil.
6. Recharger la page : la session est restaurée (accueil sauté). Ne pas envoyer de message de chat (branché en C3b : l'envoi reste factice et n'appelle pas l'IA).
Création de compte : par « Créer un compte » dans la feuille (nom, e-mail, commune, adresse, mot de passe, consentement). Attention : cela crée un vrai compte dans la base reliée au serveur local.

## Vérifications effectuées
- `dart format --set-exit-if-changed lib test` : 0 changement ; `flutter analyze` : No issues found ; `flutter test` : 44 tests, All tests passed (aucun appel réseau réel : adaptateur dio factice, dépôts factices).
- Tests ajoutés : intercepteur (Bearer ajouté, absent sans session et vers un autre domaine, 401 puis rafraîchissement puis succès, 401 persistant puis déconnexion, rafraîchissement impossible, `noReplay`, deux 401 simultanés pour un seul rafraîchissement) ; parseur d'erreurs (formes A et B, tous les codes, `Retry-After`, réseau) ; règles d'inscription et validation de configuration ; feuille de connexion (mauvais mot de passe, réseau, e-mail invalide, champs obligatoires de l'inscription, inscription complète avec métadonnées, mot de passe oublié) ; `ApiAccountRepository` (GET, PATCH, erreur typée).
- Vérification réelle (build web avec `config/dev.json`, proxy 8090, Chrome piloté par CDP à 390 x 844) : accueil, saisie, feuille de connexion, e-mail inexistant + mauvais mot de passe : message « E-mail ou mot de passe incorrect. » affiché ; réseau observé : seulement `POST /auth/v1/token` vers Supabase (400) ; AUCUN appel `/api/*` sans session. Aucun compte créé. Capture : `...\scratchpad\shots\app-c3a-erreur.png` (et `app-c3a-2.png`, `app-c3a-3.png`).
- Non vérifié : appareil réel iOS/Android (pas de SDK) ; le stockage sécurisé n'est donc exercé que par ses tests d'existence, pas sur un téléphone ; connexion réussie avec un vrai compte (à faire par l'utilisateur) ; `GET/PATCH /api/me` contre le vrai serveur (testés avec doubles seulement).

## Écarts avec ARCHITECTURE.md
- Pas de `secure_local_storage` sur le web : le navigateur garde son stockage (localStorage) ; à documenter côté sécurité, accepté pour le développement.
- Pas de `freezed`, toujours (C2). `AuthFailure`, `ApiFailure`... sont de simples classes scellées.
- `emailRedirectTo` / `redirectTo` non fournis : les liens des e-mails (confirmation, réinitialisation) ouvrent le site web (Site URL de Supabase), pas l'app. Les liens profonds (App Links) et l'écran « nouveau mot de passe » dans l'app restent à faire (hors C3a).
- Pas de suggestion de correction d'e-mail ni de refus des adresses jetables (présents sur le web, `signup.ts`) : le serveur reste juge. À reprendre si voulu.
- `sessionProvider` vit dans `features/auth` ; `settings` n'en dépend pas (le routeur invalide le compte à la déconnexion), pour respecter « une feature n'importe jamais une autre ».

## Points que l'agent Sécurité doit relire
1. `core/network/auth_interceptor.dart` : domaine du Bearer (`host` + `port` de `API_BASE_URL` uniquement), rejeu limité à un essai, absence de rejeu des requêtes `noReplay`, pas de fuite du jeton dans les messages d'erreur.
2. `core/supabase/secure_local_storage.dart` et `core/bootstrap.dart` : options du Keychain (`first_unlock_this_device`), Keystore Android, PKCE ; le web garde le stockage par défaut ; vérifier `android:allowBackup` (à traiter avec C3 natif) et l'effacement à la déconnexion.
3. `features/auth/data/supabase_auth_repository.dart` : aucune énumération de comptes (inscription et réinitialisation), pas de journalisation de l'e-mail ni du mot de passe, `AuthException` sans code traitée comme une panne réseau.
4. `Env.validate` : http toléré seulement vers `localhost` / `127.0.0.1` ; vérifier qu'une build de production ne peut pas être configurée en clair.
5. `core/router/app_router.dart` : routes `/recette/*` actives seulement si `FORCE_THEME` est défini (outil de recette) ; elles ouvrent une session factice : à retirer ou à protéger avant publication.
6. Clé publishable : seule valeur Supabase dans le binaire ; `config/dev.json` est ignoré par git (vérifier `.gitignore`).

## Non résolu / reste pour la suite
- C3b : chat réel (flux NDJSON, annulation, `noReplay`), lecture Supabase des conversations. C3c : suppression de compte (DELETE `/api/me`), « nouveau mot de passe », liens profonds, `password-notice`.
- Les dépôts du chat et des conversations sont encore factices : le chat ne contacte ni l'IA ni la base.
- Valeur de `maxUserMessageChars` toujours figée à 4 000 côté app.
