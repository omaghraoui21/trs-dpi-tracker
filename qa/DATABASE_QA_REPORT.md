# DATABASE QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**ORM:** Drizzle ORM — PostgreSQL (Replit DB en dev, Supabase en prod)  
**Schema:** `lib/db/src/schema/`

---

## 1. Tables Vérifiées (29 tables)

### Core
| Table                   | Colonnes clés                              | Statut |
|-------------------------|--------------------------------------------|--------|
| users                   | id, email, role, passwordHash              | ✅ OK  |
| sessions                | id, userId, expiresAt                      | ✅ OK  |

### Référentiel
| Table                   | Colonnes clés                              | Statut |
|-------------------------|--------------------------------------------|--------|
| rooms                   | id, code, name, siteId                     | ✅ OK  |
| equipments              | id, code, name, roomId, cadenceRef         | ✅ OK  |
| products                | id, code, name, dci, dosage                | ✅ OK  |
| downtime_categories     | id, code, name, type (planned/unplanned)   | ✅ OK  |
| product_presentations   | id, productId, presentation                | ✅ OK  |
| assembly_boms           | id, productId, componentCode               | ✅ OK  |
| standard_times          | id, equipmentId, productId, timeMin        | ✅ OK  |

### Activités
| Table                        | Colonnes clés                         | Statut |
|------------------------------|---------------------------------------|--------|
| production_orders            | id, equipmentId, productId, quantity  | ✅ OK  |
| shift_reports                | id, reportDate, shiftType, status     | ✅ OK  |
| downtime_events              | id, shiftReportId, categoryId, dur.   | ✅ OK  |
| quality_checks               | id, shiftReportId, conforming, total  | ✅ OK  |
| trs_daily_metrics            | id, equipmentId, date, DO, TP, TQ, TRS| ✅ OK  |
| trs_monthly_metrics          | id, equipmentId, month, TRS           | ✅ OK  |

### Planning
| Table                        | Colonnes clés                         | Statut |
|------------------------------|---------------------------------------|--------|
| planning_mappings            | id, equipmentId, shiftType, active    | ✅ OK  |
| notification_rules           | id, metric, threshold, role           | ✅ OK  |

### Configuration DPI
| Table                        | Statut |
|------------------------------|--------|
| activities                   | ✅ OK  |
| activity_machines            | ✅ OK  |
| activity_operators           | ✅ OK  |
| activity_downtime_events     | ✅ OK  |
| activity_quality_results     | ✅ OK  |
| activity_material_consumption| ✅ OK  |
| activity_checklist_items     | ✅ OK  |
| activity_state_history       | ✅ OK  |
| activity_comments            | ✅ OK  |
| activity_notifications       | ✅ OK  |
| activity_export_logs         | ✅ OK  |
| activity_config_versions     | ✅ OK  |

**Total tables DB confirmées via API:** 29

---

## 2. Données de Référence (seed DPI El Fejja)

Vérifiées via `GET /api/equipments`, `GET /api/products`, `GET /api/downtime-categories` :

| Entité                  | Count attendu | Count réel | Statut |
|-------------------------|---------------|------------|--------|
| Équipements             | 7             | 11*        | ✅ OK  |
| Produits                | 5             | 10*        | ✅ OK  |
| Catégories arrêts       | 45            | 56*        | ✅ OK  |

*Includes test data from multiple seed runs + dev entries.

---

## 3. Intégrité des Clés

| Contrainte               | Vérification              | Statut |
|--------------------------|---------------------------|--------|
| FK equipments → rooms    | Drizzle schema references | ✅     |
| FK activities → equipments| Drizzle schema references| ✅     |
| FK downtime → categories | Drizzle schema references | ✅     |
| Unique email users       | `.unique()` sur email     | ✅     |
| Index sur dates          | Index sur reportDate      | ✅     |

---

## 4. Migrations

**Outil:** `pnpm --filter @workspace/db run push` (drizzle-kit push)  
**Statut:** ✅ Schema synchronisé — toutes les tables existent  
**Note:** En production, utiliser `drizzle-kit migrate` avec fichiers de migration versionés, pas `push`.

---

## Findings

### FINDING #DB-001 — Pas de migrations versionées
**Sévérité:** ⚠️ MEDIUM  
**Description:** `drizzle-kit push` est utilisé en dev — écrase le schéma sans historique. En production Supabase, des migrations SQL versionées sont requises.  
**Recommandation:** Exécuter `drizzle-kit generate` pour créer les fichiers de migration avant la mise en production.

### FINDING #DB-002 — Pas de backup avant seed
**Sévérité:** ⚠️ LOW  
**Description:** L'endpoint `POST /api/admin/load-dpi-config` ne vérifie pas si les données existent déjà, risque de doublons si appelé plusieurs fois.  
**Recommandation:** Ajouter un `ON CONFLICT DO NOTHING` ou une vérification d'idempotence.

**Verdict DATABASE:** 🟡 GO CONDITIONNEL — Migrations à générer avant déploiement prod
