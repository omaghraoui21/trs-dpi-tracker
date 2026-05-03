# Déploiement Vercel + Supabase

## Architecture cible

```
┌─────────────────────────────────────────────────────┐
│  Utilisateurs (navigateur)                          │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────┐
│  Vercel (Frontend React + API routes Edge/Node)     │
│  Domaine : app.dpi-trs.com                          │
└──────┬───────────────────────────────────────────────┘
       │ PostgreSQL (connection pooling via Supabase)
┌──────▼───────────────────────────────────────────────┐
│  Supabase PostgreSQL                                 │
│  Region : eu-west-1 (Frankfurt)                      │
│  Connection string : DATABASE_URL                    │
└──────────────────────────────────────────────────────┘
```

## Étape 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → New Project
2. Choisir région EU (Frankfurt ou Paris)
3. Récupérer dans Settings → Database :
   - **Connection string (URI)** → `DATABASE_URL`
   - **Anon key** → `SUPABASE_ANON_KEY`
   - **Service role key** → `SUPABASE_SERVICE_ROLE_KEY`

## Étape 2 — Initialiser le schéma

```bash
# Depuis le repo local, pointer vers Supabase
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres" \
  pnpm --filter @workspace/db run push

# Ou exécuter le SQL directement dans Supabase SQL Editor
psql $DATABASE_URL < database/schema.sql
psql $DATABASE_URL < database/seed.sql
```

## Étape 3 — Variables d'environnement

Créer un fichier `.env.production` (jamais commité) :

```env
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
SESSION_SECRET=your-secret-here-minimum-32-chars
JWT_SECRET=your-jwt-secret-here
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STORAGE_BUCKET=planning-files
NODE_ENV=production
```

## Étape 4 — Déployer sur Vercel

```bash
npm install -g vercel
vercel login

# Premier déploiement
vercel --prod

# Configurer les env vars sur Vercel :
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production
vercel env add JWT_SECRET production
```

### Configuration `vercel.json`

```json
{
  "framework": null,
  "buildCommand": "pnpm run build",
  "outputDirectory": "artifacts/trs-app/dist",
  "installCommand": "pnpm install",
  "functions": {
    "artifacts/api-server/src/index.ts": {
      "runtime": "nodejs20.x"
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "artifacts/api-server/src/index.ts" },
    { "src": "/(.*)", "dest": "artifacts/trs-app/dist/$1" }
  ]
}
```

## Étape 5 — Connection Pooling (recommandé)

Supabase propose PgBouncer sur le port 6543 :

```env
# Utiliser le port pooler pour les fonctions serverless
DATABASE_URL=postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true
```

## Row Level Security (RLS)

Pour activer RLS sur Supabase (recommandé phase 2) :

```sql
-- Activer RLS sur les tables sensibles
ALTER TABLE production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;

-- Exemple de policy : opérateurs voient leurs propres saisies
CREATE POLICY "operators_own_entries" ON production_entries
  FOR ALL TO authenticated
  USING (operator_id = auth.uid());

-- Superviseurs voient tout
CREATE POLICY "supervisors_all" ON production_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('supervisor', 'admin')
    )
  );
```

## Supabase Storage (fichiers Excel)

```bash
# Créer le bucket dans le tableau de bord Supabase
# Ou via API :
curl -X POST https://[project-id].supabase.co/storage/v1/bucket \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "planning-files", "name": "planning-files", "public": false}'
```

Intégration dans l'API (upload Excel → Storage) :

```typescript
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Upload fichier
const { data, error } = await supabase.storage
  .from("planning-files")
  .upload(`${year}/S${weekNumber}/${fileName}`, fileBuffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

// URL signée (7 jours)
const { data: url } = await supabase.storage
  .from("planning-files")
  .createSignedUrl(data!.path, 604800);
```
