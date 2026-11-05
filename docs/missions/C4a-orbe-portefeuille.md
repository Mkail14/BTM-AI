# Agent 2 (Flutter) : mission C4a, écran rouge, mot de passe, orbe, portefeuille

Branche `feat/c4a-orbe-portefeuille` (depuis `feat/c3b-chat`, 3a7c426). Dépôt web non modifié, aucun appel réseau réel, aucun serveur ni émulateur lancé, aucun secret recopié.

## Résumé (points ajoutés par l'orchestrateur en tête)
1. **Écran rouge `_dependents.isEmpty` : cause NON identifiée avec certitude.** Je n'ai pas pu le reproduire (voir Constats). J'ai supprimé la seule famille de risque trouvée dans notre code (BuildContext capturé dans les callbacks du routeur) et ajouté un test de parcours AVEC animations. À revérifier sur la tablette ; si l'écran rouge revient, il me faut la pile complète.
2. **Œil afficher/masquer le mot de passe** : fait (champ de connexion/inscription ; il n'existe pas d'écran « nouveau mot de passe » dans l'app), avec tests.
3. **Orbe** reconstruit d'après `AwaBlob.tsx` + `.awa-blob*` : repos sobre, couleurs vives seulement au battement.
4. **Portefeuille** en lecture, recharge par le navigateur du système.
- `flutter analyze` : No issues found. `flutter test` : 101 tests, tous verts (79 au départ).

## Commits
1. `7da7c3a` feat(orbe) : globe fidèle à AwaBlob
2. `19a3134` fix(nav) : navigation par l'instance du routeur + test de parcours
3. `37339d9` feat(auth) : bouton afficher/masquer le mot de passe
4. `c6b38d1` feat(portefeuille) : écran Portefeuille

## Constats

### 1. Écran rouge `_dependents.isEmpty`
- L'assertion est dans `InheritedElement.debugDeactivated` (`framework.dart:6281` du SDK local) : un InheritedWidget est retiré de l'arbre alors qu'un widget encore actif en dépend. Elle est propre au mode debug.
- Recherche dans notre code : une seule `GlobalKey` (`_scaffoldKey` d'`ChatScreen`, une par State, pas de réutilisation), pas d'`OverlayEntry`, pas d'InheritedWidget maison, aucun `Theme.of`/`MediaQuery.of` dans un `dispose`. Les contextes utilisés après `await` sont gardés par `mounted` (auth_forms, settings).
- Seul défaut structurel trouvé : `app_router.dart` appelait `context.go/push` avec le `BuildContext` de la fonction `builder` de la route, capturé dans des closures vivant plus longtemps que la page (chat, tiroir, paramètres, splash). Une recherche d'ancêtre (`GoRouter.of`) sur un contexte de page déjà remplacée est exactement la classe de bug décrite. Corrigé : toutes les navigations passent par l'instance du `GoRouter` (`router.go/push`), `app_router.dart`.
- Test `test/navigation_journey_test.dart` : parcours complet AVEC animations (le globe tourne, `pump` par pas de 50 ms), tablette 800x1280, clavier simulé : feuille de connexion ouverte, fermée, rouverte, connexion (la session change avant la fermeture de la feuille), tiroir, changement de conversation x2, paramètres (+ snackbar « Bientôt disponible ») et retour x2, déconnexion, nouvelle connexion. Il passe, **avant comme après** ma correction : je n'ai donc pas reproduit l'écran rouge en test. Je ne peux pas affirmer que la correction l'élimine.
- Pistes restantes si ça revient (non vérifiées) : `LayoutBuilder` de `_EmptyChat` / accueil reconstruit pendant un changement de route ; fondu `AnimatedSwitcher` de 560 ms accueil -> chat qui se superpose à la fermeture de la feuille ; `ScaffoldMessenger` qui déplace un SnackBar entre deux Scaffold. Besoin : la pile de l'erreur (`flutter run` ou `adb logcat`).

### 2. Mot de passe
- Site : `src/components/ui/PasswordInput.tsx` : bouton œil (IconEye/IconEyeOff), libellés « Afficher le mot de passe » / « Masquer le mot de passe », `aria-pressed`, titre identique.
- App : `lib/shared/widgets/app_text_field.dart` (tout champ `obscureText`), icône `visibility_outlined` / `visibility_off_outlined`, `tooltip` = libellé du site (lu par TalkBack), zone tactile 48 dp. Test `test/shared/password_toggle_test.dart`.

### 3. Orbe : correspondance site -> app
Le globe d'accueil du site est `AwaBlob` (classes `.awa-blob*`). Les classes `.voice-orb*`, `.awa-hello` (avec noyau, anneaux, `orb-spin`, `orb-breathe`) ne sont plus utilisées par aucun composant (`grep` dans `src/**/*.tsx` : seules `awa-hello-rise` et `awa-float` servent encore) : je ne les ai pas reproduites. La version précédente de l'app s'inspirait mal du site (bruit sinusoïdal, arc-en-ciel à 50 % en continu, flottement permanent).

| Élément | Valeur du site | Valeur dans l'app |
|---|---|---|
| Couleurs au repos | `--rainbow` = 0 entre deux battements, `AwaBlob.tsx:138-142` | `OrbSim.rainbow` : 0 hors battement (reste ~0,04 jusqu'à 700 ms comme le site) |
| Allumage des couleurs | `clamp(heart*1.2, 0, 1)`, `AwaBlob.tsx:138` | identique, `awa_orb_sim.dart` |
| Dégradé conique | `conic-gradient(from turn, blob, #9b72cb, #4285f4, #34a853, #fbbc05, #ea4335, blob)`, `globals.css:2210` | `SweepGradient` aux mêmes couleurs, départ à midi (angle - 90 deg), sur le corps et chaque gouttelette |
| Rotation des couleurs | +70..150 deg par battement, +120 deg/s x vitesse, `AwaBlob.tsx:98,141` | identique |
| Battement | 2 coups : fort (0,85-1) puis +230-270 ms à 0,6-0,75 ; période 1050-1250 ms (650-750 en réflexion), `AwaBlob.tsx:128-133` | identique |
| Courbe du cœur | attaque 90 ms linéaire, puis `exp(-(d-90)/180)`, retombée à 700 ms, `AwaBlob.tsx:134-138` | identique |
| Taille | `1 + heart*0.07 + voice*0.2 (+ bruit en réflexion)`, `AwaBlob.tsx:155-157` | identique (scale x/y) |
| Dérive et inclinaison | `noise*5 %` (+ sursaut), `tilt = noise*8`, `AwaBlob.tsx:149-152` | identique, en % de la taille |
| Sursaut | tous les 2,5-7 s, amplitude `sin(.. )*exp(-jd*3.2)` sur 1,2 s, `AwaBlob.tsx:140-147` | identique |
| Forme du corps | 8 rayons `clamp(50 + noise*(14+voice*10+4), 28, 72)`, `AwaBlob.tsx:171-172` | `RRect` à 8 rayons elliptiques (même ordre CSS), rotation du corps `noise*55 deg/s` |
| Taille du corps | `inset: 20 %` de la boîte goo (`inset: -12 %`), `globals.css:2157,2163` | 0,6 x 1,24 x taille |
| Fond du corps | `radial(32 % 28 %, light -> transparent 45 %)`, `radial(70 % 75 %, deep -> transparent 60 %)`, blob, `globals.css:2164-2167` | mêmes foyers et arrêts (rayon farthest-corner), mêmes couches |
| light / deep | `color-mix(blob 55 %, #ffe3ef)`, `color-mix(blob 70 %, #2a0614)`, `globals.css:2117-2118` | `Color.lerp` identiques |
| Gouttelettes | 3, tailles 26/20/16 %, `rotate translateX(55+noise*75 %) scale`, vitesse +-25..70 deg/s, `AwaBlob.tsx:178-184` | identique ; dégradé `circle at 35 % 30%, light -> blob 70 %` |
| Filtre goo | `feGaussianBlur 7` + `feColorMatrix 0 0 0 24 -10`, `AwaBlob.tsx:250-253` | `saveLayer` avec `ImageFilter.compose(blur, ColorFilter.matrix(alpha x24, -10))` ; écart-type 7 px pour 136 dp, proportionnel à la taille |
| Halo | `inset -18 %`, `radial(blob 55 %, transparent 65 %)`, opacité `0,5+heart*0,35+voice*0,5`, échelle `0,95+heart*0,12+voice*0,3`, `globals.css:2137-2144`, `AwaBlob.tsx:187-190` | identique (sans le flou 14 px : invisible sur un dégradé déjà doux) |
| Reflet | 26 x 18 % à (27 %, 24 %), ellipse blanche .85 -> 0 à 70 %, `rotate -30deg`, flou 1,5 px, glisse de noise*8/6 %, `globals.css:2216-2227` | identique |
| Cadence | 30 images/s si ça bouge (cœur, voix, sursaut, réflexion, battement à moins de 120 ms), 20 au repos, marge 4 ms, `AwaBlob.tsx:7-9,111,185` | identique : un `Ticker` filtré, repeint à 20/30 Hz seulement |
| Pause | seulement visible à l'écran et onglet visible, `AwaBlob.tsx:193-204` | le `Ticker` se coupe avec `TickerMode` (route masquée) et aucun cadre n'est produit en arrière-plan |
| Flottement | `awa-float` 6 s, 0 -> -8 px, **uniquement** dans le mode vocal (`.voice-overlay[data-morph] .awa-blob`, `globals.css:3228`) ; en `data-live` l'animation de l'accueil est remplacée, `globals.css:2262` | `float: false` par défaut (l'ancien orbe flottait en permanence : retiré), `float: true` pour le mode vocal |
| Animations réduites | boucle non lancée, `AwaBlob.tsx:62`, `globals.css:2403-2412` | `MediaQuery.disableAnimations` : pas de Ticker, pose fixe (rayons 42/58/63/37/41/44/56/59, halo opacité 1, couleurs éteintes) |
| Vitesse | speaking 1,9 ; réflexion 2,4 ; listening 1,4 ; sinon 1, `AwaBlob.tsx:120` | identique |

API prévue pour la mission voix (aucune voix écrite) : `AwaOrb(voiceState: OrbVoiceState.off | listening | waiting | speaking, voiceLevel: ValueListenable<double>?, busy, float, color, goo)`. `waiting` = `busy` du site. `voiceLevel` est lu à chaque image (équivalent de `voiceLevel()` de `voice-level.ts`, à fournir par la mission voix).
Non reproduit : l'animation du clic (écrasement, ondes, flash : `awa-blob-pop`, `-ripple`, `-flash`), le survol, `awa-hello-in` (l'accueil de l'app garde sa propre entrée), la morphose vers le mode vocal. Le globe de l'accueil n'est pas cliquable dans l'app (comme avant).
Fichiers : `lib/shared/widgets/awa_orb.dart` (widget + peintre), `awa_orb_sim.dart` (simulation, sans Flutter), `test/shared/awa_orb_test.dart` (battement, couleurs éteintes entre deux coups, rythme en réflexion, bornes, cadence, pose fixe, pas de Ticker en animations réduites).
Remarque performance : un `saveLayer` avec flou gaussien par image (30 Hz max). Non mesuré sur la tablette (pas d'appareil).

### 4. Portefeuille
- Site : `src/app/portefeuille/page.tsx`, `WalletView.tsx`, `src/app/api/wallet/route.ts` (worktree bearer).
- **Solde** : `GET /api/wallet` renvoie `{balanceCents, demo?}` ; 401 `{error:"Non connecté."}` ; 503 `{error:"Portefeuille indisponible."}`. Accepté avec Bearer (`getAuthContext` -> `resolveAuthContext`, `identity.ts:36-62`). Client dio existant.
- **Historique : aucune route API.** La page serveur appelle `loadWallet` (`src/lib/wallet/index.ts:10`). Lecture directe de `wallet_transactions` dans Supabase, sous RLS `wallet_transactions_select_own` (migration `20261111000000_wallets.sql`), 50 dernières lignes, **filtrée par `user_id`** car la politique `wallet_transactions_admin_read` ferait voir toutes les lignes à un administrateur. Aucune modification serveur.
- **Mode démo** (`usesDemoWallet`) : le solde fictif vient de l'API (`demo: true`, badge « Démo »), mais ses opérations sont stockées côté serveur/navigateur (`readDemoWallet`) sans route : l'écran l'indique au lieu d'afficher un historique faux.
- Écran (`features/wallet/`) : carte solde (montant en grand, centimes discrets, jauge de plafond 150 €, « Encore X possible »), « Recharger mon portefeuille » (désactivé au plafond, « Ton solde est au plafond. ») et « Payer avec Tamilya » (retour à la conversation), activité avec filtres Tout / Recharges / Dépenses, résumé du mois, groupes par jour en heure de Mayotte (Aujourd'hui / Hier / date), états En attente / Échouée, état vide (deux variantes), erreur du solde (message typé + Réessayer), erreur d'historique seule (solde gardé), tirer pour rafraîchir, relecture au retour du navigateur (`AppLifecycleListener.onResume`).
- **Aucun paiement dans l'app** : « Recharger » ouvre `API_BASE_URL/portefeuille` avec `url_launcher` en `LaunchMode.externalApplication`, jamais de WebView. Échec d'ouverture : message.
- Accès : ligne « Portefeuille » dans le tiroir (au-dessus de Paramètres) et tuile dans Paramètres > Compte ; route `/wallet` (session obligatoire par le garde). Le provider est vidé à chaque changement de session.
- `url_launcher ^6.3.3` ajouté en dépendance directe (il était déjà dans `pubspec.lock`, transitif via supabase_flutter ; version inchangée).
- `FutureProvider` du portefeuille : `retry: null` (Riverpod 3 relance sinon les erreurs en boucle avec délai, l'écran restait en chargement).
- Tests `test/features/wallet/wallet_test.dart` (14) : formatage des euros, solde + Bearer, démo, historique en erreur, 503, corps invalide, lignes illisibles ignorées, écran (historique, filtres, vide, ouverture du site, échec d'ouverture, plafond, erreurs).

## Fichiers modifiés
Orbe : `lib/shared/widgets/awa_orb.dart`, `awa_orb_sim.dart` (nouveau), `test/shared/awa_orb_test.dart`.
Navigation : `lib/core/router/app_router.dart`, `test/navigation_journey_test.dart`.
Mot de passe : `lib/shared/widgets/app_text_field.dart`, `test/shared/password_toggle_test.dart`.
Portefeuille : `lib/features/wallet/**` (nouveau), `lib/core/bootstrap.dart`, `lib/core/router/app_router.dart` (route et callbacks), `lib/features/settings/presentation/settings_screen.dart` (paramètre `onOpenWallet`), `lib/features/conversations/presentation/conversations_drawer.dart` (`onWallet`), `pubspec.yaml`, `pubspec.lock`, `test/features/wallet/wallet_test.dart`.

## Vérifications effectuées
- `flutter analyze` : « No issues found ». `flutter test` : 101 tests, « All tests passed ».
- Non vérifié : rendu réel du globe sur la tablette (formes, fluidité, coût du flou), appel réel à `/api/wallet`, lecture RLS réelle de `wallet_transactions`, ouverture réelle du navigateur, et l'écran rouge.

## Non résolu / questions pour l'orchestrateur
1. **Écran rouge** : cause non confirmée. Si le problème persiste après ce build, fournir la pile (`flutter run` + copie de la console, ou `adb logcat -s flutter`).
2. **Historique du portefeuille sans route API** (Server Component seulement). Je lis la table sous RLS. À valider : cela expose-t-il quelque chose à ne pas lire hors du site ? Pour le mode démo, il faudrait une route `GET /api/wallet/transactions` (modification serveur, non faite). À décider.
3. `/portefeuille` sur le site exige une session par cookie : le navigateur du système n'est pas connecté avec le Bearer de l'app, l'utilisateur devra se connecter sur le site pour recharger. Acceptable, ou prévoir un lien magique serveur ?
4. Le globe d'accueil n'est pas cliquable dans l'app (le site ouvre la voix ou la saisie, avec animation de clic) : à traiter avec la mission voix.
5. Riverpod 3 relance automatiquement les `FutureProvider` en erreur (conversations, compte) : même effet « chargement sans fin » possible, à traiter hors mission.
6. Mon environnement mélange LF/CRLF ; git avertit sans effet.
