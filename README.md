# DPI TRS Tracker

Suivi du TRS/OEE pour les équipements pharmaceutiques du site DPI El Fejja (NF E 60-182).

DPI TRS Tracker is also an open-source learning and maintenance project for pharmaceutical manufacturing operations. It is maintained from a real production background: pharmacist, pharmaceutical production manager, and AI-assisted software builder.

## Open-source readiness

Start here if you are reviewing or contributing to the project:

| Area | Link |
|---|---|
| Maintainer strategy | [docs/maintainer-strategy.md](docs/maintainer-strategy.md) |
| TRS/OEE calculation examples | [docs/trs-calculation-examples.md](docs/trs-calculation-examples.md) |
| TRS/OEE test strategy | [docs/trs-test-strategy.md](docs/trs-test-strategy.md) |
| GMP validation posture | [docs/gmp-validation-posture.md](docs/gmp-validation-posture.md) |
| Fictional demo data | [demo-data/README.md](demo-data/README.md) |
| Contributing guide | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Roadmap | [roadmap.md](roadmap.md) |
| Initial backlog | [issues.md](issues.md) |
| License | [LICENSE](LICENSE) |

## Responsible GMP note

This project is open-source decision-support software. It is not validated GMP software by default. Any regulated use requires site-specific validation, QA approval, access control review, audit-trail assessment, controlled master data, training, and change control.

The public repository uses fictional/demo data only and must not contain confidential product, batch, supplier, employee, patient, or site-sensitive information.

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
├── demo-data/           — données fictives pour exemples publics
├── scripts/             — Scripts de seed production
└── docs/                — Documentation projet, GMP, calculs et maintenance
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

## Tests

The TRS/OEE engine has Vitest coverage, including edge cases for missing cadence, invalid time windows, downtime boundaries, and monthly V2 daily-entry consolidation.

Key files:

- [artifacts/api-server/src/lib/trs-engine.ts](artifacts/api-server/src/lib/trs-engine.ts)
- [artifacts/api-server/src/__tests__/trs-engine.test.ts](artifacts/api-server/src/__tests__/trs-engine.test.ts)
- [artifacts/api-server/src/__tests__/trs-engine-edge-cases.test.ts](artifacts/api-server/src/__tests__/trs-engine-edge-cases.test.ts)

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
