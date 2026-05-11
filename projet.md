# TRS DPI Tracker - Etat du projet

Date: 2026-05-11

## Ressources

- Repo GitHub: `https://github.com/omaghraoui21/trs-dpi-tracker`
- Branche: `main`
- Frontend Vercel: `https://trs-dpi-tracker.vercel.app`
- API Railway: `https://api-server-production-022c.up.railway.app`
- Healthcheck API: `https://api-server-production-022c.up.railway.app/api/healthz`
- Supabase project ref: `vbgdtvbnnqxzdsoztmwv`
- Supabase project name: `dpi-trs-tracker`
- Supabase region: `eu-west-3`
- Railway project: `trs-dpi-tracker`
- Railway service: `api-server`
- Railway environment: `production`

## Etat actuel

- API healthcheck OK:

```json
{"status":"ok","db":"ok","version":"1.0.0"}
```

- Login admin API testé avec succès sur:

```text
POST https://api-server-production-022c.up.railway.app/api/auth/login
```

- Compte admin créé en base:

```text
email: omaghraoui@gmail.com
role: admin
is_active: true
```

Le mot de passe admin a été communiqué séparément. Ne pas le stocker dans le repo.

## Travail effectué

### 1. Railway DATABASE_URL

Le `DATABASE_URL` Railway initial pointait vers:

```text
db.vbgdtvbnnqxzdsoztmwv.supabase.co:5432
```

Puis une URL demandée manuellement avec `aws-0-eu-west-1.pooler.supabase.com` a été testée, mais elle ne fonctionne pas pour ce projet.

Erreur constatée en test direct:

```text
tenant/user postgres.vbgdtvbnnqxzdsoztmwv not found
```

La config officielle Supabase indique:

```text
region: eu-west-3
pooler host: aws-1-eu-west-3.pooler.supabase.com
db_user: postgres.vbgdtvbnnqxzdsoztmwv
```

Railway a donc été corrigé vers:

```text
postgresql://postgres.vbgdtvbnnqxzdsoztmwv:[PASSWORD]@aws-1-eu-west-3.pooler.supabase.com:5432/postgres
```

Après redéploiement Railway, `/api/healthz` est passé à `status=ok`, `db=ok`.

### 2. Supabase schema et seed

Le schéma `database/schema.sql` était déjà appliqué dans Supabase.

Le fichier `database/seed.sql` échouait sur l'insertion `equipments`, car l'alias `e` était utilisé dans le `JOIN rooms` avant d'être déclaré.

Correctif appliqué dans `database/seed.sql`:

- déplacer le bloc `VALUES (...) AS e(...)` avant le `JOIN rooms`
- utiliser `JOIN ... ON true`

Le seed corrigé a ensuite été exécuté avec succès via Supabase Management API.

### 3. Admin

Admin inséré/mis à jour via SQL Supabase:

- `email = omaghraoui@gmail.com`
- `role = admin`
- `is_active = true`
- hash bcrypt généré avec `pgcrypto crypt(..., gen_salt('bf', 12))`

Le login API direct a ensuite réussi.

### 4. Vercel

Le frontend Vercel n'avait pas de variable `VITE_API_BASE_URL`.

Variable ajoutée sur Vercel:

```text
VITE_API_BASE_URL=https://api-server-production-022c.up.railway.app
```

Targets:

- production
- preview
- development

Un redéploiement Vercel production a été lancé et terminé en `READY`.

### 5. Correction frontend pour les appels API directs

Le login marchait, mais certaines pages utilisaient encore `fetch("/api/...")` ou `import.meta.env.BASE_URL`, ce qui envoyait des appels API vers Vercel. Vercel répondait alors avec `index.html`, d'où l'erreur:

```text
Unexpected token '<', "<!DOCTYPE ..." is not valid JSON
```

Correctif poussé sur `main` dans le commit:

```text
993c54f Fix production API base URL usage
```

Fichiers corrigés:

