# DPI TRS Tracker

Suivi du TRS/OEE pour les équipements pharmaceutiques du site DPI El Fejja (NF E 60-182).

## Architecture

```
Frontend (Vercel)  →  Backend API (Railway)  →  Database (Supabase PostgreSQL)
```

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Vite 7, TailwindCSS 4, Radix UI, Recharts |
| Backend | Express 5, Node.js 22, Drizzle ORM |
| Base de données | PostgreSQL 16 (Supabase) |
| Monorepo | pnpm workspaces |

## Structure du repo

```
trs-dpi-tracker/
├── artifacts/
│   ├── api-server/      — Backend Express (déployé sur Railway)
│   └── trs-app/         — Frontend React SPA (déployé sur Vercel)
├── lib/
│   ├── db/              — Schéma Drizzle + connexion PostgreSQL
│   ├── api-zod/         — Schémas de validation Zod (générés par Orval)
│   ├── api-spec/        — Spec OpenAPI
│   └── api-client-react/ — Client HTTP React Query
├── database/            — schema.sql + seed.sql (bootstrap DB)
├── scripts/             — Scripts de seed production
└── docs/                — Documentation déploiement
```

## Démarrage local

### Prérequis

- Node.js 22+
- pnpm 10+
- PostgreSQL (local ou Supabase)

### Installation

```bash
pnpm install
cp .env.example .env
# Éditer .env avec votre DATABASE_URL et SESSION_SECRET
```

### Développement

```bash
# Backend (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Frontend (port 3000)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/trs-app run dev
```

### Commandes utiles

```bash
pnpm run typecheck        # Vérification TypeScript
pnpm run test             # Tests unitaires (vitest)
pnpm run lint             # ESLint + TypeScript
pnpm run lint:fix         # Auto-fix ESLint
pnpm run build:frontend   # Build Vercel
pnpm --filter @workspace/api-server run build  # Build Railway
```

## Déploiement

Voir [`docs/deployment_checklist.md`](docs/deployment_checklist.md) pour le guide complet Vercel + Railway + Supabase.

## URLs de production

| Service | URL |
|---------|-----|
| Frontend | https://trs-dpi-tracker.vercel.app |
| API Health | https://api-server-production-022c.up.railway.app/api/healthz |

## Variables d'environnement

Voir [`.env.production.example`](.env.production.example) pour la liste complète.

## Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| `operator` | Saisie des entrées de production |
| `supervisor` | Validation + tableau de bord |
| `admin` | Administration complète |
