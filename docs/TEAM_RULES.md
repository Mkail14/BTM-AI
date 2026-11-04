# Tamilya Mobile — Règles de l'équipe d'agents

## Emplacements
- **Dépôt web (source de vérité, LECTURE SEULE pendant l'audit)** :
  `C:\Users\aloal\Documents\Groupe BTM\BTM - Batir la Technologie de Mayotte`
  (Next.js 16 App Router, React 19, TS strict, Tailwind 4, Supabase Auth + Postgres RLS, 40 migrations, IA côté serveur via `src/lib/ai`). Remote : `github.com/Mkail14/BTM-AI`.
- **Projet mobile (espace de travail de l'équipe)** :
  `C:\Users\aloal\Documents\Groupe BTM\Nouveau dossier`
  - `PROJECT_CONTROL.md` / `TOKEN_BUDGET.md` : tenus **uniquement par l'orchestrateur**.
  - `docs/audit/NN-<agent>.md` : un rapport par agent, écrit par cet agent seul.

## Communication
- Les agents ne se parlent pas directement : ils écrivent leur rapport dans `docs/audit/`, l'orchestrateur le lit, arbitre et transmet le strict nécessaire aux agents suivants.
- Un agent qui a besoin d'une info hors de son périmètre la note dans « Questions pour l'orchestrateur » au lieu d'aller l'analyser lui-même.

## Règles de modification du code
1. Aucun agent ne modifie le dépôt web sans mission explicite validée par l'orchestrateur (et par l'utilisateur si backend/auth/migration).
2. Un fichier = un seul agent à la fois. Les périmètres sont attribués dans `PROJECT_CONTROL.md`.
3. Développement mobile : une branche Git par mission (`feat/<module>`), revue de l'orchestrateur avant fusion.
4. Jamais de modification des variables d'environnement de production, jamais de déploiement, jamais de publication store sans accord explicite de l'utilisateur.
5. **Secrets** : ne jamais recopier une valeur de clé/mot de passe/jeton dans un rapport ou un message. Citer seulement le nom de la variable et le fichier.
6. **Commits : jamais `git add -A` ni `git add .`.** Ajouter uniquement les chemins de sa mission (ex. `git add tamilya_mobile/ docs/missions/<sa-mission>.md`). `PROJECT_CONTROL.md`, `TOKEN_BUDGET.md` et les rapports des autres agents ne sont jamais commités par un agent.
7. Architecture centrale : décidée par l'orchestrateur sur proposition de l'architecte.

## Format de rapport obligatoire (concis, vérifiable)
```
# <Agent> — <mission>
## Résumé (5 lignes max)
## Constats (chaque constat cite fichier:ligne)
## Décisions / recommandations (priorisées P0/P1/P2)
## Fichiers modifiés (normalement : aucun pendant l'audit)
## Vérifications effectuées (commandes lancées, résultats)
## Non résolu / questions pour l'orchestrateur
## Dépendances avec d'autres agents
```
