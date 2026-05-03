# DPI TRS/OEE Tracker

## Overview

Full-stack pharmaceutical OEE/TRS tracking application for DPI production units.
- **Standard**: NF E 60-182 (TRS = DO × TP × TQ)
- **Three roles**: Operator (/entry), Supervisor (/supervisor), Admin (/admin)
- **Portability**: zero Replit dependency — deployable on Vercel + Supabase or any company PostgreSQL server

## Recent Changes

- **Étape 4 — Intégration fiches dans la page Analyse (2026-05)**:
  - Page Analyse (onglet Mensuel) : les KPI TRS/DO/TP/TQ/TRG sont maintenant récupérés via `GET /api/dashboard/monthly-kpis` (V2 auto si fiches existent, V1 sinon).
  - **Badge source** : badge vert "Calculé sur fiches journalières" ou gris "Calculé sur postes de production" affiché au-dessus des KPI cards selon le champ `source` de l'API.
  - **Tableau détail journalier** : quand un équipement est sélectionné + fiches existent → tableau par jour montrant tO / tAP / tR (fiche) + nombre de lots / Σ tU (production) / TRS du jour = tU/tR, avec code couleur vert/orange/rouge.
  - KPI cards : sous-titre enrichi (objectif TRS + tR total en minutes).
  - Squelette de chargement (animate-pulse) pendant le fetch initial des KPIs.
  - Interfaces TypeScript ajoutées : `MonthlyKpisResult`, `DailySummaryDay`, `DailySummaryResult`.

- **Étape 3 — Page Fiches Journalières (2026-05)**:
  - Nouvelle page `/daily-entries` (superviseur/admin) : calendrier mensuel complet avec saisie tO, Pause, CHSG, APR, MQCH par équipement et par jour.
  - Calendrier visuel mois/équipement : jours colorés (vert=validé, ambré=brouillon, gris=non saisi). Clic sur + pour créer, icônes crayon/corbeille par case.
  - KPI cards mensuels : Σ tO, Σ tAP, Σ tR + barre de progression (jours saisis / jours du mois).
  - Dialogue de saisie : calcul temps réel tAP et tR à la saisie ; alerte si tAP > tO ; bouton "Valider la fiche" pour superviseurs.
  - Nav item "Fiches Journalières" (icône BookOpen) ajouté dans le sidebar entre Planning et Calendrier Annuel.
  - Route `/daily-entries` protégée (rôles supervisor + admin).

- **Étape 2 — Moteur TRS V2 — dénominateur journalier (2026-05)**:
  - Colonne `daily_entry_id` (nullable FK) ajoutée à `production_entries` (DB + Drizzle schema).
  - Nouveau `calculateMonthlyTrsV2(dailyBase, prodMetrics, trsObjective)` dans `trs-engine.ts` : Σ(tR) provient des `daily_entries` (tous les jours du mois, y compris non-production), Σ(tU/tF/tN) depuis les entrées production — fidèle au modèle Excel NF E 60-182.
  - Helpers `getDailyBase()` + `getMonthlyTrsResult()` dans `dashboard.ts` : si des fiches journalières existent → V2 (source:"daily"), sinon → V1 legacy (source:"production"). Les 4 routes mensuelles (summary, monthly-kpis, equipment-comparison, annual-trs) utilisent ce mécanisme hybride.
  - Corrections TypeScript pre-existantes : cast `String(id)` dans `daily-entries.ts` et `calendar-events.ts`.

- **Étape 1 — Table `daily_entries` + API CRUD (2026-05)**:
  - Table `daily_entries` (equipment_id + entry_date unique, tO/pause/CHSG/APR/MQCH, status enum draft/validated).
  - API CRUD complète : `GET/POST /api/daily-entries`, `GET/PATCH/DELETE /api/daily-entries/:id`, `GET /api/daily-entries/monthly-summary`.
  - `computeDailyOee()` retourne tT/tO/fermeture/tAP/tR sur chaque réponse.

