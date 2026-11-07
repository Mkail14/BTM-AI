# Journal de Tamilya (site btm-ai)

Ce journal raconte la construction du site : ce qui a été fait, quand, et surtout **pourquoi**.
Il est mis à jour après chaque commit.

**Dernier commit noté : `d063117` (2026-11-07)**

Comment le tenir :
- après chaque commit, ajouter une ligne datée en haut de la partie « Journal » : ce qui change et pourquoi ;
- quand on choisit un outil ou qu'on en refuse un, l'écrire dans « Choix techniques » ;
- une idée remise à plus tard va dans « Idées en attente » ;
- au début d'une session, comparer le « Dernier commit noté » avec `git log` et rattraper ce qui manque.

---

## Choix techniques : pourquoi ça et pas autre chose

| Sujet | Choix | Pourquoi | Écarté |
|---|---|---|---|
| Cadre du site | Next.js 16 + React 19 | Pages et API dans le même projet, hébergé simplement sur Vercel | — |
| Hébergement | Vercel, fonctions à Dublin | Proche de la base Supabase (Irlande, eu-west-1), donc réponses plus rapides | — |
| Base de données et comptes | Supabase (Postgres) | Comptes, base et règles de sécurité au même endroit ; pgvector pour la bibliothèque Mayotte | — |
| IA | Gemini (Google) uniquement | Crédit Gemini payé ; une seule IA à suivre | OpenRouter et toute API de secours, refusés le 2026-11-02 |
| Gemini bloqué à Mayotte | Relais par le site en ligne (serveur en Irlande) | Google refuse les appels venant de Mayotte ; le relais garde Gemini | Changer d'IA |
| Vocal | Gemini Live (parole à parole) | Première voix en 1 à 2 s au lieu de 4 à 6 s avec texte puis voix | Dictée Chrome + TTS phrase par phrase (gardé en secours) |
| Relais vocal | Cloudflare Worker en Durable Object | Vercel ne tient pas les connexions WebSocket ; le Worker simple était coupé après 5 à 9 s (limite de calcul gratuite), le Durable Object non | Serveur payant dédié |
| Modèle vocal | Comparé : 3.1 Flash Live (1,06 s, gigue 0,3 s) contre 2.5 native audio (2,8 s, gigue 1,1 s) | Règle : changer seulement si stable et gigue ≤ 2 s | — |
| Son de la voix | MP3 48 kb/s | 8 fois plus léger que le WAV, important avec le débit de Mayotte (~20 Ko/s) | WAV |
| Langue | Shimaoré, dictionnaire validé seulement | Ne pas inventer de mots ; les mots inconnus partent à l'admin | Kibushi (Tamilya ne le parle pas), swahili externe |
| Cartes | OpenFreeMap + OSRM | Gratuits et sans clé | Services payants |
| Paiement | Stripe (portefeuille de 5 à 150 €) | Recharge simple, code à 4 chiffres pour payer à la voix | — |
| PDF | pdf-lib | Remplir l'attestation d'hébergement sans serveur externe | — |
| Paquets | pnpm seulement | Un `npm install` a cassé node_modules le 2026-11-02 | npm |
| App Android | Java natif + WebView (dépôt séparé) | Le site se met à jour sans réinstaller l'APK ; Tamilya Connect natif pour marcher sans internet | Réécrire toute l'app |
| Style | Boutons rose plein, icônes, pas d'emoji | Choix de l'utilisateur après plusieurs essais ; les emojis « ne font pas pro » | Verre sobre, crème, bonbon |
| Fin de phrase en vocal sans bouton | Silero VAD (libre, MIT), dans le navigateur avec onnxruntime-web | Reconnaît une voix humaine, pas seulement un son fort : la route et les travaux ne passent plus pour de la parole ; 3 à 5 ms par paquet | Porte au volume seule (gardée en secours tant que Silero n’est pas chargé) |
| Retours tactiles | Vibrations courtes | Un son sur chaque bouton « ne fait pas vraie app » | Sons |
| Données de Mayotte | API publiques françaises : annuaire service-public.gouv.fr, geo.api.gouv.fr, météo Open-Meteo | Gratuites, sans clé, officielles et couvrent Mayotte ; seulement quand la question en parle, donc pas de lenteur en plus | Brancher en vrac la liste GitHub « public-apis » (mondiale, presque rien sur Mayotte, beaucoup de clés et de liens morts) ; Météo-France et INSEE (clé obligatoire) pour plus tard |

---

## Idées en attente

### Voix personnalisée avec VibeVoice (noté le 2026-11-07)
- **Idée :** donner à Tamilya la voix d'une vraie personne, avec son **accord écrit et signé**.
- **Outil :** VibeVoice (Microsoft, licence MIT). Microsoft a retiré le code qui fabrique la voix le 2025-09-05. Copie de la communauté : github.com/vibevoice-community/VibeVoice (modèles 1.5B et 7B).
- **Comment ça s'intégrerait :** Gemini Live répond en texte, puis VibeVoice dit ce texte avec la voix clonée, puis le son part au téléphone.
- **Obstacles :**
  - il faut un serveur avec une carte graphique (le PC n'a qu'une Intel UHD ; Vercel et Cloudflare ne peuvent pas), donc un nouveau service payant à valider ;
  - ce serait plus lent (+1 à 3 s estimés) ;
  - le shimaoré risque d'être mal prononcé (VibeVoice a appris surtout l'anglais et le chinois).
