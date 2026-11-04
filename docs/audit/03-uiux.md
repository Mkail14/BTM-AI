# Agent 3 UI/UX — Audit identité visuelle et parcours (Tamilya Mobile)
Dépôt web lu en lecture seule. Chemins relatifs à `BTM - Batir la Technologie de Mayotte`.

## Résumé
- Marque « BTM AI » (assistante **Tamilya**), accent rose framboise `#c8295f`, neutres chauds, police Geist. Thème clair/sombre par variables CSS : transposition directe en `ThemeData`.
- Le web a déjà un vrai travail mobile (tiroir + bouton retour, clavier via visualViewport, safe-areas, cibles tactiles 40px, bottom sheets) à reproduire nativement.
- Navigation mobile recommandée : écran Chat plein écran + tiroir latéral (historique), pas de barre d'onglets (voir §3).
- Couleurs des personnalités non chiffrées dans `personalities.ts` (seulement label/emoji) : `--persona` est posé via `personaStyle` (PersonalityContext), non relevé.

## Constats

### 1. Design tokens
Source : `src/app/globals.css:9-29` (clair), `:32-51` (sombre), `@theme inline` `:53-73`. Sombre piloté par `<html data-theme>` (`:7`, `:79`), choix utilisateur + réglage appareil (`src/components/ui/ThemeScript.tsx`, `Theme.tsx:12-55`).

| Token | Clair | Sombre |
|---|---|---|
| bg | #ffffff | #131516 |
| bgSubtle | #f7f7f5 | #1a1d1e |
| bgMuted | #efefec | #24282a |
| fg | #16191b | #ecedee |
| fgMuted | #5d6468 | #9ba3a7 |
| border | #e3e3df | #2d3234 |
| accent | #c8295f | #f06a9b |
| accentHover | #a91f4f | #f58bb2 |
| accentFg | #ffffff | #2a0815 |
| accentSoft | #fceaf1 | #3a1626 |
| danger / soft | #b42318 / #fdecea | #f97066 / #3a1b18 |
| warning / soft | #b45309 / #fff6e0 | #f5b84a / #352c14 |
| success / soft | #15803d / #e8f6ed | #4ccb7a / #14301f |
| focus | #c8295f | #f58bb2 |
| chart1 | #c8295f | #e8588f |

- Marque : encre `#111111`, crème `#F5EAD9` (`src/components/brand/brand.ts`). Thème navigateur `#ffffff` / `#131516` (`src/app/layout.tsx:40-43`). Manifest et écran de lancement : crème sur noir `#111111` (`src/app/manifest.ts`).
- Ambiance par personnalité : `--persona` (défaut `#c8295f`, `globals.css:88-92`), dérivés par `color-mix` : surface 4 % sur bg, soft 11 %, border 30 % avec border, text 85 % avec fg, glow 11 % (`:94-101`). Flutter : `Color.lerp(bg, persona, 0.04/0.11)`, transition animée 600 ms (`:100`). Personnalités vues : « Méchante » 😈, « Normale » 🙂 (id `professionnelle`), « À l'aise » 😎 (`src/lib/ai/personalities.ts:52-102`).
- Typo : Geist Sans + Geist Mono via next/font (`layout.tsx:2,17,22`), `font-sans` sur body (`:65`). Flutter : embarquer Geist (OFL) ou police système. Corps 16 px, bulles `leading-relaxed`, secondaire 14, légendes 12 (Composer.tsx, MessageItem.tsx:114).
- Rayons : bulle utilisateur 24 dp, coin bas-droit 8 dp (`rounded-3xl rounded-br-lg`, MessageItem.tsx:114) ; composer 25,6 dp (Composer.tsx:100) ; boutons ronds 36-40 dp ; champs/boutons 12 dp (AuthDialog.tsx:40) ; sheets 26 dp (AuthDialog.tsx:126) / 24 dp (ConfirmDialog.tsx:103).
- Ombres : composer `0 8 30 -12 rgba(0,0,0,.25)` (Composer.tsx:100) ; logo `0 14 30 rgba(17,17,17,.25)` (AuthDialog.tsx:209). Poignée de sheet 36-40 x 4 dp (ConfirmDialog.tsx:104, AuthDialog.tsx:200).
- Espacements : échelle 4 dp (px-4 = 16, py-2.5 = 10, gaps 6-12). Tiroir 288 dp, max 85 % de la largeur (Sidebar.tsx:121).
- Fonds décoratifs : `public/fond/lagon.svg`, `eau-rose.webp` ; halo radial en haut de la conversation (`globals.css:108-112`).

