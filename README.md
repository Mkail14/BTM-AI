# BTM AI

Assistant conversationnel de **GROUPE BTM**, conçu en priorité pour les habitants et les entreprises de Mayotte (français, shimaoré en cours d'apprentissage).

MVP : discussion immédiate sans compte, réponses en flux, comptes Supabase pour enregistrer et retrouver ses conversations.

## Stack

- Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4
- Supabase : authentification (e-mail + mot de passe) et base Postgres avec RLS
- Fournisseur d'IA interchangeable côté serveur : Claude (SDK officiel `@anthropic-ai/sdk`) ou toute API compatible « Chat Completions »
- Tests : lanceur natif `node:test` + `tsx` (pas de Vite)

## Démarrage rapide

Prérequis : Node.js 20.9 ou plus récent (testé avec Node 22), un projet Supabase, une clé d'API d'IA.

```bash
npm install
cp .env.example .env.local   # puis compléter les valeurs
npm run dev                  # http://localhost:3000
```

Sans variables d'environnement, l'application démarre quand même : la page s'affiche, l'envoi d'un message renvoie une erreur explicite « service d'IA non configuré », et les comptes sont indiqués comme indisponibles.

### 1. Fournisseur d'IA

| Variable | Rôle |
|---|---|
| `AI_PROVIDER` | `anthropic` (défaut) ou `openai-compatible` |
| `AI_API_KEY` | Clé secrète du fournisseur (jamais préfixée `NEXT_PUBLIC_`) |
| `AI_MODEL` | Défaut Anthropic : `claude-opus-5-5`. Moins coûteux : `claude-sonnet-5-5`, `claude-haiku-5-5`. Obligatoire pour `openai-compatible` |
| `AI_BASE_URL` | Obligatoire pour `openai-compatible` (ex. `https://api.mistral.ai/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` pour Ollama) |
| `AI_MAX_OUTPUT_TOKENS` | Plafond par réponse (défaut 4096) : limite directe du coût |
| `AI_TIMEOUT_MS` | Durée maximale d'une génération (défaut 60 000) |
| `AI_EFFORT` | Anthropic uniquement : `low` (défaut, adapté au chat) … `max` |
| `AI_DISABLE_REASONING` | `openai-compatible` uniquement : `true` coupe la réflexion des modèles qui en ont une (format OpenRouter `reasoning.enabled`), pour un premier mot bien plus rapide. Défaut `false` |

Pour Claude, l'adaptateur active aussi la **mise en cache du préfixe** de conversation et le **repli côté serveur** d'Anthropic (`fallbacks: "default"`) : si un classifieur de sécurité refuse une demande, Anthropic peut la relancer sur un modèle adapté. Ces options sont regroupées dans `src/lib/ai/providers/anthropic.ts`.

### 2. Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Appliquez la migration `supabase/migrations/20261027000000_init.sql` :
   - avec la CLI : `npx supabase link --project-ref <ref>` puis `npx supabase db push` ;
   - ou en collant le fichier dans l'éditeur SQL du tableau de bord.
3. Renseignez dans `.env.local` (Project Settings → API) :
   - `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clé publishable ou anon, publique par conception) ;
   - `SUPABASE_SECRET_KEY` (clé secret ou service_role) : **serveur uniquement**, utilisée pour les compteurs de limitation de débit et la page d'administration.
4. Authentication → URL Configuration :
   - *Site URL* : `http://localhost:3000` (puis l'URL de production) ;
   - *Redirect URLs* : `http://localhost:3000/auth/callback` et l'équivalent en production.
5. `RATE_LIMIT_SALT` : une chaîne aléatoire (`openssl rand -hex 32`). Elle sert à hacher les adresses IP ; sans elle, une valeur aléatoire est générée à chaque démarrage (les quotas IP sont alors réinitialisés au redémarrage et ne sont pas partagés entre instances).

### 3. Administration (`/admin`)

La page `/admin` affiche des statistiques agrégées (comptes, conversations, messages, erreurs sur 7 jours), l'état de la configuration serveur (sans aucune valeur secrète) et la liste paginée des comptes. Elle ne lit jamais le contenu des conversations. Elle nécessite `SUPABASE_SECRET_KEY`.

Le rôle est porté par `app_metadata.role` (modifiable uniquement côté serveur, signé dans le jeton). Pour nommer un administrateur, dans l'éditeur SQL de Supabase :

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
where email = 'admin@exemple.yt';
```

L'utilisateur doit ensuite se déconnecter puis se reconnecter (le rôle est lu dans le jeton). Un lien « Administration » apparaît alors dans son menu de compte ; pour tout autre utilisateur, `/admin` renvoie une page introuvable.

Les modèles d'e-mails par défaut de Supabase fonctionnent tels quels (flux PKCE via `?code=`). La route `/auth/callback` accepte aussi le flux `token_hash` si vous personnalisez les modèles (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`).