- **Semaine 4 — Préparation production finale (2026-05)**:
  - **Graceful shutdown** : `index.ts` gère SIGTERM/SIGINT — `server.close()` drain les connexions HTTP (10 s max), puis `db.$client.end()` ferme le pool Postgres, enfin `process.exit(0)`. `unhandledRejection` et `uncaughtException` déclenchent aussi le shutdown propre.
  - **Health check enrichi** : `GET /api/healthz` sonde maintenant la DB (`SELECT 1`, timeout 2 s). Répond `{ status, db, uptime, version, dbLatencyMs }`. Retourne HTTP 503 si la DB est inaccessible (status: "degraded").
  - **Toast global React Query** : `QueryCache.onError` + `MutationCache.onError` dans `App.tsx` — les erreurs réseau/500 inattendues déclenchent un toast destructif. Les 401 sont exclus (gérés par `AuthContext`).
  - **Audit trail** : helper `lib/audit.ts` avec `writeAudit()` (fire-and-forget, non-bloquant). Branché sur : `POST /auth/login` (succès), `PATCH /users/:id/reset-password`, `POST /production-entries` (création), `DELETE /production-entries/:id`, `POST /production-entries/:id/validate` (validate + reject).
  - **`.env.example`** : fichier de référence complet avec toutes les variables requises/optionnelles, instructions de génération `SESSION_SECRET`.

- **Semaine 3 — Qualité frontend + validation + outils (2026-05)**:
  - **ErrorBoundary** : composant `ErrorBoundary` (classe React) avec UI de fallback en français. Chaque page protégée dans `App.tsx` est enveloppée individuellement.
  - **Code splitting** : toutes les pages migrées vers `React.lazy()` + `Suspense` (spinner centré). Bundle initial allégé.
  - **Zod validation POST /production-entries** : `CreateEntrySchema` remplace le cast manuel — format date `YYYY-MM-DD`, UUID, `HH:MM`, quantités ≥ 0, règle métier conformes+rejetées ≤ produites. Doublons → HTTP 409.
  - **Réinitialisation mot de passe** : route `PATCH /api/users/:id/reset-password` (admin) + bouton cadenas (ambré) dans l'onglet Utilisateurs de l'admin avec dialogue dédié.
  - **Seed production** : `scripts/src/seed-production.ts` — crée 3 comptes (bcrypt 12 rounds), refuse si la base n'est pas vide, mots de passe via env vars.

- **Semaine 2 — Stabilité et qualité (2026-05)**:
  - **N+1 queries supprimées** : `getEntriesWithMetrics()` dans `dashboard.ts` fait maintenant exactement 2 requêtes SQL (toutes les downtimes + toutes les cadences en batch `inArray`) au lieu de 2N requêtes en boucle. `daily-trs` et `weekly-trs` utilisent le même `batchFetchMetadata()`. Temps de réponse dashboard : < 60ms.
  - **Erreurs Postgres 409** : helper `lib/db-errors.ts` avec `isUniqueViolation()` qui gère le wrapping Drizzle (`err.cause.code === "23505"`). Routes `users.ts` et `products.ts` retournent HTTP 409 avec message lisible sur doublon.
  - **Limite 500 explicite** : `GET /production-entries` ajoute `X-Has-More: true` dans les headers si la limite de 500 enregistrements est atteinte.
  - **Cascade FK** : `downtime_events.entry_id → production_entries.id` a `ON DELETE CASCADE` dans le schéma Drizzle + migration appliquée en base (`drizzle-kit push`).

- **Semaine 1 — Corrections bloquantes pré-production (2026-05)**:
  - **JWT jose** : remplacement de l'implémentation JWT maison (crypto Node) par la librairie `jose` (RFC-compliant). `signToken` et `verifyToken` sont maintenant async. `SESSION_SECRET` doit faire ≥ 32 caractères (vérification au démarrage).
  - **Autorisation downtime** : `canWriteEntry()` helper ajouté dans `downtime-events.ts` — les routes POST/PATCH/DELETE vérifient que l'opérateur est bien propriétaire du lot (`entry.operatorId === user.id`). Superviseur et admin contournent la vérification. Retour HTTP 403 si accès refusé.
  - **Transaction DB** : `DELETE /production-entries/:id` enveloppe maintenant la suppression des arrêts + du lot dans un `db.transaction()` atomique — plus de risque d'état incohérent si une des deux requêtes échoue.


