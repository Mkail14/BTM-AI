# Agent 2 (Flutter) : mission C3b, chat réel et conversations

Branche `feat/c3b-chat` (depuis `feat/c3a-auth`, 129dfcd). Aucun fichier du dépôt web modifié, aucune requête vers la production ou l'IA, aucun serveur lancé, aucun secret recopié.

## Résumé
- Corrections de la revue sécurité C3a appliquées avec tests : M-2a, M-2b, F-1, F-2, F-3, F-4, F-6(a).
- Chat réel : `POST /api/chat` en flux NDJSON affiché au fil de l'eau, bouton « Arrêter » (annule la requête dio), `noReplay` posé et testé, erreurs typées (quota, réseau, session, « Renvoyer »).
- Conversations : liste du tiroir et historique lus dans Supabase sous RLS, nouvelle conversation, rafraîchissement de la liste.
- `flutter analyze` : No issues found. `flutter test` : 79 tests, tous verts (44 au départ de C3a).

## Commits
1. `2c5f8c3` Env.validate strict en prod, clé secrète refusée, recette hors release (M-2a, M-2b, F-6a)
2. `6dfe055` allowBackup/fullBackupContent désactivés, Keychain purgé à la réinstallation (F-1, F-2)
3. `745dc8f` 401 sur requête noReplay = rafraîchir puis « Renvoyer » ; pas de redirection ; schéma comparé (F-3, F-4)
4. `56d6651` conversations lues dans Supabase, erreurs typées
5. `beaaa48` chat en flux NDJSON, arrêt, erreurs typées, historique Supabase, tiroir branché

## Fichiers modifiés (tous sous `tamilya_mobile/` sauf ce rapport)
Sécurité : `lib/core/config/env.dart` (`validate(env:, web:)`, `recetteEnabled`), `lib/core/router/app_router.dart` (F-6a aux 3 endroits), `android/app/src/main/AndroidManifest.xml`, `lib/core/supabase/secure_local_storage.dart` (`purgeSecureStorageOnFreshInstall`, témoin SharedPreferences), `lib/core/bootstrap.dart`, `pubspec.yaml`/`pubspec.lock` (+ `shared_preferences`), `lib/core/errors/app_failure.dart` (`RetryableAuthFailure`), `lib/core/network/auth_interceptor.dart`, `lib/core/network/api_client.dart`.
Chat : `features/chat/domain/chat_stream_event.dart` (nouveau), `chat_repository.dart`, `data/ndjson_decoder.dart`, `data/api_chat_repository.dart`, `data/supabase_messages_reader.dart` (nouveaux), `data/fake_chat_repository.dart`, `presentation/chat_controller.dart`, `chat_screen.dart`, `message_bubble.dart`, `shared/models/chat_message.dart` (`errorText`, `RetryKind`).
Conversations : `features/conversations/data/supabase_conversations_repository.dart` (nouveau), `presentation/conversations_drawer.dart`, `core/supabase/supabase_failure.dart` (nouveau).
Tests ajoutés : `test/core/config/env_test.dart`, `test/core/supabase/secure_install_test.dart`, `test/features/chat/{ndjson_decoder,api_chat_repository,chat_controller,message_bubble_errors}_test.dart`, `test/features/conversations/supabase_conversations_repository_test.dart` ; modifiés : `auth_interceptor_test.dart`, `widget_test.dart`.

## Détails
- **Flux** : un événement par ligne (`meta`, `delta`, `replace`, `done`, `error`) ; `speech`, `timing`, `learned` et lignes invalides ignorés, comme le décodeur du site. Décodeur robuste aux lignes et caractères coupés entre deux morceaux (testé octet par octet).
- **Nouvelle conversation** : l'identifiant vient de l'événement `meta` et est réutilisé aux envois suivants ; l'écran ne change pas de route (pas de reconstruction pendant le flux ; le tiroir surligne la conversation courante).
- **Arrêt** : annuler l'abonnement annule le `CancelToken` dio ; le texte reçu est gardé, marqué « Réponse interrompue ».
- **Erreurs** : corps d'erreur lu même en réponse flux ; `rate_limited`, `signup_required`, `invalid_request`, `not_found`, `refusal` sans bouton ; `conversation_too_long` bloque le composer ; réseau, délai, fournisseur : « Réessayer » ; 401 après rafraîchissement réussi : « Renvoyer » ; rafraîchissement impossible : déconnexion (le routeur ramène à l'accueil).
- **Liste** : rechargée à l'ouverture du tiroir, à la fin d'une réponse et 5 s après (titre IA) ; vidée, avec les contrôleurs de chat, à chaque changement de session.

