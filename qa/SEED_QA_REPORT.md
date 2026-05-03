# SEED QA REPORT — DPI Config El Fejja
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Script:** `artifacts/api-server/src/scripts/seed_dpi.ts`  
**Endpoint:** `POST /api/admin/load-dpi-config`

---

## 1. Exécution Seed

**Commande:** `POST /api/admin/load-dpi-config` (token admin)  
**Résultat:** ✅ Succès — HTTP 200

Données chargées confirmées via API:

| Entité                    | Endpoint de vérification      | Count | Statut |
|---------------------------|-------------------------------|-------|--------|
| Équipements               | GET /api/equipments           | 11    | ✅ OK  |
| Produits                  | GET /api/products             | 10    | ✅ OK  |
| Catégories arrêts         | GET /api/downtime-categories  | 56    | ✅ OK  |
| Tables DB totales         | psql \dt count                | 29    | ✅ OK  |

---

## 2. Données El Fejja Chargées

### Salles (Rooms)
8 salles de production DPI El Fejja:
- Salle A1, A2, A3 (conditionnement primaire)
- Salle B1, B2 (conditionnement secondaire)
- Salle C1 (IBC / granulation)
- Salle Combifor

### Équipements
7 équipements principaux (+ variantes):
- Blistereuse IMA TR135 S (cadence: 7 200 blisters/h)
- Blistereuse Marchesini (cadence: 6 000 blisters/h)
- Combifor (remplissage capsules, cadence: 50 000/h)
- Étuyeuse 1, Étuyeuse 2
- Banc de pesée
- IBC Granulateur

### Produits
5 DCI principales (+ présentations):
- Amoxicilline 500mg gélules
- Amoxicilline 1g comprimés
- Ibuprofène 400mg gélules
- Paracétamol 500mg comprimés
- Metformine 850mg comprimés

### Catégories Arrêts
45 catégories (seed initial) — 56 en DB (additions QA):
- **Planifiés:** Nettoyage, changement de lot, maintenance préventive, pesée, qualification
- **Non planifiés:** Panne équipement, panne utilities, attente matière, contrôle qualité bloquant, défaut réglage

---

## 3. Config Status Endpoint

**GET /api/admin/config-status** — vérifie l'état du chargement  
**Résultat:** ✅ Retourne les counts par entité

---

## 4. Findings

### FINDING #SEED-001 — Seed non idempotent
**Sévérité:** ⚠️ MEDIUM  
**Description:** Appeler `load-dpi-config` deux fois crée des doublons (codes dupliqués).  
**Recommandation:** Ajouter `ON CONFLICT (code) DO UPDATE SET ...` dans les insertions.

### FINDING #SEED-002 — Seed trop couplé à l'endpoint HTTP
**Sévérité:** ⚠️ LOW  
**Description:** La fonction `seedDpiConfig()` est appelée uniquement via l'API. Pas de script CLI autonome.  
**Recommandation:** Ajouter `pnpm --filter @workspace/api-server run seed` comme script npm séparé.

**Verdict SEED:** 🟡 GO CONDITIONNEL — Idempotence à corriger avant re-déploiement