- **Auth + raccourcis admin-configurables (2026-05)**:
  - `apiFetch` dans `entry.tsx` inclut désormais `Authorization: Bearer ${token}` — toutes les actions arrêts (start/stop/add/delete) fonctionnaient mais retournaient 401 sans ce header.
  - DB migration: colonnes `is_quick_shortcut BOOLEAN` et `shortcut_equipments TEXT` ajoutées à `downtime_categories`.
  - Drizzle schema (`lib/db/src/schema/downtime-categories.ts`) mis à jour avec les nouveaux champs.
  - API `formatCategory` expose `isQuickShortcut` + `shortcutEquipments`; PATCH/POST gèrent ces champs.
  - 9 raccourcis semés: AG/ALIM_GEL/CHSG→A27, AB/CHG_ALU/CHG_PVC→A28, NET_MIN_EQ/ATTENTE-MAT/PAUSE→tous.
  - Admin.tsx onglet Catégories: toggle "Raccourci rapide" + champ équipements dans le formulaire; colonne "Raccourci" dans le tableau.
  - `entry.tsx` `quickDtCodes` maintenant piloté par la DB (filtre `isQuickShortcut` + `shortcutEquipments`).
  - Planning PATCH route retourne désormais l'objet complet (plus uniquement `{id}`).
  - Mots de passe utilisateurs re-seedés avec bcrypt paramétré (les hashes `$` corrects).
- **Operator UX — adaptive quantity & cadence tracking (2026-05)**:
  - `EQUIP_CFG` map: A27 (gélules, lot=360 000, boutons +10k/+50k/+100k/+360k, cadence en gél/min), A28 (blisters, lot=36 000, boutons +1k/+5k/+10k/+36k). `DEFAULT_CFG` pour les autres équipements.
  - Cadence DB: 5 enregistrements insérés pour Géluleuse A27 + produits DPI (61 200 gél/h = 1 020 gél/min).
  - Compteur lot par produit: `GET /production-entries/next-batch-number?productId=xxx` — chaque produit a son propre compteur YYNNN séquentiel.
  - LotStartForm: numéro de lot suggéré dès la sélection du produit; carte "Taille de lot" affichée selon l'équipement sélectionné.
  - LotActiveTracker: titre section "Quantités · gélules/blisters/unités"; barre de progression lot (avancement %); cadence affichée en gél/min ou u/h selon équipement.
  - Suivi cadences intra-poste: `cadenceChanges[]` remplace `cadenceOverride`; chaque changement enregistré avec heure; TRS calculé via moyenne pondérée par le temps (`computeWeightedCadence`); historique visible dans la modale.
  - Raccourcis arrêts pré-programmés: chips par équipement (A27: AG/ALIM_GEL/NET_MIN_EQ/CHSG, A28: AB/CHG_ALU/CHG_PVC/NET_MIN_EQ); clic ouvre une modale durée (5'/10'/15'/30'/custom) et enregistre directement le micro-arrêt.