- `artifacts/trs-app/src/components/ExportModal.tsx`
- `artifacts/trs-app/src/pages/admin.tsx`
- `artifacts/trs-app/src/pages/analysis.tsx`
- `artifacts/trs-app/src/pages/calendar.tsx`
- `artifacts/trs-app/src/pages/daily-entries.tsx`
- `artifacts/trs-app/src/pages/entry.tsx`
- `artifacts/trs-app/src/pages/planning.tsx`
- `artifacts/trs-app/src/pages/production.tsx`
- `artifacts/trs-app/src/pages/supervisor.tsx`

Le bundle Vercel déployé contient bien:

```text
https://api-server-production-022c.up.railway.app
```

Et ne contient plus le pattern problématique `BASE_URL.replace`.

## Probleme HTTP 500 traite

L'utilisateur indique maintenant:

```text
Erreur de chargement
HTTP 500 : Internal server error
```

Ce n'etait plus le même problème que `Unexpected token '<'`.

Interprétation:

- Le frontend appelle maintenant bien Railway.
- Railway renvoyait un vrai `500` sur plusieurs endpoints applicatifs.
- Cause racine: le schema Supabase applique depuis `database/schema.sql` etait plus ancien que le backend deploye. Plusieurs tables/colonnes attendues par les routes n'existaient pas encore.

Routes qui renvoyaient `500` avant hotfix:

```text
GET /api/downtime-categories
GET /api/formulas
GET /api/kpi-targets
GET /api/planning-mappings
GET /api/notification-rules
GET /api/admin/config-status
GET /api/dashboard/summary?month=5&year=2026
GET /api/dashboard/daily-trs?month=5&year=2026
GET /api/dashboard/equipment-comparison?month=5&year=2026
GET /api/dashboard/monthly-kpis?month=5&year=2026
GET /api/calendar-events?year=2026
GET /api/calendar-events/impact?year=2026&month=5
```

Exemple de manque confirme:

```text
downtime_categories.famille
downtime_categories.is_quick_shortcut
downtime_categories.shortcut_equipments
```

Tables manquantes ajoutees:

```text
calculation_formulas
calculation_formula_tests
kpi_targets
planning_activity_mappings
notification_rules
annual_calendar_events
daily_entries
standard_times
product_presentations
assembly_boms
```

Colonne ajoutee:

```text
production_entries.daily_entry_id
```

Migration appliquee via Supabase Management API:

```text
database/production-hotfix-2026-05-11.sql
```

Retest apres migration:

```text
Toutes les routes listees ci-dessus repondent 200 OK.
Healthcheck Railway: status=ok, db=ok.
```

## Prochain diagnostic recommande si une erreur reapparait

1. Reproduire dans le navigateur avec DevTools > Network.
2. Trouver la requête qui retourne `500`.
3. Noter:
   - URL exacte
   - méthode HTTP
   - payload
   - réponse JSON/texte
4. Lire les logs Railway du dernier deployment autour de cette requête.

Commandes/API utiles:

```powershell
Invoke-RestMethod -Uri "https://api-server-production-022c.up.railway.app/api/healthz"
```

Pour Railway GraphQL, utiliser le token projet comme `Project-Access-Token`, pas `Authorization: Bearer`.

Derniers IDs Railway connus:

```text
projectId: 3c73b79a-09b1-41aa-bba3-c8952ad6a033
environmentId: 6ad31abb-ac1d-4eb1-8be8-95ad412445d5
serviceId: 0e486897-9051-4b54-89a5-6164728aab8c
```

Exemple de query logs:

```graphql
query($deploymentId: String!) {
  deploymentLogs(deploymentId: $deploymentId, filter: "", limit: 200) {
    timestamp
    message
    severity
  }
}
```

## Notes importantes

- Ne pas remettre `aws-0-eu-west-1.pooler.supabase.com`: ce host ne correspond pas au projet Supabase actuel.
- Ne pas stocker les tokens Supabase/Railway/Vercel dans le repo.
- Ne pas stocker le mot de passe admin dans le repo.
- Le build local Windows a été bloqué par une dépendance optionnelle Rollup manquante (`@rollup/rollup-win32-x64-msvc`), mais Vercel Linux a buildé correctement après push GitHub.
- Le dossier local contient aussi `ops/fix-prod.ps1`, script opérationnel local non poussé à ce stade.