### 3. Création de compte

L'inscription demande un nom affiché (obligatoire), l'e-mail (avec suggestion en cas de faute de frappe sur un grand fournisseur), un mot de passe vérifié en direct et l'acceptation explicite des règles de confidentialité. Réglages Supabase à aligner (Authentication) :

- **Policies → Password** : longueur minimale **8** et exigence « lettres et chiffres ». Le formulaire applique les mêmes règles, mais seule la configuration Supabase les impose réellement. Sur les offres payantes, activez aussi la détection des mots de passe divulgués.
- **Providers → Email → Confirm email** : laissez activé. Le formulaire gère les deux cas (écran « vérifiez vos e-mails » avec renvoi du lien, ou connexion immédiate si la confirmation est désactivée).
- **Emails → Templates** : collez les modèles du dossier [`emails/`](emails/) (objet conseillé en tête de chaque fichier) :
  - `confirmation-inscription.html` → « Confirm signup » ;
  - `mot-de-passe-oublie.html` → « Reset Password ».

  Leurs liens utilisent le flux `token_hash` : la personne est connectée directement, même si elle ouvre le lien dans l'application de messagerie de son téléphone. Avec les modèles par défaut (PKCE), ce cas confirme l'adresse sans pouvoir connecter : BTM AI affiche alors « adresse confirmée, connectez-vous ». Les liens reposent sur **URL Configuration → Site URL**, qui doit être l'adresse publique de BTM AI.
- Appliquez la migration `20261028000000_profile_display_name_from_signup.sql` pour que le nom saisi à l'inscription soit enregistré dans le profil.
- **Emails → SMTP Settings** : le service d'envoi intégré à Supabase est limité à quelques e-mails par heure. Utilisez la boîte OVH de GROUPE BTM, comme le site btm.yt (dont le SPF n'autorise que les serveurs OVH) : expéditeur `contact@btm.yt`, nom `BTM AI`, hôte `ssl0.ovh.net`, port `465`, identifiant `contact@btm.yt`, mot de passe de la boîte. Puis ajustez **Rate Limits → emails par heure** (ex. 30).

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Génération des types de routes + `tsc --noEmit` |
| `npm test` | Tests unitaires (`tests/*.test.ts`) |
| `npm run check` | Lint + types + tests |

## Tester le parcours complet

1. Ouvrir `/` sans être connecté, écrire un message : la réponse s'affiche en flux. « Arrêter » (ou Échap) interrompt la génération.
2. Recharger la page : la conversation anonyme est restaurée depuis le navigateur.
3. Cliquer sur « Enregistrer », « Historique » ou « Paramètres » : la fenêtre de connexion s'ouvre sur place.
4. Créer un compte, confirmer l'e-mail : à l'arrivée sur `/`, BTM AI propose d'enregistrer la conversation commencée sans compte (rien n'est transféré sans accord).
5. Connecté : chaque conversation est enregistrée, listée dans la barre latérale, supprimable, et accessible sur `/c/<id>` depuis n'importe quel appareil.
6. Ouvrir `/c/<id>` d'un autre compte : page introuvable (RLS).
7. « Mot de passe oublié ? » → e-mail → `/auth/nouveau-mot-de-passe`.

## Architecture

```
src/
  proxy.ts                     Rafraîchit la session, redirige les pages privées (vérification optimiste)
  app/
    (chat)/page.tsx            Accueil = conversation immédiate
    (chat)/c/[id]/page.tsx     Conversation enregistrée (privée)
    api/chat/route.ts          Validation → quotas → contexte → flux NDJSON → persistance
    api/awa/route.ts           Awa pour les autres sites de GROUPE BTM (btm.yt), secret par site (awa_partner_keys)
    api/conversations/…        Liste, import après connexion, suppression
    auth/…                     Callback e-mail, mot de passe oublié / nouveau, lien invalide
    parametres/                Profil (Server Action)
    admin/                     Administration (rôle app_metadata, statistiques agrégées)
    confidentialite/           Règles de conservation des données
  components/
    brand/                     Marque séparée (logo typographique, emplacement du futur symbole)
    auth/                      Contexte de session + fenêtre de connexion/inscription
    chat/                      Vue de conversation, saisie, messages, Markdown
    layout/                    Shell avec barre latérale, pages secondaires
  lib/
    ai/                        Interface fournisseur, adaptateurs, message système
    language/                  Consignes shimaoré + exemples validés (vide pour l'instant)
    auth/                      Lecture de session, chemins protégés, redirections sûres
    chat/                      Limites, types, validation zod, protocole de flux, historique
    conversations/             Accès aux données (toujours via le client RLS de l'utilisateur)
    rate-limit/                Quotas (Postgres partagé, repli mémoire en dev)
    security/                  IP, hachage HMAC, contrôle d'origine
    supabase/                  Clients navigateur, serveur, proxy, admin
supabase/migrations/           Schéma, RLS, fonction de limitation de débit
tests/                         Tests unitaires
```