- **Equipment cleanup (2026-05)**: All old equipments deactivated. 5 real DPI equipments active: A23/Box A23 (TRS obj=85), D08/Salle D08 (85), D18/Salle D18 (85), A27/Géluleuse HH (80), A28/Blistéreuse (80). production.tsx DPI_EQUIPMENTS updated to match.
- **Lot numbering (2026-05)**: `GET /production-entries/next-batch-number` — returns next `YYNNN` suggestion (e.g. 26001). LotStartForm auto-fetches and pre-fills the batch number field with a "suggéré automatiquement" badge.
- **Shift UX (2026-05)**: LotStartForm horaire redesign — Standard shown directly as default card; "Autres horaires (Ramadan/exceptionnel)" in a collapsible section (`ChevronDown`).
- **Pause reminder (2026-05)**: `LotActiveTracker` shows an amber `AlarmClock` banner during 12h–13h, dismissible. Checked every 60s via `setInterval`.
- **Analysis — period tabs (2026-05)**: 3-tab selector `Mensuel | Hebdomadaire | Annuel`. Mensuel keeps existing pareto+table. Hebdo/Annuel use `TrsPeriodView` component (fetches `/api/dashboard/weekly-trs` or `/api/dashboard/annual-trs` with `apiGet` helper using localStorage JWT). Each view shows KPI strip + bar chart + data table.
- **Backend: annual-trs + weekly-trs (2026-05)**: `GET /dashboard/annual-trs?year=&equipmentId=` returns 12 monthly aggregates. `GET /dashboard/weekly-trs?year=&equipmentId=` groups entries by ISO week and returns per-week TRS.
- **Live lot tracking refactor (2026-05)**: Complete rewrite of the production workflow — lot en cours tracker (entry.tsx), non-blocking supervisor review (supervisor.tsx), TRS includes submitted+validated entries.
- **Status semantics**: draft=lot actif, submitted=clôturé (TRS-inclus), validated=revu superviseur, rejected=avec anomalie. No DB migration needed.
- **Live downtime**: `POST /downtime-events/start` opens an arrêt (status=open, endTime=startTime); `PATCH /downtime-events/:id/stop` closes it.
- **Dashboard TRS filter**: Changed from `status="validated"` to `status IN ("submitted","validated")` across all dashboard routes.
- **entry.tsx — Lot en cours tracker**: 3-view flow (LotListView → LotStartForm → LotActiveTracker); live arrêt timer, quick qty (+100/+500/+1000/+5000), micro-arrêt modal, cadence override, real-time TRS preview, clôturer confirmation.
- **supervisor.tsx — Revue/Corrections**: Renamed from Validation; non-blocking actions (Marquer revu / Signaler anomalie); triple TRS check (TRS temps, DO×TP×TQ, coherence badge); loss decomposition bars (planifié/non-planifié/sous-perf/non-qualité/utile); 3 Pareto tabs (Détail/Famille/Type).
- **TRS consolidé**: Renamed from "TRS moyen" (production.tsx) and "TRS Mensuel" (analysis.tsx, supervisor.tsx). Nav: "Saisie de Production"→"Lot en cours", "Tableau de Bord"→"Revue / Corrections".
- **`famille` field on downtime categories**: New text column (values: Arrêts non planifiés, Problèmes de qualité, Arrêt technique, Attente et transition, Utilités). Exposed in admin form (dropdown) and in categories table.
- **Pareto chart in Analysis page**: Full Pareto analysis section with `groupBy` filter (Détaillé / Par famille / Par type), optional planned/unplanned filter, ComposedChart (bars + cumulative % line), 80% reference line, and summary table.
- **Pareto API**: `/dashboard/downtime-pareto` now accepts `groupBy` (detail|famille|type) and `isPlanned` (boolean) query params.
- **Soft-delete**: Equipments, products, and downtime categories support soft-delete (sets `isActive=false`).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 18 + Vite + Tailwind + shadcn/ui + Recharts
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec`)
- **Auth**: JWT (HS256) — token stored in localStorage as `auth_token`

## Seed Credentials (development)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dpi.local | admin123 |
| Supervisor | superviseur@dpi.local | super123 |
| Operator | operateur@dpi.local | oper123 |

Re-seed with:
```bash
/home/runner/workspace/scripts/node_modules/.bin/tsx artifacts/api-server/src/scripts/seed.ts
```

## Workspace Structure

```
artifacts/
  api-server/       — Express API (port 8080, routes under /api)
  trs-app/          — React frontend (Vite, port from $PORT)
  mockup-sandbox/   — Component preview server (Canvas)
lib/
  db/               — Drizzle schema + migrations (composite lib)
  api-spec/         — OpenAPI 3.0 spec + Orval codegen config
  api-client-react/ — Generated React Query hooks + Zod schemas
  trs-engine/       — NF E 60-182 TRS calculation engine
  auth/             — JWT sign/verify helpers
database/
  schema.sql        — Portable schema SQL (generated from Drizzle)
  seed.sql          — Reference seed SQL (dev/staging)
docs/
  data_model.md             — Entity diagram + UUID key design
  calculation_rules.md      — TRS/OEE formula (NF E 60-182)
  deployment_vercel_supabase.md  — Vercel + Supabase deployment guide
  migration_to_company_server.md — On-premise PostgreSQL migration guide
