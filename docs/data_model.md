# Modèle de données — TRS/OEE DPI Tracker

## Principes généraux

- **Clés primaires** : UUID v4 (`gen_random_uuid()`) sur toutes les tables
- **Horodatage** : `created_at` et `updated_at` avec timezone sur toutes les tables
- **Soft delete** : `is_deleted` sur les tables critiques (downtime_events)
- **Historisation** : cadences historisées via `valid_from` / `valid_to`
- **Multi-années** : aucune table par année/mois/semaine — filtrage par date uniquement
- **Portabilité** : 100 % PostgreSQL standard, compatible Supabase et serveur entreprise

---

## Tables

### `roles`
Rôles applicatifs avec permissions JSON.
- `id`, `name` (operator/supervisor/admin), `permissions` (jsonb)

### `sites`
Sites de production.
- `id`, `code`, `name`, `location`

### `rooms`
Salles par site (A23, A26, A20, A19…).
- `id`, `site_id` → sites, `code`, `name`, `room_type`, `status`

### `users`
Utilisateurs avec rôle, département, nom complet.
- `id`, `email`, `password_hash`, `first_name`, `last_name`, `full_name`, `department`, `role` (enum), `is_active`

### `equipments`
Équipements de production par site/salle.
- `id`, `site_id` → sites, `room_id` → rooms, `code`, `name`, `equipment_type`, `trs_objective`, `is_active`

Exemples : Géluleuse Harro Höfliger (GEL-001), Blistereuse IMA TR135 S (BLI-001)

### `products`
Produits pharmaceutiques.
- `id`, `code`, `name`, `dosage`, `pharmaceutical_form`, `is_active`

### `cadences`
Cadences théoriques historisées par couple produit/équipement.
- `id`, `product_id`, `equipment_id`, `theoretical_cadence`, `validated_cadence`, `unit`, `valid_from`, `valid_to`
- Contrainte unique : (product_id, equipment_id, valid_from)
- `valid_to = NULL` → cadence active courante

### `downtime_categories`
Taxonomie des causes d'arrêt.
- `id`, `code`, `label`, `impact_type` (tO/tR/tF/tN/tU/TQ), `impact_kpi`, `is_planned`

### `planning_imports`
Métadonnées des imports de fichiers Excel planning.
- `id`, `file_name`, `file_url`, `week_number`, `year`, `imported_by`, `validation_status`

### `production_plans`
Lignes de planning importées (1 ligne = 1 activité planifiée).
- `id`, `planning_import_id`, `planned_date`, `day_name`, `activity_type`
- `equipment_id` → equipments, `room_id` → rooms, `product_id` → products
- `lot_number`, `planned_quantity`, `planned_unit`, `planned_start_time`, `planned_end_time`
- Index sur : planned_date, week_number+year, equipment_id

### `production_entries`
Saisies opérateurs (1 = 1 poste de travail).
- `id`, `production_plan_id` → production_plans (optionnel), `equipment_id`, `product_id`
- `date`, `shift`, `shift_start`, `shift_end`
- `quantity_produced`, `quantity_conforming`, `quantity_rejected`, `unit`
- `status` : draft → submitted → validated/rejected
- `operator_id`, `supervisor_id`, `submitted_at`, `validated_at`
- Index sur : date, equipment_id, product_id, status, operator_id

### `downtime_events`
Arrêts liés à une saisie.
- `id`, `entry_id` → production_entries, `category_id` → downtime_categories
- `start_time`, `end_time`, `duration_minutes`, `severity`, `status`
- `is_deleted` (soft delete)

### `equipment_status_events`
Historique des statuts équipements.
- `id`, `equipment_id`, `status` (available/in_production/cleaning/maintenance/breakdown/waiting/blocked)
- `started_at`, `ended_at`, `product_id`, `lot_number`, `activity_type`

### `room_status_events`
Historique des statuts salles.
- `id`, `room_id`, `status`, `started_at`, `ended_at`

### `kpi_daily`
KPIs calculés par équipement/produit/jour (agrégation automatique).
- `id`, `equipment_id`, `product_id`, `date`, `year`, `month`, `week_number`
- Temps : tT, tO, tR, tF, tN, tU
- Taux : DO, TP, TQ, TRS, TRG, TRE, planning_adherence_rate
- Contrainte unique : (equipment_id, product_id, date)

### `kpi_monthly`
KPIs mensuels agrégés sur les totaux (NF E 60-182).
- **TRS = tU_total / tR_total** (jamais moyenne des TRS journaliers)
- Contrainte unique : (equipment_id, product_id, year, month)

### `notifications`
Alertes avec sévérité et cycle de vie open/acknowledged/closed.
- `id`, `type`, `severity` (info/warning/critical), `status`
- `equipment_id`, `room_id`, `product_id`, `lot_number`
- `acknowledged_by`, `acknowledged_at`, `closed_by`, `closed_at`, `closure_comment`

### `monthly_closures`
Clôtures mensuelles par site/équipement.
- `id`, `site_id`, `year`, `month`, `equipment_id`, `status`, `locked_by_id`

### `audit_log`
Trail immuable de toutes les modifications critiques.
- `id`, `table_name`, `record_id` (UUID text), `action`, `old_values` (jsonb), `new_values` (jsonb), `reason`

---

## Index recommandés

```sql
-- production_entries
CREATE INDEX ON production_entries (date);
CREATE INDEX ON production_entries (equipment_id);
CREATE INDEX ON production_entries (product_id, date);
CREATE INDEX ON production_entries (status);
CREATE INDEX ON production_entries (operator_id);

-- production_plans
CREATE INDEX ON production_plans (planned_date);
CREATE INDEX ON production_plans (week_number, year);
CREATE INDEX ON production_plans (equipment_id);

-- kpi_daily
CREATE INDEX ON kpi_daily (date, equipment_id);
CREATE INDEX ON kpi_daily (year, month, equipment_id);

-- downtime_events
CREATE INDEX ON downtime_events (entry_id);
CREATE INDEX ON downtime_events (category_id);
```

---

## Relations clés

```
sites → rooms → equipments
sites → monthly_closures
users ← production_entries (operator_id, supervisor_id)
equipments + products → cadences (historisées)
planning_imports → production_plans → production_entries
production_entries → downtime_events
equipments → kpi_daily/kpi_monthly
equipments → equipment_status_events
rooms → room_status_events
```