- **Première étape prévue :** essai gratuit sur Google Colab avec 20 à 30 s d'enregistrement et 5 phrases en shimaoré, sans toucher à Tamilya.

### Auto-école en ligne (décidé le 2026-11-05, rien de lancé)
- Agrément de la préfecture, exploitant, local et enseignants à prévoir avant toute annonce.

---

## Journal (le plus récent en haut)

### 2026-11-07
- **Tamilya connaît les services publics, la météo et les communes de Mayotte** (`d063117`). Annuaire officiel service-public.gouv.fr : 192 services de l'île (mairies, CSSM, préfecture, gendarmeries, France services, impôts, tribunal…) avec adresse, téléphone et horaires, choisis selon la commune ou le village cité (Combani → Tsingoni, Kawéni → Mamoudzou…). Météo Open-Meteo, déjà utilisée par le journal parlé, désormais aussi pour les questions. Communes : codes postaux et population INSEE (geo.api.gouv.fr). À l'écrit, ces infos s'ajoutent seulement quand le message en parle ; au vocal, Tamilya appelle le bouton `infos_mayotte`. Pourquoi : demande de l'utilisateur de « tout savoir » sur Mayotte avec des sources sûres, sans inventer d'horaire ni de numéro. Vérifié : vrais appels (mairie de Sada, gendarmerie de Combani, CSSM, préfecture, météo, communes), 457 tests.
- **Vocal sans bouton : Silero reconnaît la voix** (`eb8f837`). La porte à bruit ne décidait qu’au volume : un bruit fort (moto, travaux, quelqu’un qui parle fort) passait pour la personne. Silero, un petit détecteur de voix libre, dit maintenant si c’est une voix. Pendant que Tamilya parle, il faut toujours parler plus fort que son écho pour la couper. Coût : environ 6 Mo téléchargés la première fois (modèle 2,3 Mo + moteur ~4 Mo compressé), gardés ensuite ; en attendant, ou si l’appareil ne peut pas, l’ancienne porte au volume marche seule. Le moteur n’est pas dans git : `scripts/copy-vad.mjs` le copie dans `public/vad/` avant `dev` et `build` ; `/vad/` passe hors du proxy (sinon bloqué par la page d’attente). Mode « maintenir pour parler » inchangé. Vérifié : essai sur voix synthétique (voix reconnue, bruit fort ignoré, voix gardée dans le bruit), 451 tests, construction du site. Pas encore essayé au vrai micro. Suite possible : raccourcir l’attente de fin de phrase (0,6 s de porte + 0,7 s de Gemini), à mesurer.
- **Profil de l'entreprise lisible sur téléphone** (`4599d52`) : les trois blocs (État du site, RIB, Administrateurs) dépassaient de l'écran d'environ 45 px, la page bougeait de côté. Pourquoi : la grille laissait chaque bloc aussi large que son contenu. Correctif : blocs à la largeur de l'écran, pastille d'état cachée sur téléphone (l'état est redit juste dessous), sous-titres qui passent à la ligne, barre du haut allégée (« Admin » et « / Profil » cachés sur petit écran). Vérifié à 390, 360 et 320 px ; ordinateur inchangé.
- **Annulation des commandes de repas** (`92d724c`) : possible jusqu'à 4 h avant le début de la préparation, remboursée tout de suite sur le moyen de paiement utilisé. Après, BTM ne peut plus annuler : le client est renvoyé vers le restaurant. Pourquoi : règle décidée pour les commandes programmées ; le restaurant doit pouvoir compter sur une commande à moins de 4 h. Seule la dernière commande est annulable depuis le site (le serveur ne garde qu'elle).

### 2026-11-06
- **Fusion de develop dans main** (`c8175eb`).
- Paiement à la voix autorisé une seule fois ; barre du haut fixe en vocal (`aebe845`).
- « Mes documents » dans le menu ; le compte Google du Drive sert aussi à se connecter (`36d18c7`).
- Tamilya dans BTM Market via /api/awa, avec une table de clés partenaires (`2bc0e4a`, `323b417`). Pourquoi : une seule Tamilya pour tous les sites du groupe.
- Vocal : Tamilya fixée en haut, tableau centré dessous et qui défile (`5e4ac9b`, `e9fcbc0`, `cf2d857`).
- Attestation d'hébergement : remplie à la voix, aperçu, PDF à signer à la main, envoi par e-mail (`3d8898a`, `e0fb649`, `ae85a41`, `4032fff`).
- Vocal : Tamilya agit d'abord au lieu de poser des questions, attend 0,7 s de silence (au lieu de 0,3 s) et ignore l'écho de sa propre voix (`71a454a`). Pourquoi : elle coupait les phrases et se répondait à elle-même. Coût : environ 0,4 s de plus.
- Tamilya plus humaine : âge, anniversaire, souvenirs datés (`1542642`).
- Vocal : connaît les lieux de Mayotte, fait confirmer en cas de doute, rapproche ce qu'elle entend des mots validés (`1809c21`, `8d64b89`).
- Trois états du site : en ligne, maintenance, en attente d'un partenaire ; develop jamais fermé (`063dd1d`, `a92eba0`). Pourquoi : pouvoir tester pendant que le site public est fermé.
- Page d'attente refaite, sans défilement (`fbbd056`) ; fond qui dessine Mayotte (`10ae8b0`).
- Vidéos YouTube de Tamilya avec miniatures (`e76634f`).