```

## Database Schema (PostgreSQL) — 28 tables, all UUID PKs

### Reference tables
- `roles` — permission definitions (jsonb)
- `sites` — production sites (code unique)
- `rooms` — clean rooms per site
- `users` — operator/supervisor/admin (bcrypt, role enum)
- `products` — pharmaceutical products (code unique)
- `equipments` — production machines (FK → sites, rooms)
- `downtime_categories` — downtime cause taxonomy (NF E 60-182 impact types: tO/tR/tF/tN/tU/TQ)

### Cadence historization
- `cadences` — theoretical + validated cadence per (product, equipment); unique on `(product_id, equipment_id, valid_from)`; `valid_to = NULL` = active

### Planning
- `planning_imports` — Excel import metadata
- `production_plans` — weekly plan rows (columns: `plannedDate`, `equipmentName`, `roomName`)

### Production
- `production_entries` — shift records (UUID FK → equipment, product, operator)
- `downtime_events` — downtime periods per entry (duration_minutes computed)
- `monthly_closures` — monthly TRS sign-off
- `notifications` — alerts (severity: info/warning/critical)

### Status tracking
- `equipment_status_events` — equipment timeline
- `room_status_events` — room timeline

### KPI aggregation
- `kpi_daily` — pre-computed daily TRS/DO/TP/TQ per equipment+product
- `kpi_monthly` — monthly aggregation

### Audit
- `audit_log` — who changed what + old/new values (jsonb)

### Activities (added 2026-05) — core model
- `activities` — central multi-type, multi-day activity table; replaces production_entries as the primary operational model. Enums: activityType (15 types: production/nettoyage_*/maintenance_*/qualification/calibration/attente_*/hors_production/jour_off), activityFamily (7 families), activityStatus (10 states: planned→in_progress→paused→completed→validated), activitySource, planningOrigin. Supports full datetime for multi-day spans. Nullable product/lot/quantity fields for non-production activities.
- `activity_downtimes` — simplified downtime events linked to activities; uses quickType text label (preset buttons) + full timestamp + auto-computed durationMinutes.

### DPI Beta additions (added 2026-05)
- `product_presentations` — presentations per product (boîte 30/60, pochette Combifor, blister); flags: isCombiforComponent, isCombiforFinishedProduct, needsConfirmation, validationStatus (provisional/confirmed)
- `assembly_boms` — Bill of Materials for Combifor assemblage: parent_presentation → component_presentation × quantityRequired; pre-seeded for Combifor 12/200 and 12/400
- `standard_times` — parametrable reference durations per activityType × equipment × room × product; needsConfirmation badge for unvalidated standards

### Parameterization (added 2026-05)
- `calculation_formulas` — versioned TRS/OEE formulas (NF E 60-182); each new version deprecates the previous; columns: indicatorCode, formulaExpression, version, validationStatus (draft/validated/deprecated)
- `calculation_formula_tests` — test run history per formula (inputs JSON, result, status: pass/fail/error)
- `kpi_targets` — KPI objectives per (kpiCode, equipmentId, productId) with priority cascade; supports warningThreshold + criticalThreshold
- `planning_activity_mappings` — maps Excel planning labels → equipment + activity type; flags: isProductive, excludedFromTrs, triggersStatus
- `notification_rules` — configurable alert rules (conditionExpression, severity: info/warning/critical, targetRoles, inAppEnabled, emailEnabled)

## API Routes

All routes prefixed `/api`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/login | public | JWT login |
| GET | /users | admin | List users |
| POST | /users | admin | Create user |
| PATCH | /users/:id | admin | Update user |
| DELETE | /users/:id | admin | Deactivate user |
| GET | /equipments | any | List equipments |
| POST | /equipments | admin | Create equipment |
| PATCH | /equipments/:id | admin | Update equipment |
| GET | /products | any | List products |
| POST | /products | admin | Create product |
| GET | /cadences | any | List cadences |
| POST | /cadences/upsert | admin | Upsert cadence |
| GET | /downtime-categories | any | List categories |
| POST | /downtime-categories | admin | Create category |
| GET | /production-entries | auth | List entries |
| POST | /production-entries | auth | Create entry |
| PATCH | /production-entries/:id | auth | Update entry |
| POST | /production-entries/:id/submit | operator | Submit entry |
| POST | /production-entries/:id/validate | supervisor | Validate/reject |
| GET | /downtime-events | auth | List events |
| POST | /downtime-events | auth | Create event |
| DELETE | /downtime-events/:id | auth | Delete event |
| GET | /notifications | auth | List notifications |
| POST | /notifications | supervisor | Create notification |
| PATCH | /notifications/:id | auth | Acknowledge/close |
| POST | /planning/parse | supervisor | Parse Excel (preview) |
| POST | /planning/import | supervisor | Save plan rows |
| GET | /planning | auth | List plans |
| GET | /planning/today | auth | Today's plans |
| PATCH | /planning/:id/validate | supervisor | Validate plan row |
| GET | /dashboard/summary | supervisor | Monthly KPI summary |
| GET | /dashboard/daily-trs | supervisor | Daily TRS chart data |
| GET | /dashboard/downtime-pareto | supervisor | Pareto chart |
| GET | /dashboard/equipment-comparison | supervisor | Multi-equipment compare |
| GET | /dashboard/monthly-kpis | supervisor | TRS/DO/TP/TQ aggregation |
| GET | /dashboard/pending-validations | supervisor | Entries awaiting validation |
| GET | /activities/today | auth | Today's activities overlapping current date |
| GET | /activities | auth | List activities (filters: date, equipment, status, type) |
| POST | /activities | auth | Create activity (auto-derives family, productive, impactsTrs) |
| GET | /activities/:id | auth | Get single activity with downtimes |
| PATCH | /activities/:id | auth | Update activity fields |
| POST | /activities/:id/start | auth | Start activity (→ in_progress, sets actualStartDatetime) |
| POST | /activities/:id/pause | auth | Pause activity (→ paused) |
| POST | /activities/:id/complete | auth | Complete activity (→ completed, auto-computes durationMinutes) |
| POST | /activities/:id/submit | auth | Submit completed activity to supervisor |
| POST | /activities/:id/validate | supervisor | Validate or reject activity |
| POST | /activities/:id/quantity | auth | Quick quantity update with anti-error check |
| POST | /activities/:id/downtimes | auth | Add downtime (quickType + duration) |
| DELETE | /activities/:id/downtimes/:id | auth | Soft-delete downtime |
| POST | /reports/export | supervisor | Generate .xlsx Excel report (ExcelJS, 8 sheets) |
| GET | /formulas | auth | List TRS formulas (auto-seeded NF E 60-182) |
| POST | /formulas | admin | Create new formula version (deprecates previous) |
| POST | /formulas/:id/validate | admin | Validate formula (draft → validated) |
| POST | /formulas/:id/test | auth | Test formula with variable inputs |
| GET | /kpi-targets | auth | List KPI objectives |
| POST | /kpi-targets | admin | Create KPI target |
| PATCH | /kpi-targets/:id | admin | Update target |
| DELETE | /kpi-targets/:id | admin | Deactivate target |
| GET | /planning-mappings | auth | List planning activity mappings |
| POST | /planning-mappings | admin | Create mapping |
| PATCH | /planning-mappings/:id | admin | Update mapping |
| DELETE | /planning-mappings/:id | admin | Deactivate mapping |
| GET | /notification-rules | auth | List alert rules (auto-seeded with 7 defaults) |
| POST | /notification-rules | admin | Create alert rule |
| PATCH | /notification-rules/:id | admin | Update/toggle rule |

## Key Architecture Decisions

- **UUID PKs everywhere**: `uuid("id").primaryKey().defaultRandom()` in all 19 tables — portable across DB engines, no serial ID leakage
- **Contract-first API**: OpenAPI spec → Orval codegen → Zod schemas + React Query hooks; all ID params have `format: uuid`
- **Cadence historization**: unique constraint on `(product_id, equipment_id, valid_from)`; `valid_to = NULL` marks active cadence
- **Planning columns**: renamed from `date/equipment/room` → `plannedDate/equipmentName/roomName` to avoid SQL reserved words and clarify semantics
- **TRS engine**: `lib/trs-engine` implements NF E 60-182 in pure TypeScript (no DB dependency)
- **No Replit lock-in**: `database/schema.sql` + `database/seed.sql` allow deployment on any PostgreSQL ≥ 14 instance

## QA Infrastructure (v0.9.0-beta — 2026-05-02)

- **65 tests unitaires Vitest** — `pnpm test` (trs-engine.test.ts)
- **Rapport QA complet** — dossier `/qa/` (19 rapports)
- **Décision QA:** 🟡 GO CONDITIONNEL (2 bloquants résolus)
  - B-01 FIXED: Validation quantité vs cadence dans `POST /activities/:id/quantity`
  - B-02: Documenter changement mots de passe avant go-live
- **Env examples:** `.env.example`, `.env.qa.example`, `.env.production.example`

## Common Commands

```bash
# Validation production complète (typecheck + tests + builds)
pnpm run validate:production

# Tests unitaires TRS
pnpm test
pnpm test:watch
pnpm test:coverage

# Full typecheck
pnpm run typecheck

# DB push (after schema change)
pnpm --filter @workspace/db run push

# Codegen (after OpenAPI change)
pnpm --filter @workspace/api-spec run codegen

# Generate migration SQL (REQUIRED before production deployment)
pnpm --filter @workspace/db exec drizzle-kit generate
```
