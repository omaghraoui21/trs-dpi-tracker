# Checklist de déploiement — Vercel + Railway + Supabase

Architecture cible :

```
Navigateur → Vercel (React SPA) → Railway (Express API) → Supabase (PostgreSQL)
```

---

## Étape 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New project**
2. Choisir région **EU West (Frankfurt)** ou **EU Central**
3. Noter le **mot de passe DB** à la création (non récupérable après)
4. Attendre la provision (~2 min)

### Récupérer les credentials

Dans **Settings > Database** :
- **Connection string > URI** → valeur pour `DATABASE_URL`
  - Utiliser le **Session mode pooler** (port `5432`)
  - ⚠ NE PAS utiliser Transaction mode (port `6543`) — Drizzle nécessite la session affinity

Dans **Settings > API** :
- **Project URL** → `SUPABASE_URL`
- **anon public** → `SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (backend uniquement, jamais dans Vercel)

---

## Étape 2 — Initialiser le schéma DB

**Option A** (recommandé — SQL Editor Supabase) :

1. Ouvrir Supabase > **SQL Editor**
2. Coller le contenu de `database/schema.sql` → **Run**
3. Coller le contenu de `database/seed.sql` → **Run** (données de référence)

**Option B** (Drizzle push depuis local) :

```bash
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
```

### Créer les utilisateurs avec bcrypt

```bash
# Configurer les mots de passe dans .env ou en inline
ADMIN_PASSWORD=MonMotDePasse \
SUPERVISOR_PASSWORD=MonMotDePasse2 \
OPERATOR_PASSWORD=MonMotDePasse3 \
DATABASE_URL="postgresql://..." \
pnpm --filter @workspace/scripts run seed-prod
```

---

## Étape 3 — Déployer le backend sur Railway

1. Aller sur [railway.app](https://railway.app) → **New Project > Deploy from GitHub repo**
2. Sélectionner `omaghraoui21/trs-dpi-tracker`
3. Railway détecte automatiquement le `Dockerfile` et `railway.toml`

### Variables d'environnement Railway

Dans **Railway > Variables**, ajouter :

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `DATABASE_URL` | `postgresql://postgres.[ID]:[PWD]@...supabase.com:5432/postgres` |
| `SESSION_SECRET` | `openssl rand -hex 32` (64 chars hex) |
| `ALLOWED_ORIGINS` | `https://[ton-app].vercel.app` (à remplir après déploiement Vercel) |
| `SUPABASE_URL` | `https://[PROJECT-ID].supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (secret) |

4. Une fois déployé, noter l'URL Railway : `https://[app].up.railway.app`
5. Vérifier : `curl https://[app].up.railway.app/api/healthz` → `{"status":"ok"}`

---

## Étape 4 — Déployer le frontend sur Vercel

1. Aller sur [vercel.com](https://vercel.com) → **Add New > Project**
2. Importer `omaghraoui21/trs-dpi-tracker`
3. Vercel détecte `vercel.json` automatiquement — **ne pas changer les settings**

### Variables d'environnement Vercel

Dans **Vercel > Settings > Environment Variables**, ajouter :

| Variable | Valeur | Scope |
|----------|--------|-------|
| `VITE_API_BASE_URL` | `https://[app].up.railway.app` | Production |

> ⚠ `VITE_API_BASE_URL` est injectée dans le bundle JS. Ne jamais y mettre de secret.

4. Cliquer **Deploy**
5. Une fois déployé, noter l'URL Vercel : `https://[app].vercel.app`

---

## Étape 5 — Connecter frontend ↔ backend (CORS)

1. Retourner dans **Railway > Variables**
2. Mettre à jour `ALLOWED_ORIGINS` avec l'URL Vercel exacte :
   ```
   ALLOWED_ORIGINS=https://[ton-app].vercel.app
   ```
3. Railway redéploie automatiquement

---

## Étape 6 — `VITE_API_BASE_URL` dans le frontend ✅ déjà implémenté

`artifacts/trs-app/src/main.tsx` appelle déjà `setBaseUrl(VITE_API_BASE_URL)` au démarrage.
Il suffit que la variable soit définie dans **Vercel > Settings > Environment Variables** (étape 4 ci-dessus).

Aucune modification de code requise.

---

## Étape 7 — Vérification finale

```bash
# 1. Health backend
curl https://[app].up.railway.app/api/healthz
# → {"status":"ok","db":"ok","uptime":...}

# 2. Login
curl -X POST https://[app].up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"MonMotDePasse"}'
# → {"token":"eyJ..."}

# 3. Frontend
# Ouvrir https://[app].vercel.app → page login doit s'afficher
# Se connecter → redirection vers /admin, /supervisor ou /entry selon le rôle
```

---

## Récapitulatif des URLs

| Service | URL |
|---------|-----|
| Frontend | `https://[app].vercel.app` |
| Backend API | `https://[app].up.railway.app/api` |
| Health check | `https://[app].up.railway.app/api/healthz` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/[PROJECT-ID]` |

---

## Troubleshooting

**CORS error dans le browser**
→ Vérifier `ALLOWED_ORIGINS` dans Railway correspond exactement à l'URL Vercel (avec `https://`, sans slash final)

**`DATABASE_URL must be set`**
→ Variable non injectée dans Railway. Vérifier le scope (Production vs tous les environments)

**Build Vercel échoue**
→ Vérifier que `pnpm run build:frontend` passe en local sans `PORT` ni `BASE_PATH`

**Login renvoie 401**
→ Le seed n'a pas été exécuté, ou les mots de passe ne correspondent pas. Re-lancer `seed-prod`



---

## Étape 8 — Appliquer les migrations DB (index)

Après le premier déploiement ou lors d'une mise à jour, exécuter dans **Supabase SQL Editor** :

```sql
-- Copier-coller le contenu de database/migrations/001_add_missing_indexes.sql
```

Ces index sont CONCURRENTLY — non-bloquants, peuvent tourner en prod sans downtime.

**Pourquoi ces index ?**
- `idx_monthly_closures_period` — `/api/monthly-closures?year=` sans scan séquentiel
- `idx_cadences_equipment` — lookup cadences par équipement dans les calculs TRS
- `idx_daily_entries_equipment_date` — requêtes mensuelles dashboard (getDailyBase)
- `idx_production_entries_date_status` — filtres composites du dashboard (date + status)