### 2026-11-05
- **Vocal en direct (Gemini Live) via un relais Cloudflare** (`2d0e25f`, `9280fc4`). Pourquoi : passer de 4 à 6 s d'attente à environ 2 s.
- Relais : réflexion du modèle coupée (2 à 2,5 s au lieu de 5 s ou pas de réponse) ; fin de parole à 0,4 s (`def9287`, `4b3dbf6`).
- Relais passé en Durable Object (`5fcd318`). Pourquoi : la version gratuite simple était coupée après quelques secondes (limite de calcul).
- Mode talkie-walkie (maintenir pour parler) puis choix entre maintenir et sans bouton (`1e518f1`, `bf365ca`).
- iPhone : micro capté normalement puis ramené à 16 kHz (`3cd1179`). Pourquoi : la voix arrivait déformée.
- Reconnexion automatique avec reprise de la conversation (`645f959`). Pourquoi : réseau instable à Mayotte.
- Journal parlé (météo, actualités du jour), recherche Google à la voix (`d4f510a`, `2c915a0`).
- Étape 1 du « Jarvis » : leçon de shimaoré en interrupteur, réflexion profonde pour les questions difficiles, recherche avec sources (`d79f628`).
- Étape 2 : bibliothèque Mayotte, recherche par le sens, pages publiées par un admin (`21b52fa`, `7f6a7f6`, `1a3b1c3`, `8c84cc3`).
- Ton oral vif, limité au dictionnaire validé (`b713677`).
- Tamilya Connect (partie site) : messages relayés de téléphone en téléphone sans internet (`897c3b9`).
- Commande groupée de repas sur plusieurs restaurants (`d68ed76`).
- Personnalités retirées, une seule Tamilya professionnelle (`923e83e`).
- App Android : lien avec le site, connexion Google dans l'app (`43bc7b8`, `234f998`, `817a39d`).

### 2026-11-04
- Audit complet : sécurité, bugs, affichage téléphone, vitesse, textes (`0b39a1e`).
- Connexion Google (`bc39508`, `60a1ab6`).
- API pour développeurs avec codes d'accès (`a39f0c6`).
- Application mobile : connexion par jeton, route /api/me, suppression de compte sécurisée (`fd5c626` à `5448158`).
- Devis BTM dans la conversation, aux prix de btm.yt (`87a05be`).
- Première voix Gemini (texte puis voix), MP3, puis voix en continu et chronométrage de chaque étape (`5b9887d` à `3e1db20`). Pourquoi : mesurer avant d'optimiser.
- Actualités de Mayotte relues toutes les 10 minutes (`4c6c430`).

### 2026-11-03
- **Awa devient Tamilya**, fond « lagon » (`5df5d58`).
- Page d'accueil : plusieurs essais de boutons, retour au rose plein (`1e91d31`, `aba8492`, `c2a2da5`).
- Sécurité : un compte ne peut plus écrire directement dans la base (`4333c7d`). Pourquoi : on pouvait créer une fausse demande « payée ».
- Maintenance avec journal (`2a5ccc8`).

### 2026-11-02
- Portefeuille rechargeable par Stripe (`6202abb`).
- Commande de repas dans la conversation avec suivi en direct (`9722264`, `74c2c20`). Restaurants de Jéjé Livraison : démo réservée aux admins tant qu'il n'y a pas d'accord écrit (`f67e158`).
- Page d'accueil pour les visiteurs, essai limité à 5 messages (`febecd5`).
- Code de la route : horaires de La Poste posés en questions successives (`eb063ae`).

### 2026-11-01
- Mode maître : corriger Tamilya en direct, appris dès le message suivant (`d3cc728`, `d36399b`).
- Tableau de bord et page « Circuit d'Awa » (`b608e6a`).
- Code de la route : créneaux et vrais horaires des bureaux La Poste (`baf906f`, `425b062`).

### 2026-10-30
- Réponses brèves ; shimaoré limité au vocabulaire validé ; mots inconnus envoyés à l'admin (`6069285`, `72ca881`).
- Gemini : API native, repli automatique sur un autre modèle s'il est saturé (`59e398f`, `9136113`, `dbb6e39`).
- Schéma de l'IA façon n8n (`565febb`).

### 2026-10-29
- Route /api/awa pour les autres sites du groupe (`c045334`).

### 2026-10-27
- **Version initiale de BTM AI** (`2cbb09d`).
- Vercel à Dublin, près de Supabase (`d1a57bf`).
- Chat mobile façon application, vibrations, icônes (`e4d047e` à `183b20b`).
