# Agent 2 Flutter — Mission C2 : squelette de l'application
Branche `feat/c2-squelette`. Projet : `tamilya_mobile/`.

## Résumé
- Projet Flutter créé (Android, iOS, web), arborescence d'ARCHITECTURE §2, thème clair/sombre sur les tokens de 03-uiux, navigation go_router, composants de base, dépôts factices, flags.
- Navigation : splash, connexion (statique), chat plein écran avec tiroir, paramètres, pages légales. Retour Android géré par `PopScope`.
- `flutter analyze` : aucun problème. `flutter test` : 4 tests verts. `flutter build web` : réussi.
- Geist non embarquée (voir écarts). Aucun appel réseau.

## Constats
- Identifiant `yt.tamilya.tamilya_mobile` (flutter create --org yt.tamilya) : **provisoire**, à confirmer avant tout store/signature/App Links.
- Geist : aucun paquet `geist` dans `node_modules` du dépôt web. Seuls fichiers trouvés : `next/dist/compiled/@vercel/og/Geist-Regular.ttf` (une seule graisse, Regular) et des `.woff2` des devtools Next (non utilisables par Flutter). Les LICENSE voisines sont celles de Next (MIT) et de satori (MPL-2.0), pas celle de la police. Licence de Geist non confirmée localement (l'architecture dit « OFL, à confirmer ») : **non embarquée**. Police système en C2 (`kFontFamily = null` dans `lib/core/theme/app_theme.dart`).
- Icône : `assets/brand/icone-maskable-512.png` copiée ; `icone-1024-PROVISOIRE.png` produite par agrandissement HighQualityBicubic (PNG, fond non vérifié opaque : iOS exige un 1024 opaque, à refaire à partir d'une source vectorielle). Icônes natives et splash natif non générés.

## Décisions / réalisations
Commits (tous signés Co-Authored-By Claude Opus 5.5) :
1. `d60b75e` création du projet, sources d'icône, `.gitignore` (env/*.json hors `example.json`)
2. `19cc427` thème, config `Env`, flags, `AppFailure`
3. `fd925ed` widgets partagés, bulle, composer
4. `74f838b` routeur, écrans, tiroir, dépôts factices
5. `45f1d64` tests

Paquets (versions réelles résolues) : `flutter_riverpod 3.4.3` (riverpod 3.4.3), `go_router 18.1.3`, `flutter_lints 6.0.0` (dev, fourni par flutter create), `flutter_localizations` (SDK, locale `fr`), `cupertino_icons 1.0.9`.
**Reportés à C3** (inutiles à la compilation des interfaces C2) : supabase_flutter, dio, flutter_secure_storage, url_launcher, connectivity_plus, freezed/json_serializable, riverpod_generator/build_runner, rendu Markdown, flutter_native_splash, flutter_launcher_icons, mocktail.

Arborescence : `lib/core/{config,theme,router,errors}`, `lib/shared/{widgets,models}`, `lib/features/{auth,chat,conversations,settings,legal}`, `features/connect/README.md` (une ligne).
Interfaces de repository (implémentations `Fake*`, providers surchargeables) : `AuthRepository`, `ChatRepository` (`history`, `sendMessage` renvoyant un `Stream<String>` de deltas), `ConversationsRepository` (`list`), `AccountRepository` (`profile`).
Flags : `FEATURE_GUEST_MODE`, `FEATURE_GOOGLE_SIGNIN`, `FEATURE_APPLE_SIGNIN`, tous `false`. Seuls les boutons Google/Apple de la connexion les testent.
Composants : `MessageBubble` (user/assistant ; complete, streaming, interrupted, error + « Réessayer »), `Composer` (Entrée = saut de ligne, envoi par bouton, bouton Arrêter pendant la génération), `PrimaryButton` (plein/contour/danger/chargement), `AppTextField`, `EmptyState`, `TypingIndicator` (« Tamilya écrit… », respecte `disableAnimations`).
Retour Android : tiroir ouvert, le retour le ferme ; conversation ouverte, retour vers nouvelle conversation ; racine, double retour en 2 s pour quitter. SafeArea et clavier via le `Scaffold` (resize + SafeArea).

## Fichiers modifiés
Tout sous `tamilya_mobile/` plus `.gitignore` (racine) et ce document. Dépôt web : non touché (lecture seule de l'icône).

## Vérifications effectuées
- `flutter analyze` : `No issues found!`
- `dart format --set-exit-if-changed lib test` : 0 fichier modifié.
- `flutter test` : `All tests passed!` (4 tests : construction du thème, navigation splash > connexion > chat > tiroir > paramètres, retour système ferme le tiroir, Entrée n'envoie pas).
- `flutter build web` : `✓ Built build\web` (95,9 s).
- Non vérifiés : compilation Android/iOS (pas de SDK), rendu sur appareil.

## Écarts avec ARCHITECTURE.md (justifiés)
- Pas de `freezed` : entités en classes immuables simples, pour ne pas ajouter build_runner et ses paquets en C2. À reprendre en C3.
- `ChatMessage` est dans `shared/models/` et non dans `chat/domain/` : sinon `conversations` aurait dépendu de `chat`. L'historique d'une conversation est lu via `ChatRepository.history` (chat), `ConversationsRepository` ne gère que la liste.
- `ChatScreen` reçoit son tiroir par `drawerBuilder`, fourni par le routeur : respecte « une feature n'importe jamais une autre » (le routeur est l'exception prévue).
- Fichiers `*_providers.dart` dans `presentation/` (providers de repository), `chat_controller.dart` contient aussi le provider de dépôt.
- `l10n/app_fr.arb`, `core/supabase`, `core/network`, `core/streaming`, `auth_guard`, `deep_links`, `logger` : non créés (C3). Textes en dur en français pour l'instant.
- `LegalScreen` : emplacement de texte, pas encore d'ouverture navigateur (url_launcher reporté).
- Écran `/signup`, `/reset` absents : boutons « Créer un compte » et « Mot de passe oublié ? » affichent « Bientôt disponible. ».

## Non résolu / questions pour l'orchestrateur
- Fichiers Geist à obtenir avec leur licence (OFL attendue) ; sinon valider la police système.
- Identifiant d'application définitif, flavors dev/preprod/prod.
- Source d'icône : 1024 opaque et vectoriel à fournir par la marque.

## À faire valider par l'agent UI/UX
- Teinte de la bulle utilisateur (`accentSoft`) et ombre du composer ; `onError` en sombre (`bg`, non défini dans les tokens) ; couleur `PersonaColors` non implémentée (personnalités non chiffrées).
- Absence de limite/compteur de caractères dans le composer (valeur serveur `maxUserMessageChars` à reprendre en C3).
- Textes ajoutés par moi : « Parle shimaoré avec Tamilya » / « Écris ton premier message pour commencer. » (état vide), « Appuie encore pour quitter. », « Bientôt disponible. », sous-titres des entrées légales.
- Splash : Flutter affiche logo + « Tamilya » crème sur #111111, le « b » `btm-b.png` n'a pas été copié.

## Dépendances / reste pour C3
Auth Supabase + stockage sécurisé, dio + intercepteur, décodeur NDJSON et `ChatController` réel (annulation, erreurs, retry), lecture Supabase des conversations, `/api/me`, garde de routes et deep links, `Env` validé au démarrage, Markdown, freezed, l10n, url_launcher, icônes et splash natifs, tests de couche data.
