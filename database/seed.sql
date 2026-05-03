-- =============================================================
-- Seed de référence pour l'environnement de développement
-- Génère : 1 site, 4 salles, 4 équipements, 5 produits,
--           10 cadences, 12 catégories d'arrêt, 3 utilisateurs
-- =============================================================

BEGIN;

-- ── Sites ─────────────────────────────────────────────────
INSERT INTO sites (id, code, name, location)
VALUES (gen_random_uuid(), 'SITE-01', 'Site Pharma Principal', 'France')
ON CONFLICT (code) DO NOTHING;

-- ── Salles ───────────────────────────────────────────────
-- (insérer après le site pour récupérer son id via sous-requête)
INSERT INTO rooms (id, site_id, code, name, room_type)
SELECT gen_random_uuid(), s.id, r.code, r.name, r.room_type
FROM sites s,
  (VALUES
    ('A23', 'Local A23 — Pesée & Fabrication',    'production'),
    ('A26', 'Local A26 — Conditionnement primaire','production'),
    ('A20', 'Local A20 — Conditionnement secondaire','production'),
    ('A19', 'Local A19 — Conditionnement tertiaire', 'production')
  ) AS r(code, name, room_type)
WHERE s.code = 'SITE-01'
ON CONFLICT DO NOTHING;

-- ── Équipements ───────────────────────────────────────────
INSERT INTO equipments (id, site_id, room_id, code, name, equipment_type, trs_objective)
SELECT gen_random_uuid(), s.id, rm.id, e.code, e.name, e.equipment_type, e.trs_objective
FROM sites s
JOIN rooms rm ON rm.site_id = s.id AND rm.code = (
  CASE e.code
    WHEN 'GEL-001' THEN 'A23'
    WHEN 'BLI-001' THEN 'A26'
    WHEN 'LCS-001' THEN 'A20'
    WHEN 'LCS-002' THEN 'A20'
  END
),
(VALUES
  ('GEL-001', 'Géluleuse Harro Höfliger',           'geluleuse',      75.00),
  ('BLI-001', 'Blistereuse IMA TR135 S',             'blistereuse',    75.00),
  ('LCS-001', 'Ligne conditionnement secondaire 1',  'conditionnement', 70.00),
  ('LCS-002', 'Ligne conditionnement secondaire 2',  'conditionnement', 70.00)
) AS e(code, name, equipment_type, trs_objective)
WHERE s.code = 'SITE-01'
ON CONFLICT (code) DO NOTHING;

-- ── Produits ──────────────────────────────────────────────
INSERT INTO products (id, code, name, dosage, pharmaceutical_form)
VALUES
  (gen_random_uuid(), 'PROD-001', 'Amoxicilline 500mg',  '500mg',  'gélule'),
  (gen_random_uuid(), 'PROD-002', 'Paracétamol 1000mg',  '1000mg', 'comprimé'),
  (gen_random_uuid(), 'PROD-003', 'Ibuprofène 400mg',    '400mg',  'comprimé'),
  (gen_random_uuid(), 'PROD-004', 'Oméprazole 20mg',     '20mg',   'gélule'),
  (gen_random_uuid(), 'PROD-005', 'Metformine 850mg',    '850mg',  'comprimé')
ON CONFLICT (code) DO NOTHING;

-- ── Cadences ──────────────────────────────────────────────
INSERT INTO cadences (id, product_id, equipment_id, theoretical_cadence, validated_cadence, unit, valid_from)
SELECT gen_random_uuid(), p.id, e.id,
  CASE e.code WHEN 'GEL-001' THEN 150000 ELSE 60000 END,
  CASE e.code WHEN 'GEL-001' THEN 130000 ELSE 55000 END,
  CASE e.code WHEN 'GEL-001' THEN 'gélules/h' ELSE 'blisters/h' END,
  '2024-01-01'
FROM products p
CROSS JOIN equipments e
WHERE e.code IN ('GEL-001', 'BLI-001')
ON CONFLICT (product_id, equipment_id, valid_from) DO NOTHING;

-- ── Catégories d'arrêt ────────────────────────────────────
INSERT INTO downtime_categories (id, code, label, impact_type, impact_kpi, is_planned, requires_comment)
VALUES
  (gen_random_uuid(), 'NET-PLAN',   'Nettoyage planifié',        'tR', 'DO',  true,  false),
  (gen_random_uuid(), 'MAINT-PREV', 'Maintenance préventive',    'tR', 'DO',  true,  true),
  (gen_random_uuid(), 'REGLAGE',    'Réglage / mise en route',   'tF', 'DO',  false, false),
  (gen_random_uuid(), 'PANNE',      'Panne équipement',          'tF', 'DO',  false, true),
  (gen_random_uuid(), 'ATT-MAT',    'Attente matière première',  'tF', 'DO',  false, false),
  (gen_random_uuid(), 'ATT-DOC',    'Attente documentation',     'tF', 'DO',  false, false),
  (gen_random_uuid(), 'MICRO-ARR',  'Micro-arrêt',               'tN', 'TP',  false, false),
  (gen_random_uuid(), 'RALENTIS',   'Ralentissement cadence',    'tN', 'TP',  false, true),
  (gen_random_uuid(), 'REBUT',      'Rebuts / non-conformes',    'tU', 'TQ',  false, true),
  (gen_random_uuid(), 'RETRAITEMENT','Retraitement lots',         'tU', 'TQ',  false, true),
  (gen_random_uuid(), 'FERMETURE',  'Fermeture usine',           'tO', 'TRG', true,  false),
  (gen_random_uuid(), 'REUNION',    'Réunion / formation',       'tR', 'DO',  true,  false)
ON CONFLICT (code) DO NOTHING;

-- ── Utilisateurs ──────────────────────────────────────────
-- Les mots de passe sont hashés avec bcrypt (12 rounds).
-- admin123, super123, oper123
-- Remplacez les hashes ci-dessous par de vrais hashes bcrypt en production.
INSERT INTO users (id, email, password_hash, first_name, last_name, full_name, role)
VALUES
  (gen_random_uuid(), 'admin@dpi.local',
   '$2b$12$placeholder_replace_with_real_bcrypt_hash_admin',
   'Admin', 'DPI', 'Admin DPI', 'admin'),
  (gen_random_uuid(), 'superviseur@dpi.local',
   '$2b$12$placeholder_replace_with_real_bcrypt_hash_sup',
   'Marie', 'Dupont', 'Marie Dupont', 'supervisor'),
  (gen_random_uuid(), 'operateur@dpi.local',
   '$2b$12$placeholder_replace_with_real_bcrypt_hash_oper',
   'Jean', 'Martin', 'Jean Martin', 'operator')
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- NOTE: En développement, utilisez plutôt le script TypeScript :
--   pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts
-- Il génère de vrais hashes bcrypt.
