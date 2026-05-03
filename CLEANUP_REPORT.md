# CLEANUP_REPORT.md — DPI TRS Tracker
## Audit avant production beta — Mai 2026

---

## Résumé

| Catégorie | Nombre |
|-----------|--------|
| Fichiers conservés (cœur production) | 52 |
| Dépendances inutiles supprimées | 0 |
| Mock data actives | 0 |
| Pages expérimentales | 0 |
| Logs console en production | 0 (pino logger) |
| Composants UI inutilisés | Quelques imports (tree-shakable) |
| Risques restants | 3 (voir section Risques) |

---

## Fichiers conservés — Cœur production beta

### Backend (`artifacts/api-server/`)
```
src/
├── index.ts                          ✅ Serveur Express + Pino logger
├── middlewares/auth.ts               ✅ JWT requireAuth / requireRole
├── lib/auth.ts                       ✅ JWT sign/verify (HS256)
├── lib/trs-engine.ts                 ✅ Moteur TRS NF E 60-182
├── routes/
│   ├── auth.ts                       ✅ Login / logout / me
│   ├── users.ts                      ✅ CRUD utilisateurs
│   ├── equipments.ts                 ✅ CRUD équipements
│   ├── products.ts                   ✅ CRUD produits
│   ├── cadences.ts                   ✅ Cadences par produit × équipement
│   ├── downtime-categories.ts        ✅ Référentiel types d'arrêts
│   ├── production-entries.ts         ✅ Saisie production (modèle legacy)
│   ├── downtime-events.ts            ✅ Arrêts liés aux saisies
│   ├── activities.ts                 ✅ Nouveau modèle activités multi-type
│   ├── dashboard.ts                  ✅ KPIs synthèse superviseur
│   ├── planning.ts                   ✅ Import Excel planning
│   ├── notifications.ts              ✅ Alertes
│   ├── monthly-closures.ts           ✅ Clôture mensuelle
│   ├── reports.ts                    ✅ Export Excel (ExcelJS, 8 feuilles)
│   ├── kpi-targets.ts                ✅ Objectifs KPI paramétrables
│   ├── calculation-formulas.ts       ✅ Formules TRS versionnées
│   ├── planning-mappings.ts          ✅ Mappings planning → activités
│   ├── notification-rules.ts         ✅ Règles alertes paramétrables
│   └── admin-config.ts               ✅ Chargement configuration DPI
scripts/
├── seed.ts                           ✅ Seed données de base
└── seed_dpi.ts                       ✅ Seed configuration DPI TERIAK EF
```

### Frontend (`artifacts/trs-app/`)
```
src/
├── pages/
│   ├── login.tsx                     ✅ Page login
│   ├── today.tsx                     ✅ Vue opérateur "Ma journée"
│   ├── entry.tsx                     ✅ Saisie production (legacy, conservé)
│   ├── supervisor.tsx                ✅ Tableau de bord superviseur + export Excel
│   ├── analysis.tsx                  ✅ Analyse TRS détaillée
│   ├── planning.tsx                  ✅ Import planning hebdo
│   ├── production.tsx                ✅ Cockpit responsable production
│   └── admin.tsx                     ✅ Administration complète (10 onglets + config DPI)
├── components/
│   ├── Layout.tsx                    ✅ Navigation sidebar (desktop + mobile drawer)
│   ├── ExportModal.tsx               ✅ Modal export Excel
│   ├── ProtectedRoute.tsx            ✅ Guard authentification
│   └── ui/                          ✅ shadcn/ui components (tree-shakable)
├── contexts/AuthContext.tsx          ✅ Contexte JWT
└── lib/
    ├── api-client-react/             ✅ Hooks React Query générés (Orval)
    └── trs-engine/                   ✅ Moteur TRS frontend
```

