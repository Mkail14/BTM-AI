# Tamilya Mobile — Contrat d'API V1

_Architecte, 2026-11-04. Source de vérité côté serveur : dépôt web (`src/...`). État : **existe** (utilisable tel quel), **C1-Bearer** (la route existe mais exige l'acceptation du Bearer, D4), **nouvelle C1** (route à créer en C1)._

## 0. Règles communes
- Base : `API_BASE_URL` (HTTPS). En-têtes : `Authorization: Bearer <access_token Supabase>` (si connecté), `Content-Type: application/json`, pas d'en-tête `Origin` (le contrôle `isSameOrigin` accepte un client natif, `src/lib/security/request.ts:26-31`).
- Erreurs (forme A) : `{"error":{"code":ChatErrorCode,"message":string}}` (`src/lib/chat/errors.ts:25-27`). Les 14 codes sont listés dans `src/lib/chat/types.ts:13-27`.
- Erreur maintenance (forme B) : `503`, `{"error":string}`, `Retry-After: 600` sur toute route `/api/*` (`src/proxy.ts:20-23`). Les lectures Supabase directes ne passent pas par le proxy et ne voient donc pas la maintenance.
- `429` : en-tête `Retry-After` en secondes.
- Lectures directes : supabase_flutter avec la session de l'utilisateur. La RLS autorise le propriétaire seul et `anon` est révoqué (04 §2, 05 validé).
- **Exigences C1 transversales** : (1) cookies prioritaires, Bearer accepté seulement en l'absence de session cookie ; (2) Bearer présent mais invalide ou expiré → `401 unauthorized`, **jamais** de repli en invité ; (3) vérification par `auth.getClaims(token)`.

## 1. Authentification (Supabase Auth direct, existe)
| Opération | Appel | Notes |
|---|---|---|
| Inscription | `auth.signUp(email, password, data:{display_name}, emailRedirectTo:<URL mobile exacte>)` | Le web envoie aussi `address_commune` et `address_line` (`src/components/auth/AuthDialog.tsx:654-657`). **Question au Backend** : ces champs sont-ils obligatoires pour le trigger `handle_new_user` ? Règles : mot de passe d'au moins 8 caractères, avec lettres et chiffres (config Supabase). Un e-mail jetable est refusé (`check_violation`, trigger `reject_disposable_email`). Si la confirmation par e-mail est active : écran « vérifie tes e-mails » |
| Connexion | `auth.signInWithPassword(email, password)` | Erreur `invalid_credentials` → « E-mail ou mot de passe incorrect. » ; `email_not_confirmed` → proposer le renvoi (`auth.resend(type: signup)`) |
| Mot de passe oublié | `auth.resetPasswordForEmail(email, redirectTo:<URL mobile exacte>)` | Le lien ouvre l'app (App Link), puis l'écran nouveau mot de passe |
| Nouveau mot de passe | `auth.updateUser(UserAttributes(password))` puis `POST /api/auth/password-notice` | La notification e-mail est **C1-Bearer** (`src/app/api/auth/password-notice/route.ts:15-16`), sans corps (à confirmer en C1). Si elle échoue, l'app ne bloque pas |
| Déconnexion | `auth.signOut(scope: local \| global)` | — |
| Google / Apple | `auth.signInWithIdToken(...)` | Derrière des flags, hors V1 (ARCHITECTURE §9) |

## 2. Chat
### POST `/api/chat` — **C1-Bearer**
Source : `src/app/api/chat/route.ts:106-644`.
Requête (zod strict, `src/lib/chat/validation.ts`, `chatRequestSchema`) :
```json
{ "message": "string, 1..4000 après trim", "conversationId": "uuid (optionnel)", "voice": false }
```
- Connecté : pas d'`history` (il serait ignoré, l'historique est relu en base). Sans `conversationId`, le serveur crée la conversation.
- Invité (flag `FEATURE_GUEST_MODE`, hors V1) : `{message, history:[{role:"user"|"assistant",content}]}` (10 tours et 60 000 caractères au maximum), `conversationId` interdit. Toute propriété inconnue → 400 (schéma strict).
- Corps brut d'au plus 128 Ko (`route.ts:51`).