### 2. Actifs de marque utilisables
| Fichier | Format | Usage mobile |
|---|---|---|
| `public/brand/icone-512.png` | PNG 512x512 RGBA | base d'icône (iOS exige 1024x1024 opaque : à refaire) |
| `public/brand/icone-maskable-512.png` | PNG 512x512 | foreground d'icône adaptative Android (zone sûre 66 %) |
| `public/brand/icone-192.png`, `src/app/apple-icon.png` (180), `src/app/icon.png` (512) | PNG | secondaires |
| `public/brand/btm-b.png` | 318x385 transparent | « b » du splash (crème sur `#111111`) |
| `btm-ai-creme.png`, `btm-ai-encre.png` | 1039x483 transparent | logotype (ratio 1039/483) |
| `groupe-btm-creme/encre.png`, `groupe-btm-b-encre.png` | idem | Groupe BTM (à propos) |
| `public/food/*.webp` (7) | WebP | écran commande repas |
Le logo sert de masque coloré selon le thème (brand.ts) : variante crème en sombre, encre en clair. Aucune icône 1024 ni SVG de marque trouvée : P0, à demander à la marque.

### 3. Inventaire écrans web -> mobile
| Web | Fichiers | Écran mobile proposé |
|---|---|---|
| Accueil visiteur | `components/landing/GuestLanding.tsx`, `ChatDemo.tsx`, `ReviewsWall.tsx` | Onboarding court (cartes, ex. « Elle parle shimaoré avec toi », GuestLanding.tsx:31) + CTA écrire / se connecter |
| Chat sans compte | `(chat)/page.tsx`, `ChatView.tsx` (767 l.), `lib/chat/anonymous-draft` | Écran Chat identique, invite « Se connecter » (ChatView.tsx:695) |
| Connexion/inscription/Google/oubli | `auth/AuthDialog.tsx` (bottom sheet), `app/auth/*` | Feuille modale auth ; Google natif ; Sign in with Apple obligatoire iOS |
| Liste conversations | `layout/Sidebar.tsx`, `ConversationItem.tsx` | Tiroir « Historique » |
| Conversation `/c/[id]` | `(chat)/c` | Même écran Chat chargé par id |
| Paramètres (7 sections) | `parametres/SettingsView.tsx:17-23` | Liste groupée -> sous-écrans ; suppression de compte in-app |
| Personnalité | `personality/*` | Sélecteur dans le composer + sheet de cartes |
| Portefeuille | `portefeuille/WalletView.tsx` | Écran Portefeuille (règles IAP à vérifier) |
| Aide | `aide/page.tsx`, `help/HelpBubble.tsx` | Écran Aide/FAQ |
| Voix | `voix/page.tsx`, `chat/VoiceRoom.tsx`, `VoiceOverlay.tsx`, `AwaBlob.tsx` | Écran plein écran avec orbe animé |
| Utilisation | `utilisation/page.tsx` | Écran consommation/quotas |
| Services (repas, livraison, examens) | `FoodOrder`, `FoodCheckout`, `OrderTracker`, `CourierMap`, `CodeExamSlots`, `BookingDialog`, `BargeTickets` | Cartes riches dans le fil + écran suivi carte ; onglet « commande en cours » flottant (`ActiveOrderTab`, ChatShell.tsx:143) |
| Légal/partenaires/groupe | `confidentialite`, `partenaires`, `groupe-btm` | Écrans simples ou WebView (confidentialité obligatoire stores) |

**Navigation recommandée : Chat racine + tiroir gauche** (comme le web : Sidebar.tsx:121, « Nouvelle conversation » :141, « Historique » :186, « Paramètres » :255). Raison : appli mono-tâche (conversation) ; rubriques secondaires rares, déjà dans le menu compte (`AccountMenu.tsx`). Une barre d'onglets réduirait la zone de chat et doublonnerait le tiroir. Alternative P2 : 3 onglets (Chat, Voix, Compte) si la voix devient centrale.
- Gestes : bord gauche = tiroir ; appui long sur bulle = copier/écouter/relancer (remplace le survol `pointer-fine:`, MessageItem.tsx:123,205) ; glisser pour supprimer une conversation ; tirer pour rafraîchir.
- Clavier : le web recalcule hauteur/décalage via `visualViewport` (`useKeyboardViewport.ts`) et retire la marge de barre d'accueil clavier ouvert (`data-keyboard`). Flutter : `viewInsets`, composer collé au clavier, `SafeArea` bas inactif clavier ouvert. Web : Entrée envoie, Maj+Entrée = saut de ligne (Composer.tsx:75) ; champ auto-hauteur max 160/220 dp (Composer.tsx:122) ; compteur dès 80 % de `CHAT_LIMITS.maxUserMessageChars`.
- Zones sûres : web `env(safe-area-inset-*)` (ChatShell.tsx:121, sheets). Flutter : `SafeArea`, `SystemUiOverlayStyle` aligné au thème.
- Retour Android : web = pushState à l'ouverture d'un tiroir pour que « retour » le ferme (`useBackToClose.ts:16-32`, < 1024 px). Flutter : `PopScope`/routes pour tiroir, sheets, dialogues ; sur Chat racine, double retour pour quitter.

