# Agent 2 Flutter — Mission C2 : squelette de l'application
Branche `feat/c2-squelette`. Projet : `tamilya_mobile/`.

## Résumé
- Projet Flutter créé (Android, iOS, web), arborescence d'ARCHITECTURE §2, thème clair/sombre sur les tokens de 03-uiux, navigation go_router, composants de base, dépôts factices, flags.
- Navigation : splash, connexion (statique), chat plein écran avec tiroir, paramètres, pages légales. Retour Android géré par `PopScope`.
- `flutter analyze` : aucun problème. `flutter test` : 4 tests verts. `flutter build web` : réussi.
- Geist non embarquée (voir écarts). Aucun appel réseau.

## Constats
- Identifiant d'application : `yt.tamilya.app` (définitif, voir Corrections post-revue).
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

## Corrections post-revue
Appliquées d'après `docs/missions/C2-revue-uiux.md` (hors « reste pour C3 » et police Geist).
- P0 : composer dans `SafeArea(top: false)` ; bouton d'envoi 48 x 48 dp.
- P1 : compteur « n / 4000 caractères » dès 80 % (`lib/core/config/limits.dart`), rouge au-delà, envoi bloqué au-delà de 4000 ; « Réessayer » branché sur `ChatController.retry()` (retire la réponse en échec et renvoie le dernier message, action explicite) uniquement sur le dernier message ; bulle utilisateur = mélange 11 % de l'accent sur le fond (`TamilyaPalette.userBubble`, sombre #27171e).
- P2 : fond du composer `bg`, bordure mélangée 30 % (`composerBorder`) ; `onDanger` ajouté à la palette ; fermeture du clavier au glissement ; curseur de streaming exclu de la lecture d'écran (pendant le streaming le texte n'est plus sélectionnable).
- Tests ajoutés : bouton >= 48 dp, compteur à 80 % et blocage à 4001, « Réessayer » appelé, `retry()` du contrôleur. Résultats : `flutter analyze` : No issues found ; `flutter test` : 8 tests, All tests passed ; `flutter build web` : réussi.
- Identifiant définitif `yt.tamilya.app` (décision utilisateur), commit séparé : Android `namespace` et `applicationId` (build.gradle.kts), `MainActivity.kt` déplacé vers `kotlin/yt/tamilya/app/` avec son `package` ; iOS `PRODUCT_BUNDLE_IDENTIFIER` = `yt.tamilya.app` (Runner) et `yt.tamilya.app.RunnerTests`. Nom du paquet Dart `tamilya_mobile` inchangé. Nom affiché corrigé en « Tamilya » : `android:label`, `CFBundleDisplayName`, `CFBundleName`, plus titre et manifest web. `git grep` : plus aucune occurrence de `yt.tamilya.tamilya_mobile` ni de `tamilyaMobile`.
- Note : le commit de corrections a embarqué par erreur `PROJECT_CONTROL.md`, `TOKEN_BUDGET.md` (modifiés par l'orchestrateur) et `docs/missions/C2-revue-uiux.md` via `git add -A` ; contenu inchangé, à savoir pour la revue.

## C2b — Fidélité visuelle (branche `feat/c2b-fidelite`)
Source : `docs/missions/C2b-spec-visuelle.md`. Boucle de vérification faite : build web, serveur local, captures Chrome headless 390 x 844, comparaison avec `web-*.png` (accueil : 4 itérations).
- **Écrans refaits** : accueil visiteur (fond lagon parsé depuis `lagon.svg` en `Path` en cache + `CustomPainter`, orbe vivant `AwaOrb`, titre Geist 650 avec « shimaoré » en dégradé animé et souligné ondulé, sous-titre machine à écrire, saisie pilule qui s'allonge, barre du haut floutée avec logo + badge AI, bandeau d'annonce, apparitions décalées 0/120/200/280 ms) ; feuille de connexion du bas (icône, « Bienvenue chez BTM AI », encadré de motif, bouton e-mail, vue formulaire) ; chat vide (halo, filet, lagon persona, orbe, Bonjour/Bonsoir, carrousel de suggestions) ; messages (avatar 32 dp, espacement 40, bulle 88 %) ; composer (fond `bg`, indices tournants) ; splash (« b » crème 14 % rempli de rose, lueur) ; tiroir, paramètres en cartes, légal (fonds).
- **Premier écran** : `/` = accueil si pas de session ; le texte est gardé, la feuille s'ouvre au premier envoi (motif du web), puis fondu de 560 ms vers le chat qui envoie le message. Session existante (`sessionProvider`) : accueil sauté. L'écran `/login` est supprimé. Session factice locale jusqu'à C3.
- **Police** : Geist variable déclarée (pubspec) et utilisée partout ; graisses via `FontVariation('wght', n)` (`wght()`).
- **Bulle utilisateur** : annulation du P1 « 11 % sombre » : 11 % clair (#f9e7ed), 22 % sombre (#3b1926), idem avatar ; surface de conversation 4 %/7 %, bordure composer 30 %/45 %.
- **Captures finales** (`...\scratchpad\shots\`) : `app-c2b-accueil.png`, `app-c2b-auth.png`, `app-c2b-chat.png`, `app-c2b-splash.png`, `app-c2b-reglages.png` (référence : `web-accueil.png`). Thème sombre forcé par `--dart-define=FORCE_THEME=dark` (outil de recette ; ajoute aussi les routes `/recette/*`, inactives sans ce define). Le clair n'a pas été capturé. Les captures sont coupées à droite (fenêtre Chrome plus large que 390) : artefact connu.
- **Qualité** : `flutter analyze` : No issues found ; `flutter test` : 12 tests, All tests passed (navigation adaptée : splash, accueil, feuille, chat + message envoyé, fermeture de la feuille, tiroir, retour) ; `flutter build web` : réussi.
- **Écarts assumés** : orbe approximé (corps à 8 points + dégradé qui tourne + reflet + halo ; pas de gouttelettes ni de filtre « goo », arc-en-ciel linéaire, non conique) ; pas de filigrane de courbes dans le bouton « Essayer Tamilya » ; flou d'arrière-plan de la feuille non fait (voile noir 55 % seulement) ; boutons Google/Apple masqués par leurs flags (le site les montre) ; lagon de la feuille sans dégradé ; bandeau d'annonce factice (texte constant) ; avatars/suggestions en emoji (nécessitent la police emoji du système) ; le dégradé du mot est le même thème clair et sombre, le clair non vérifié visuellement ; pas de Markdown ni d'actions sur message ; légal/aide : fonds seulement, pas les cartes ni la FAQ ; la capture web peut parfois manquer le lagon et le logo (course de chargement en temps virtuel), refaite jusqu'à obtenir le rendu.
- **Reste** : thème clair à comparer, performance de l'orbe et du lagon à mesurer sur appareil bas de gamme, pages légales/aide fidèles, `PersonaColors` et personnalités, splash natif, bandeau d'annonce via API.
