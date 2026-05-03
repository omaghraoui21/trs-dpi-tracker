# DOWNTIME DPI QA REPORT — Gestion des Arrêts
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Catégories:** 56 en DB (45 seed DPI + 11 tests)

---

## 1. Catégories Arrêts Chargées

### 1.1 Arrêts Planifiés (Planned Downtime)
| Code          | Description                        | Impact TRS |
|---------------|------------------------------------|------------|
| NETT          | Nettoyage équipement               | tR réduit  |
| CHG_LOT       | Changement de lot                  | tR réduit  |
| CHG_PROD      | Changement de produit              | tR réduit  |
| MAINT_PREV    | Maintenance préventive             | tR réduit  |
| PESEE         | Pesée / calibration                | tR réduit  |
| QUAL_PREV     | Contrôle qualité planifié          | tR réduit  |
| FORMAT        | Changement de format               | tR réduit  |
| REGLAGE       | Réglage machine planifié           | tR réduit  |

### 1.2 Arrêts Non Planifiés (Unplanned Downtime)
| Code          | Description                        | Impact TRS |
|---------------|------------------------------------|------------|
| PAN_EQUIP     | Panne équipement                   | DO réduit  |
| PAN_UTIL      | Panne utilities (air, eau, élec.)  | DO réduit  |
| ATT_MAT       | Attente matière première           | DO réduit  |
| BLOC_QC       | Blocage contrôle qualité           | DO réduit  |
| DEF_REGL      | Défaut de réglage                  | DO réduit  |
| MICROARRET    | Micro-arrêts cumulés               | DO réduit  |

---

## 2. Tests API Arrêts

| Action                        | Endpoint                      | Statut |
|-------------------------------|-------------------------------|--------|
| Lister catégories             | GET /api/downtime-categories  | ✅ 7ms |
| Créer événement arrêt         | POST /api/activities/*/downtime| ✅ OK |
| Modifier durée arrêt          | PUT /api/activities/*/downtime/:id| ✅ OK |
| Supprimer arrêt (avant valid) | DELETE /api/activities/*/downtime/:id| ✅ OK |
| Arrêt planifié → impact tR   | calculateTrs intégration      | ✅ OK  |
| Arrêt non planifié → impact tF| calculateTrs intégration     | ✅ OK  |

---

## 3. Cohérence Calcul TRS

Tests unitaires confirmés (trs-engine.test.ts):
- Arrêt planifié 60 min: tR réduit de 60 min → DO non affecté ✅
- Arrêt non planifié 60 min: tF réduit → DO = 420/480 = 0.875 ✅
- Cumul des deux: tR et tF réduits → DO et TP affectés ✅

---

## 4. Findings

### FINDING #DT-001 — Pas de validation durée arrêt vs durée shift
**Sévérité:** ⚠️ MEDIUM  
**Description:** Un arrêt de 900 min peut être déclaré sur un shift de 480 min.  
**Recommandation:** Valider que Σ(durées arrêts) ≤ shiftDuration côté formulaire et API.

### FINDING #DT-002 — Micro-arrêts non capturés automatiquement
**Sévérité:** ⚠️ LOW  
**Description:** Les micro-arrêts (<5 min) doivent être déclarés manuellement. Risque de sous-déclaration.  
**Recommandation:** Post-beta — intégration API machine pour capture automatique des micro-arrêts.

**Verdict DOWNTIME:** 🟡 GO CONDITIONNEL — DT-001 à corriger (données cohérentes)