### 4. Composants Flutter à créer
| Nom | Rôle | Variantes (source) |
|---|---|---|
| `TamilyaTheme` | ThemeData clair/sombre + extension `PersonaColors` | persona animée |
| `ChatShell` | tiroir + zone teintée + halo | ChatShell.tsx |
| `ConversationDrawer`, `ConversationTile` | historique, nouvelle conv., compte | skeleton (`ui/Skeleton.tsx`), vide, long-press |
| `MessageBubble` user/assistant | bulle droite teintée / texte pleine largeur + avatar emoji | complete, streaming (curseur), interrupted, error (`bg-danger-soft`), « rédige » (3 points, MessageItem.tsx:158) |
| `MarkdownView` | markdown + blocs `[[mot]]` (`UnknownWord.tsx`) | Markdown.tsx |
| `LearnedChips` | « Retenu : fr -> shimaoré » | MessageItem.tsx:166 |
| `MessageActions` | copier, écouter (TTS), relancer | MessageItem.tsx:33 |
| `Composer` | champ auto-hauteur, slots leading/trailing, envoyer/stop | disabled + raison, indices tournants, compteur |
| `PersonalityPicker/Sheet` | cartes label+emoji+description | |
| `AuthSheet` | login/signup/oubli, Google, Apple | pending « Patiente… » |
| `ConfirmSheet` | confirmation | danger / normal (ConfirmDialog.tsx) |
| `PasswordField`, `AddressFields`, `SettingsTile/Section` | formulaires | |
| `VoiceOrb` + `VoiceScreen` | orbe pulsant (`--orb-pulse`) | écoute, parle, silence |
| `OrderCard/Tracker/CourierMap/FoodCheckout/SlotPicker` | cartes de service | |
| `CelebrationToast`, `NotificationBell`, `HelpBubble` | retours | |
| `PrimaryButton` (« btn-rose », pilule rose) | CTA | plein, contour, danger, loading |

### 5. Textes à reprendre à l'identique
Ton : tutoiement chaleureux, phrases courtes ; français + shimaoré (Tamilya « apprend »).
- Marque : « BTM AI », « L'intelligence artificielle pour Mayotte » (brand.ts) ; « Tamilya, l'assistante qui apprend le shimaoré. Faite à Mayotte par GROUPE BTM. » (GuestLanding.tsx:353).
- Titres : « Parle shimaoré avec Tamilya » (:230) ; « Une IA qui apprend le shimaoré, pour de vrai » (:288) ; « Elle parle shimaoré avec toi » (:31).
- Composer : « Écris à Tamilya… » (Composer.tsx:57), « Message à Tamilya », « Arrêter la génération », « Envoyer le message ».
- Chat : « Nouvelle conversation », « Historique », « Paramètres », « Fermer le menu », « Tamilya rédige une réponse », « Réponse interrompue. », « La réponse n'a pas pu être générée. », « Copier / Copié / Écouter / Arrêter la lecture / Relancer ce message », « Retenu : ».
- Auth : « Se connecter », « Créer un compte », « Continuer avec Google », « S'inscrire avec Google », « Mot de passe oublié ? », « Patiente… », « Connecte-toi pour accéder à tes paramètres. » (Sidebar.tsx:252).
- Paramètres (SettingsView.tsx:17-23) : Vue d'ensemble « Ton compte en un coup d'œil » ; Profil « Ton nom et ton téléphone » ; Adresses « Maison, travail, amis, famille » ; Tamilya « Sa personnalité et ce qu'elle retient » ; Mon avis « Ta note sur Tamilya, affichée sur l'accueil » ; Sécurité « E-mail, mot de passe, session » ; Supprimer le compte « Effacer ton compte et tes données ».
- Thème : « Passer en mode sombre/clair ».
- Le code garde « Awa » (AwaBlob, AwaMemory, AwaAvatar) mais l'UI affiche « Tamilya » : n'utiliser que Tamilya.