### Changer de logo

Le logo actuel est typographique (`BTM` + `AI`). Pour ajouter le futur symbole de la branche IA, déposez le fichier dans `public/brand/` et renseignez `symbolSrc` dans `src/components/brand/brand.ts`. Aucun autre fichier n'est à modifier.

### Shimaoré

Le modèle n'est pas présenté comme maîtrisant le shimaoré. Le message système lui demande de signaler les incertitudes et de proposer la version française. `src/lib/language/shimaore.ts` accueillera les exemples validés par des locuteurs (injectés automatiquement dans le message système) ; étapes suivantes envisagées : table d'exemples, glossaire, retours de correction soumis à validation, jeu d'évaluation.

## Sécurité et données

- **Secrets** : clé d'IA et clé secrète Supabase lues uniquement côté serveur. Seules l'URL et la clé publishable de Supabase sont exposées (prévues pour l'être).
- **Contrôle d'accès** : RLS sur `profiles`, `conversations`, `messages` (propriétaire uniquement, aucun accès `anon`). Les routes serveur utilisent le client de l'utilisateur, jamais la clé secrète, pour lire/écrire des conversations : modifier un identifiant renvoie 404. Les messages sont immuables (pas de politique UPDATE).
- **Administration** : `/admin` exige `app_metadata.role = "admin"`, revérifié à chaque rendu (le proxy ne fait qu'un contrôle de session). La clé secrète n'y sert qu'à des comptages et à la liste des comptes, jamais au contenu des conversations.
- **Historique** : pour un utilisateur connecté, le contexte est relu en base, jamais repris du client.
- **Validation** : schémas zod stricts (champs inconnus refusés, tailles bornées, UUID), corps limité à 128 Ko, contrôle d'origine sur les requêtes qui modifient des données.
- **Quotas** (côté serveur, `src/lib/rate-limit/policies.ts`) :
  - visiteur, par appareil (cookie httpOnly) : 6 messages/min, 30/jour ;
  - visiteur, par IP hachée : 30/min, 300/jour — volontairement large car de nombreux abonnés mobiles à Mayotte partagent une même IP (CGNAT) ;
  - utilisateur connecté : 15/min, 300/jour ; import : 10/heure ;
  - conversation sans compte : 10 échanges ; conversation enregistrée : 200 messages ; message : 4 000 caractères.
  En cas de panne du stockage des compteurs, l'envoi est refusé (fail closed) pour protéger les coûts.
- **Injection de consignes** : le contenu utilisateur n'est jamais placé dans le message système, le rôle `system` est refusé dans l'historique, et le message système indique que les textes des utilisateurs sont des données. Cela réduit le risque sans l'éliminer ; l'assistant n'a pour l'instant aucun outil ni accès à des données privées, ce qui limite l'impact.
- **Markdown** : le HTML brut des réponses n'est pas interprété ; seuls les liens `http(s)`, `mailto`, `tel` et internes sont conservés.
- **Erreurs** : messages génériques côté client ; le détail reste dans les journaux serveur. Le contenu des messages n'est pas journalisé.

### Conservation des données

- Sans compte : rien en base ; la conversation reste dans le `localStorage` du navigateur 24 h au maximum. Les messages transitent par le serveur vers le fournisseur d'IA, qui applique ses propres règles de conservation.
- Compteurs de quotas : empreintes HMAC, supprimées après 2 jours au plus.
- Avec compte : conversations conservées jusqu'à leur suppression par l'utilisateur.

## Décisions et limites connues

- **`cacheComponents` désactivé** (activé par défaut par `create-next-app`) : toutes les pages dépendent de la session et sont rendues à la demande. Plus simple et sans risque de mise en cache d'une page personnelle.
- **IP client** : lue dans `X-Forwarded-For`. En production, l'application doit être derrière un proxy de confiance qui réécrit cet en-tête (Vercel, Nginx…), sinon la limite par IP est contournable (la limite par appareil et les plafonds de taille restent actifs).
- **Insertion directe via l'API Supabase** : un utilisateur connecté peut, avec la clé publishable, insérer des messages dans *ses propres* conversations sans passer par `/api/chat` (aucun coût d'IA, aucun accès aux données d'autrui). Pour l'interdire, il faudra réserver l'écriture au serveur (fonction `security definer` ou clé secrète).
- **Suppression de compte** : pas encore en libre-service (à traiter avec la politique de confidentialité officielle).
- **Pas de tests de bout en bout** du parcours navigateur ni d'intégration avec une vraie base Supabase dans ce dépôt : les tests couvrent la logique pure (validation, historique, flux, quotas, configuration, redirections).
- Le fichier `AGENTS.md` est généré par Next.js (consignes pour les assistants de code).