## Vérifications effectuées
- `flutter analyze` : « No issues found ». `flutter test` : « All tests passed » (79).
- Tests clés : `noReplay` présent dans `extra` du POST (`api_chat_repository_test`) ; 401 sans rejeu, un seul rafraîchissement ; annulation propagée à l'adaptateur ; Env.validate (prod : web, http, localhost, clé non publishable, `sb_secret_`) ; purge du coffre une seule fois.
- Tout est testé avec faux adaptateurs et flux simulés. Non vérifié : appareil réel, vrai flux du serveur, vraie lecture RLS.

## Écarts avec ARCHITECTURE.md
- Pas de limitation à ~30 images/s des deltas : chaque delta met l'état à jour (les deltas du serveur sont des phrases ou groupes de mots). À revoir si la fluidité pose problème.
- Pas de rechargement automatique de l'historique au retour du réseau après une coupure (§6, point 2) : l'utilisateur utilise « Réessayer ». Pas de rechargement de la liste au retour au premier plan : remplacé par le rechargement à l'ouverture du tiroir.
- Mode invité, import de conversation, suppression de conversation : hors périmètre.
- Fichiers : `ChatStreamEvent` et son décodeur sont dans `features/chat/` (pas `core/network/`), car seul le chat les utilise.
- Mon environnement mélange fins de ligne LF/CRLF ; git normalise (avertissements sans effet).

## Questions pour l'orchestrateur
1. F-6(b) : retirer les routes `/recette/*` et `_RecetteAuth` avant la bêta, toujours à planifier (C3c ou avant C4).
2. Le serveur renvoie-t-il bien `401 unauthorized` pour un Bearer présent mais invalide sur `/api/chat` (exigence C1, ARCHITECTURE §5) ? Sans cela, un jeton expiré consommerait l'essai invité. Non vérifiable sans appel réel.
3. `shared_preferences` ajouté comme dépendance (témoin de première installation, F-2) : à valider.
4. Le titre généré par l'IA arrive après `done` : le délai de 5 s est repris du site ; à confirmer en usage réel.

## Procédure de test manuelle (utilisateur)
Prérequis : `config/dev.json` (ignoré par git) pointant sur un projet Supabase et une clé IA de TEST, jamais la production ; proxy de dev lancé par vous (`tools/dev-proxy.js`, port 8090, local seulement).
1. Lancer l'app avec `--dart-define-from-file=config/dev.json`, se connecter avec un compte de test.
2. Écrire un message : la réponse s'affiche progressivement ; le bouton d'envoi devient « Arrêter ». Appuyer dessus en cours de réponse : le texte reçu reste avec « Réponse interrompue. ».
3. Ouvrir le tiroir : la nouvelle conversation figure dans l'historique (titre définitif ~5 s après). Envoyer un second message : il reste dans la même conversation.
4. Toucher une conversation du tiroir : ses messages se chargent (spinner puis liste). « + » ouvre une conversation vide.
5. Couper le Wi-Fi puis envoyer : message « Vérifie ta connexion internet. » et « Réessayer » ; le rétablir et réessayer.
6. Épuiser le quota de test (ou le limiter côté serveur de test) : message de limite, sans bouton.
7. Déconnexion puis connexion avec un autre compte : la liste du tiroir ne montre que ses conversations.
8. Android : `adb shell bmgr` / installation : pas de sauvegarde de l'app ; iOS : désinstaller puis réinstaller, l'app demande de se reconnecter.