### 6. Conventions iOS / Android
- Navigation : iOS retour par balayage du bord + titres larges ; Android bouton/geste retour système ; transitions adaptatives.
- Feuilles : iOS sheet avec poignée (forme actuelle du web) ; Android `ModalBottomSheet` Material 3.
- Dialogues : `CupertinoAlertDialog` vs `AlertDialog` ; actions destructives en rouge.
- Icônes : maison (`ui/icons.tsx`) à convertir en SVG, identiques sur les deux OS ; Geist partout.
- Auth : Sign in with Apple obligatoire sur iOS dès que Google est proposé ; Credential Manager sur Android. Suppression de compte in-app (existe sur web) requise par l'App Store.
- Permissions : micro (et reconnaissance vocale iOS) avec textes en français ; notifications : permission explicite iOS, runtime Android 13+.
- Plateforme : rebond iOS / glow Android (défaut Flutter) ; haptique légère à l'envoi sur iOS ; barre d'état selon thème ; icône Android adaptative + monochrome ; splash natif `#111111` + « b » crème.
- Paiement/portefeuille : règles IAP des stores à vérifier pour tout contenu numérique.

### 7. Problèmes UX actuels et améliorations mobiles
1. Actions de message pensées pour le survol, repliées en petits boutons sous chaque message sur tactile (MessageItem.tsx:123,205) -> appui long + barre discrète. P1.
2. Entrée envoie (Composer.tsx:75) : sur clavier mobile on attend un saut de ligne -> Entrée = saut de ligne, bouton Envoyer. P0.
3. Contournements web du clavier (`useKeyboardViewport`) inutiles en natif -> `viewInsets`. P1.
4. CSS de 3 410 lignes, landing très animée (aurore, verre) -> landing sobre en natif, respecter `disableAnimations`. P2.
5. Erreur de réponse sans action (MessageItem.tsx:~196) -> bouton « Réessayer » dans la bulle. P1.
6. Échec réseau silencieux sur la liste des conversations (ChatShell.tsx:68-70) -> cache local + bandeau « Pas de connexion ». P1.
7. Accessibilité : titres `sr-only` (« Tu as écrit : », « Tamilya a répondu : ») -> `Semantics` ; vérifier contraste fgMuted sur bgMuted ; respecter `textScaler`. P1.
8. Brouillon anonyme : conserver en local, invite de connexion non bloquante. P2.
9. Thème : proposer Système / Clair / Sombre (le web n'a qu'une bascule). P2.

## Décisions / recommandations
- P0 : tokens -> `ThemeData` + extension persona ; tiroir + chat plein écran ; Entrée = saut de ligne mobile ; Sign in with Apple ; icône 1024 et splash `#111111`/crème ; `PopScope` pour le retour Android.
- P1 : composants §4 dans l'ordre Composer, MessageBubble, MarkdownView, ConversationDrawer, AuthSheet, Settings ; cache hors ligne ; appui long.
- P2 : onglet Voix, thème système, landing allégée.

## Fichiers modifiés
Aucun dans le dépôt web. Créé : ce rapport.

## Vérifications effectuées
Lecture de globals.css (1-113), layout.tsx, brand.ts, manifest.ts, ChatShell, Composer, MessageItem, useBackToClose, useKeyboardViewport, Theme ; extraits Sidebar, AuthDialog, ConfirmDialog, SettingsView, personalities.ts ; `file` sur les PNG pour les dimensions. Non lus en détail : Markdown.tsx, ChatView.tsx (hors extraits), WalletView, VoiceRoom, pages aide/utilisation/voix, AccountMenu.

## Non résolu / questions pour l'orchestrateur
- Liste complète et couleurs hex des personnalités (`personaStyle`, PersonalityContext.tsx) non relevées.
- Contenu de WalletView/aide/voix/utilisation non audité (parcours seulement).
- Paiement du portefeuille : conformité IAP ?
- Fichiers Geist (licence) et source vectorielle du logo à obtenir.

## Dépendances avec d'autres agents
- Auth (Google, Apple, session cookie vs jeton) : agents backend/auth.
- Streaming du chat, voix (TTS/STT), carte livreur : agents API/temps réel.
- Icônes, permissions, suppression de compte pour les stores : agent release/conformité.
