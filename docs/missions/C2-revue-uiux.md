# C2 — Revue UI/UX du squelette Flutter
Branche `feat/c2-squelette`, projet `tamilya_mobile`. Aucun fichier de code modifié.

## Verdict : APPROUVÉ AVEC RÉSERVES
Tokens fidèles, navigation conforme à l'audit 03 (chat + tiroir, `PopScope`, Entrée = saut de ligne), textes cohérents. Réserves : zone sûre basse du composer, cible tactile 40 dp, compteur de caractères absent, bouton « Réessayer » jamais câblé.

## Vérifications
- `flutter analyze` : aucun problème. `flutter test` : 4/4 passent (navigation, retour ferme le tiroir, Entrée n'envoie pas).
- Contrastes WCAG calculés (seuil AA 4,5:1 texte, 3:1 composants) : fgMuted/bg 6,02 clair, 7,14 sombre ; fgMuted/bgMuted 5,23 / 5,80 ; accentFg/accent 5,33 clair, 6,33 sombre ; accent en texte sur bg 5,33 / 6,31 ; danger/dangerSoft 5,75 / 5,58 ; fg/accentSoft 15,3 / 13,5 ; crème/encre (splash) 15,9. Tout passe AA. `onError` sombre `bg` (#131516) sur danger #f97066 : 6,57, donc acceptable.

## 1. Tokens
`lib/core/theme/tokens.dart:44-82` : les 17 couleurs clair et sombre sont identiques à `globals.css:9-29` et `:32-51` (relecture champ par champ, aucun écart). Marque `ink`/`cream` conformes (tokens.dart:87-88). Rayons 24 / 8 / 25,6 / 12 / 26 / 24 conformes (tokens.dart:93-98). Espacements 4/8/12/16/24 conformes à l'échelle 4 dp. Tiroir 288 conforme (tokens.dart:111).
Écarts :
- `composer.dart:52` `color: p.bgSubtle` -> attendu `p.bg` (web `bg-bg`, Composer.tsx:100). Le champ doit rester blanc/#131516 sur fond de page ; bgSubtle est réservé au tiroir.
- `composer.dart:53` bordure `p.border` -> attendu `Color.lerp(p.border, p.accent, 0.30)` (web `--persona-border`, mélange 30 % persona/border, globals.css:97). Utiliser l'accent clair `#c8295f` par défaut comme persona, dans les deux thèmes (`@property --persona initial-value #c8295f`, globals.css:88-92). P2.
- `composer.dart:103` taille 40 -> 48 (voir §3).
- Ombre composer (`composer.dart:55-62`) conforme (0 8 30 -12, noir 25 %). En thème sombre elle est quasi invisible : acceptable, identique au web.
- `app_theme.dart:259` `labelLarge` 16/w600 sans couleur : OK.
- Police : voir §4.

## 2. Points soulevés par l'agent Flutter
- **Teinte de la bulle utilisateur** (`message_bubble.dart:165`, `accentSoft`) : le web utilise `--persona-soft` = persona 11 % sur le fond. Clair : #f9e7ed (accentSoft #fceaf1, écart imperceptible, OK). Sombre : #27171e attendu contre #3a1626 actuel, nettement plus vif. Correction P1 : définir `userBubble` dans `TamilyaColors` = `Color.lerp(p.bg, const Color(0xFFC8295F), 0.11)` pour les deux thèmes, et l'utiliser aux lignes 165. `PersonaColors` complet (surface 4 %, soft 11 %, border 30 %, text 85 %, glow 11 %) reste à faire en C3 avec les personnalités ; les 3 vues dans personalities.ts n'ont pas de hex, je n'invente rien.
- **`onError` en sombre = `bg`** (`app_theme.dart:156`) : choix valide (contraste 6,57). P2 : le rendre explicite avec un champ `onDanger` dans `TamilyaPalette` (clair `#ffffff`, sombre `#131516`) plutôt qu'une expression `isLight ? : p.bg`.
- **Textes ajoutés** : « Parle shimaoré avec Tamilya » (repris du web GuestLanding.tsx:230, OK), « Écris ton premier message pour commencer. » (ton tutoiement, OK), « Appuie encore pour quitter. » (OK), « Bientôt disponible. » (OK), « Nouvelle conversation », « Historique », « Paramètres », sous-titres de paramètres identiques à SettingsView.tsx:17-23 (OK), « Réessayer » (nouveau, OK). Aucun « Awa » dans lib/. Seul point : `settings_screen.dart` libellé « Tamilya » ok. Rien à changer.
- **Compteur de caractères** : le web en a un. `CHAT_LIMITS.maxUserMessageChars` = 4 000 (`src/lib/chat/limits.ts:7`). Affichage à partir de 80 % (3 200), texte « {n} / {max} caractères » en `bodySmall`, passé en `danger` au-delà de la limite, et envoi bloqué si `n > max` (Composer.tsx:51-52, 120-126). A reprendre à l'identique, voir correction P1-3. Valeur à lire depuis la config (constante dans `core/config`), à valider côté serveur par C3.
- **Splash** : acceptable en C2. Quand on aura l'icône, remplacer par `btm-b.png` crème sur #111111 (brand/btm-b.png, 318x385) ; ne pas afficher le texte « Tamilya » en plus du « b » si le logo le contient déjà (à trancher avec la marque).

## 3. Navigation et ergonomie
Conforme : tiroir 288 (chat_screen.dart:99), `PopScope` avec ordre tiroir -> sortie de conversation -> double retour 2 s (:46-68), `HapticFeedback` à l'envoi iOS (:71-73), AppBar transparent avec icônes de statut adaptées (app_theme.dart:197), `SafeArea` du tiroir (conversations_drawer.dart:193), textes `Semantics` « Tu as écrit : » / « Tamilya a répondu : » (message_bubble.dart:161,201), `TextInputAction.newline` (composer.dart:75).
Écarts :
- **Zone sûre basse absente** : `chat_screen.dart:103-113` met le `Composer` directement dans le body. Sur iPhone (barre d'accueil) et Android en navigation par gestes/edge-to-edge, le champ passe sous la barre. Correction : envelopper le composer dans `SafeArea(top: false, child: Composer(...))`. Le clavier est géré par le `Scaffold` (`resizeToAvoidBottomInset` par défaut) et `SafeArea` n'ajoute alors pas de marge, ce qui reproduit `data-keyboard` du web.
- **Cible tactile 40 dp** : `composer.dart:103` `fixedSize: Size(40, 40)` < 44 pt iOS / 48 dp Android. Le web monte à `size-10` en tactile mais reste à 40 px. Correction : `Size(48, 48)` ; ajuster le padding (`fromLTRB(16, 4, 4, 4)` ok pour contenir 48).
- **Bouton « Réessayer » mort** : `chat_screen.dart:105` passe `onRetry: null`, donc le bouton (message_bubble.dart:231) n'apparaît jamais. Câbler vers `controller.retry`/renvoi du dernier message utilisateur (C3), au minimum l'afficher désactivé en C2 n'a pas de sens : laisser tel quel mais noter P1.
- **Clavier** : ajouter `keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag` à la `ListView.separated` (`chat_screen.dart:139`). P2.
- **Lecteur d'écran** : le curseur `▍` ajouté au texte en streaming (`message_bubble.dart:220`) est lu à voix haute. Le sortir du texte (widget séparé avec `ExcludeSemantics`). P2.
- **Tiroir** : manque l'entrée « Se connecter » pour un visiteur sans compte et le menu compte (le web : Sidebar.tsx:241-264) ; prévu avec l'auth en C3, à noter. Long-press / glisser-supprimer : P2.
- **Thème sombre** : `bg` `#131516`, SystemUiOverlay clair, `snackBar` inversé (app_theme.dart:236) : cohérent. Vérifier en C3 le contraste du `selectedTileColor` du tiroir (`accentSoft` sombre #3a1626 avec `fg` : 13,5, OK).
- Taille de texte système : ne pas fixer de hauteurs en dp sur les textes (aucune vue ici) ; prévoir un test avec `textScaler` 1,5 sur le composer (min 1 ligne, max 6 : OK).

## 4. Police Geist
Geist est sous licence SIL OFL 1.1 (libre d'embarquement). Elle n'est pas dans le dépôt web (importée par `next/font/google`, layout.tsx:2) et le paquet npm `geist` n'est pas installé. Recommandation :
1. Pour C2/C3 : rester sur les polices système (Roboto sur Android, SF sur iOS). C'est acceptable, rien ne bloque, et c'est la convention native.
2. Dès que possible (P2, avant la bêta) : télécharger Geist depuis la distribution officielle de Vercel (dépôt `vercel/geist-font`, fichier variable ou statiques 400/500/600), les placer dans `assets/fonts/` avec le fichier de licence OFL, déclarer la famille dans `pubspec.yaml` (`fonts:` avec `weight: 400/500/600`), puis passer `kFontFamily = 'Geist'` (`app_theme.dart:141`). Pas besoin de nouveau paquet (donc pas `google_fonts`). Ne pas utiliser la graisse de `@vercel/og` (une seule graisse, subset).
3. Si Geist est adoptée, relire les hauteurs de ligne (1.6 corps) car les métriques diffèrent un peu de Roboto.

## Corrections priorisées
**P0**
1. `lib/features/chat/presentation/chat_screen.dart:106` : envelopper `Composer(...)` dans `SafeArea(top: false, ...)`.
2. `lib/features/chat/presentation/composer.dart:103` : `fixedSize: const Size(48, 48)`.
**P1**
3. `composer.dart` : ajouter le compteur : constante `kMaxUserMessageChars = 4000`; `tooLong = text.length > max` bloque l'envoi (`canSend` ligne 93) ; sous le champ, si `length > max * 0.8` afficher `'$n / $max caractères'` (`bodySmall`, couleur `p.danger` si `tooLong`), `maxLength` non utilisé (pour ne pas couper la saisie), `Semantics(liveRegion: true)`.
4. `tokens.dart` / `app_theme.dart` : ajouter `userBubble` = `Color.lerp(p.bg, Color(0xFFC8295F), 0.11)` (clair #f9e7ed, sombre #27171e) dans `TamilyaPalette`/extension ; `message_bubble.dart:165` l'utiliser à la place de `p.accentSoft`.
5. `chat_screen.dart:105` : passer un vrai `onRetry` (renvoyer le dernier message utilisateur) ; test de l'état erreur avec bouton « Réessayer ».
6. Splash : remplacer par `btm-b.png` crème sur #111111 quand les icônes natives arrivent (C3).
**P2**
7. `composer.dart:52` `p.bgSubtle` -> `p.bg` ; `:53` bordure mélangée 30 % accent.
8. `app_theme.dart:156` : `onError: p.onDanger` (champ ajouté : clair #ffffff, sombre #131516).
9. `chat_screen.dart:139` : `keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag`.
10. `message_bubble.dart:220` : curseur `▍` hors du texte, en `ExcludeSemantics`.
11. Geist : voir §4 (procédure d'embarquement).
12. `PersonaColors` (surface 4 %, soft 11 %, border 30 %, text 85 %) avec transition 600 ms, après le relevé des couleurs de personnalités.

## Fichiers modifiés
Aucun (rapport seulement).

## Non résolu / questions pour l'orchestrateur
- Couleurs hex des personnalités : à relever dans le web (`PersonalityContext.personaStyle`) pour C3.
- Valeur de `maxUserMessageChars` à exposer côté API ou à figer (4 000 aujourd'hui, `src/lib/chat/limits.ts:7`).