Réponse 200 : `Content-Type: application/x-ndjson; charset=utf-8`, une ligne par événement :
```
{"type":"meta","conversationId":"<uuid>"}
{"type":"delta","text":"..."}            (répété)
{"type":"replace","text":"..."}          (admin, rare)
{"type":"learned","words":[{"french":"","shimaore":""}]}   (admin, ignoré)
{"type":"done","finishReason":"stop|length|refusal|other"}
{"type":"error","code":"<ChatErrorCode>","message":"..."}  (fin en erreur)
```
Erreurs avant le flux (forme A) : 400/413 `invalid_request` ; 401 `unauthorized` ; 403 `signup_required` (invité) ; 404 `not_found` (conversation inexistante ou étrangère) ; 409 `conversation_too_long` (plus de 200 messages, `src/lib/chat/limits.ts:17`) ; 429 `rate_limited` + `Retry-After` (connecté : 15/min et 300/jour, réglables par l'admin) ; 503 `ai_not_configured` / `flow_cut` / `service_unavailable` ; 500 `internal` ; 503 maintenance (forme B).
Effets serveur : message utilisateur et message assistant enregistrés (clé service role, `src/lib/conversations/repository.ts:27`). Le message assistant a le statut `interrupted` si le client coupe (`route.ts:453`). Le titre IA est mis à jour après la réponse (`after()`).

## 3. Conversations
| Opération | Source | Requête | Réponse | Erreurs | État |
|---|---|---|---|---|---|
| Lister | **Supabase direct** | `from('conversations').select('id,title,updated_at').order('updated_at',ascending:false).range(0,49)` | `[{id,title,updated_at}]` | Erreur PostgREST / JWT expiré | existe (RLS) |
| Lire les messages | **Supabase direct** | `from('messages').select('id,role,content,status,created_at').eq('conversation_id',id).order('created_at',ascending:false).limit(200)`, puis inversion de l'ordre côté app (même logique que `repository.ts:73-86`) | `[{id,role,content,status,created_at}]`, `status` ∈ complete / interrupted / error | Liste vide si conversation étrangère ou supprimée : vérifier d'abord `conversations.select().eq('id',id).maybeSingle()` et renvoyer `not_found` si null | existe (RLS) |
| Supprimer | `DELETE /api/conversations/{id}` | — | `204` sans corps | 404 `not_found` (id invalide, inexistante ou étrangère), 401, 503 maintenance | **C1-Bearer** (`src/app/api/conversations/[id]/route.ts:9-37`) |
| Importer le brouillon invité (flag) | `POST /api/conversations` | `{messages:[{role,content(1..40000)}]}` (1 à 10) | `201 {conversation:{id,title,updatedAt}}` | 400, 401, 429 + `Retry-After` (10/heure), 500 | **C1-Bearer** (`src/app/api/conversations/route.ts:30-75`) |
| Renommer | — | — | — | — | Pas en V1 (aucune route web ; le titre est donné par le serveur) |

Note : `GET /api/conversations` existe (`route.ts:11-24`), mais n'est pas utilisée par l'app, qui lit la liste en direct (D5). La lecture directe permet aussi de paginer avec `range` (la route serveur n'a pas de curseur).

## 4. Compte : `/api/me` (**nouvelle C1**)
Elle reprend la logique des Server Actions de `src/app/parametres/actions.ts` sans la dupliquer. Il faut extraire le cœur de chaque action dans une fonction de `src/lib/` (par exemple `src/lib/account/`), appelée par l'action web et par la route. Le comportement web ne change pas. Les erreurs utilisent la forme A. Auth : `getAuthContext()` (cookie ou Bearer) ; sans utilisateur → `401 unauthorized`.

### GET `/api/me`
Pourquoi une route plutôt qu'une lecture directe : les fiches de personnalité sont réglées par l'admin (`loadPersonalityCards`, `src/lib/ai/personality-store.ts`, utilisée par `src/app/parametres/page.tsx:41` et `src/app/(chat)/layout.tsx:12`), et le client n'a aucun droit sur la table `awa_personalities`.
Réponse 200 :
```json
{
  "profile": { "email": "string|null", "displayName": "string|null", "personality": "mechante|professionnelle|cool|null" },
  "personalities": [ { "id": "professionnelle", "label": "…", "emoji": "…", "description": "…", "sample": "…" } ],
  "defaultPersonality": "professionnelle"
}
```
Sources : `getProfile` (`src/lib/conversations/repository.ts:170-183`), `PersonalityCard` (`src/lib/ai/personalities.ts:159`), `DEFAULT_PERSONALITY` (`personalities.ts:12`). `personality: null` = jamais choisie : l'app propose le choix, comme le web après l'inscription. `email` vient du JWT (`SessionUser.email`).
Repli possible : l'app peut aussi lire `profiles` en direct (`select('display_name,personality')`). La route reste nécessaire pour les fiches.

### PATCH `/api/me`
Requête (zod strict, au moins un champ) :
```json
{ "displayName": "string, trim, 0..60 (vide = retiré)", "personality": "mechante|professionnelle|cool" }
```
Logique à reprendre :
- `displayName` : `profileSchema` (`src/lib/chat/validation.ts`, `displayName` trim max 60), `updateProfile(supabase, user.id, displayName || null)`, puis e-mail `notifyAccountChange` **seulement si le nom a changé** (`src/app/parametres/actions.ts:29-39`) ;
- `personality` : `isPersonalityId` (`src/lib/ai/personalities.ts:172`), puis `updatePersonality` (`actions.ts:53-56`) ;
- côté web, `revalidatePath("/", "layout")` (`actions.ts:45,62`) peut être conservé.

Réponse 200 : `{ "profile": { …même forme que GET… }, "message": "Paramètres enregistrés." }`. Pour la personnalité seule, le message est « C'est noté, Tamilya change de personnalité ! » (`actions.ts:63`).
Erreurs : 400 `invalid_request` avec le premier message zod (« 60 caractères maximum. ») ou « Personnalité inconnue. » ; 401 `unauthorized` ; 500 `internal` (« L'enregistrement a échoué. Réessaie. »). Une limite de débit est **à proposer** (par exemple 30/heure/compte), car chaque changement de nom envoie un e-mail.

### DELETE `/api/me`
Requête : `{ "confirmation": "SUPPRIMER" }` (`DELETE_CONFIRMATION`, `src/app/parametres/confirmation.ts:2`). L'app demande à l'utilisateur de recopier le mot, comme sur le web.
Logique (`src/app/parametres/actions.ts:71-96`) : vérifier la confirmation, puis appeler `admin.auth.admin.deleteUser(user.id)` avec le client service role, ce qui supprime en cascade le profil, les conversations et les messages. Si la suppression échoue et qu'il s'agit d'un admin ou d'un compte protégé, renvoyer un message dédié. Ensuite `notifyAccountDeleted(email)`. Le `signOut` cookie (`actions.ts:93`) n'a pas lieu pour un appel Bearer : l'app fait elle-même `signOut(scope: local)` puis efface le stockage.
Réponse : `200 {"message":"Ton compte a été supprimé."}`.
Erreurs : 400 `invalid_request` (« Écris SUPPRIMER pour confirmer. ») ; 401 `unauthorized` ; 403 `invalid_request` (« Ce compte administrateur est protégé : il ne peut pas être supprimé. ») ; 503 `service_unavailable` (clé service role absente, « La suppression est indisponible pour le moment. ») ; 500 `internal` (« La suppression a échoué. Réessaie. »).
Remarque : le JWT reste cryptographiquement valide jusqu'à son expiration après la suppression, mais il ne correspond plus à aucun compte : les lectures RLS renvoient du vide et `/api/chat` doit renvoyer 401 (à couvrir par un test C1).

### Hors V1 (déjà en Server Actions, futures sous-routes `/api/me/*` si besoin)
Mémoire de Tamilya (`forgetMemoryAction`, `actions.ts:133-152`), adresse (`:99`), téléphone (`:116`), carnet d'adresses (`:157-194`), avis (`:196-216`).

## 5. Divers V1
| Opération | Source | État |
|---|---|---|
| Pages légales (confidentialité, groupe BTM, partenaires) | `API_BASE_URL` + `/confidentialite`, `/groupe-btm`, `/partenaires`, ouvertes dans le navigateur système | existe |
| Notification « nouvel appareil » après connexion | `POST /api/auth/device` (repose sur un cookie d'appareil, `src/app/api/auth/device/route.ts:18-31`) | Hors V1, sauf si C1 ajoute `X-Device-Id` |
| Détection de maintenance | Réponse 503 forme B de n'importe quel appel `/api/*` | existe |

## 6. Récapitulatif pour C1 (Backend)
1. Bearer dans `src/lib/supabase/server.ts` (cookie prioritaire, `getClaims(token)`, Bearer invalide → 401 et non invité).
2. Les routes `/api/chat`, `DELETE /api/conversations/{id}`, `POST /api/conversations` et `POST /api/auth/password-notice` fonctionnent ensuite sans autre modification. Tests à prévoir pour chacune.
3. Nouvelle route `/api/me` (GET, PATCH, DELETE) avec la logique extraite des Server Actions dans `src/lib/`.
4. Optionnel, si le mode invité est retenu : `X-Device-Id`.
5. Aucun déploiement.