### Base de données (`lib/db/`) — 25 tables
```
schema/
├── sites.ts                          ✅
├── rooms.ts                          ✅
├── users.ts                          ✅
├── products.ts                       ✅
├── equipments.ts                     ✅
├── downtime-categories.ts            ✅ (45 catégories DPI)
├── cadences.ts                       ✅
├── planning-imports.ts               ✅
├── production-plans.ts               ✅
├── production-entries.ts             ✅ (modèle legacy conservé)
├── downtime-events.ts                ✅
├── activities.ts                     ✅ (nouveau modèle central)
├── activity-downtimes.ts             ✅
├── equipment-status-events.ts        ✅
├── room-status-events.ts             ✅
├── notifications.ts                  ✅
├── monthly-closures.ts               ✅
├── kpi-daily.ts                      ✅
├── kpi-monthly.ts                    ✅
├── audit-log.ts                      ✅
├── kpi-targets.ts                    ✅
├── calculation-formulas.ts           ✅
├── planning-activity-mappings.ts     ✅
├── notification-rules.ts             ✅
├── product-presentations.ts          ✅ (nouveau)
├── assembly-boms.ts                  ✅ (nouveau — Combifor)
└── standard-times.ts                 ✅ (nouveau — temps standards)
```

---

## Éléments désactivés / non activés en production beta

| Élément | Statut | Raison |
|---------|--------|--------|
| Éditeur avancé de formules (admin) | Lecture seule | Instable si formule invalide |
| Notifications WhatsApp | Non implémenté | Reporté post-beta |
| IA prédictive | Non implémenté | Reporté post-beta |
| Page mockup-sandbox | Désactivée (dev only) | Canvas de design interne |
| `issue_patterns` engine | Données seedées, UI à faire | Priorité P2 |
| `production_lot_history` | Table non créée | Priorité P2 |
| `product_unit_conversions` | Table non créée | Priorité P2 |
| Écran "Assemblage Combifor" | BOM seedé, UI à faire | Priorité P2 |
| Dashboard Gantt semaine | Priorité P2 | TRS cockpit existant suffisant |

---

## Risques restants avant production

### 🔴 Risque 1 — SESSION_SECRET
**Niveau** : Critique  
**Description** : Le secret JWT est stocké dans l'environnement Replit. En production Vercel, définir `SESSION_SECRET` dans les variables d'environnement Vercel et ne jamais le committer.  
**Action** : Configurer `SESSION_SECRET` dans Supabase/Vercel avant déploiement.

### 🟡 Risque 2 — Cadences géluleuse non confirmées
**Niveau** : Important  
**Description** : La cadence de la géluleuse Harro Höfliger n'est pas encore validée process. Le TRS géluleuse sera affiché "N/A" jusqu'à validation.  
**Action** : Saisir la cadence validée via Admin → Cadences après validation process.

### 🟡 Risque 3 — Tailles de lots Aeronide non confirmées
**Niveau** : Modéré  
**Description** : Les tailles de lots Aeronide 200 et 400 sont marquées "À confirmer". Le respect planning ne pourra pas être calculé précisément.  
**Action** : Valider les tailles de lots via Admin avant première production.

---

## Modules production beta — checklist

- [x] Login sécurisé JWT (HS256, expiry 8h)
- [x] Vue opérateur terrain "Ma journée" (timeline, quick actions)
- [x] Saisie arrêts simplifiée (8 types prédéfinis + durée rapide)
- [x] Dashboard superviseur (KPIs, graphiques, pending validations)
- [x] Import planning Excel
- [x] Export Excel professionnel (8 feuilles, formules réelles)
- [x] Page analyse TRS
- [x] Administration (utilisateurs, équipements, produits, cadences, arrêts)
- [x] Paramétrage avancé (formules TRS, objectifs KPI, règles alertes)
- [x] Configuration DPI TERIAK EF pré-chargée
- [x] Logger structuré (Pino, zéro console.log en production)
- [x] Zéro mock data visible opérateur
- [x] Auth middleware sur toutes les routes protégées

---

## Recommandations avant mise en production

1. **Valider cadence géluleuse** avec responsable process (saisir dans Admin → Cadences)
2. **Confirmer tailles lots** Aeronide 200/400 (Admin → Référentiels → Produits)
3. **Configurer SESSION_SECRET** en production (min 32 chars, aléatoire)
4. **Tester import planning** avec un fichier Excel réel de la semaine
5. **Créer utilisateurs réels** (supprimer/désactiver comptes de test après validation)
6. **Valider les objectifs KPI** dans Admin → Paramétrage → Objectifs KPI
7. **Vérifier les règles d'alertes** dans Admin → Paramétrage → Règles Alertes
8. **Tester export Excel** avec données réelles avant première réunion direction

---

*Généré le 2 mai 2026 — DPI TRS Tracker v1.0-beta*
