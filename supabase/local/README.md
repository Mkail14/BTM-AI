# Base locale de test et sauvegardes

Outils gratuits : PostgreSQL installé sur le poste, sans Docker ni offre payante.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm db:local` | Recrée la base locale `btm_test` : imitation de Supabase puis toutes les migrations |
| `pnpm db:tests-securite` | Recrée `btm_test`, ajoute les données fictives et joue les tests de droits d'accès |
| `pnpm db:sauvegarde -- --essai-local` | Joue toute la procédure de sauvegarde sur la base fictive (aucun accès à Supabase) |
| `pnpm db:sauvegarde` | Sauvegarde réelle de Supabase, en lecture seule (voir plus bas) |

Connexion au PostgreSQL local par le fichier `pgpass` de l'utilisateur, ou par
`LOCAL_PGHOST`, `LOCAL_PGPORT` et `LOCAL_PGUSER`. Les scripts refusent tout hôte qui n'est pas cette machine.

## Fichiers

- `00_supabase_stub.sql` : rôles `anon`, `authenticated` et `service_role`, droits par défaut de Supabase, `auth.uid()` et `auth.jwt()`, une table `auth.users` réduite.
- `10_donnees_fictives.sql` : trois comptes fictifs (Alice, Bruno, Admin) et leurs données.
- `20_tests_securite.sql` : tests de lecture et d'écriture pour chaque rôle. Résultat possible : `OK`, `ÉCHEC` (régression) ou `FAILLE CONNUE (Sn)` (faille de l'audit pas encore corrigée).
- `schema_fingerprint.sql` : empreinte du schéma. Lancée sur la base locale et sur Supabase, elle montre tout écart entre les fichiers de migration et la base réelle.

## Ce que la base locale prouve, et ce qu'elle ne prouve pas

**Testé localement :** la structure, les contraintes, les clés étrangères, les index, les déclencheurs, les fonctions, les droits des tables et des fonctions, et les politiques RLS. Les rôles visiteur, compte connecté et administrateur sont simulés comme le fait PostgREST (`SET ROLE` plus les revendications du jeton).

**Non testé localement :**

- **Supabase Auth** : signature et expiration des jetons, inscription, connexion, e-mails, mot de passe oublié, et le fait que `app_metadata` ne soit modifiable que par le serveur.
- **PostgREST**, c'est-à-dire l'API REST elle-même (filtres, en-têtes, fonctions exposées).
- **Realtime** (canal `admin-flow`) et Storage.
- Les extensions et réglages propres à Supabase.

## Vérifier sur Supabase Free sans exposer de données

1. **Comptes de test dédiés** : créer deux comptes avec des adresses fictives qui vous appartiennent, et ne jamais utiliser le compte d'un vrai utilisateur.
2. **API REST avec la clé publique** : depuis le poste, appeler `https://<projet>.supabase.co/rest/v1/<table>` avec la clé publishable et le jeton d'un compte de test. Vérifier qu'il ne voit que ses propres lignes, et que les écritures interdites renvoient 401, 403 ou 0 ligne.
3. **Lecture seule du catalogue** : comparer l'empreinte (`schema_fingerprint.sql`) avant et après chaque migration. On ne lit que la structure, jamais le contenu.
4. **Conseillers Supabase** (security et performance) après chaque migration.
5. Supprimer les données des comptes de test après vérification.

## Sauvegardes (offre Free : rien de téléchargeable côté Supabase)

1. Dans `.env.local` (jamais dans git), ajouter `SUPABASE_DB_URL`. On la trouve dans Supabase → Project Settings → Database → Connection string → **Session pooler**, en remplaçant `[YOUR-PASSWORD]` par le mot de passe de la base. Ne jamais la coller dans une discussion ou un ticket.
2. `pnpm db:sauvegarde` : la sauvegarde est écrite dans `../sauvegardes-btm/<date>/`, hors du dépôt. Elle contient :
   - la structure,
   - les données (comptes compris),
   - une archive complète,
   - les comptages de lignes,
   - les empreintes SHA-256.
3. Le script vérifie que chaque archive est lisible, la restaure dans la base locale `btm_restore_check` et compare les comptages. Supprimer ensuite `btm_restore_check`, qui contient de vraies données.

**Avant toute migration en production :** une sauvegarde vérifiée du jour même.

### Durée de conservation des sauvegardes

Les sauvegardes contiennent des données personnelles et les empreintes des mots de passe :

- garder **la sauvegarde d'avant chaque migration** jusqu'à ce que la migration soit validée, puis 30 jours ;
- garder **une sauvegarde par semaine pendant 8 semaines** au plus, et supprimer les plus anciennes ;
- une donnée effacée à la demande d'une personne disparaît des sauvegardes au plus tard quand celles-ci expirent (8 semaines). En cas de restauration, il faut la réeffacer ;
- garder les sauvegardes sur ce poste uniquement, avec une session Windows protégée par mot de passe. Pas de clé USB non chiffrée, pas de dossier partagé.
