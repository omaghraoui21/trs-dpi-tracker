# COMBIFOR QA REPORT — Remplissage Capsules
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Équipement:** Combifor (capsules/gélules — cadence 50 000 gélules/h)  
**Salle:** Salle C1 / Combifor

---

## 1. Spécificités Combifor

Le Combifor est un équipement de remplissage de capsules avec des caractéristiques distinctes:
- Cadence de référence: 50 000 gélules/h (833 gélules/min)
- Arrêts planifiés fréquents: pesée IPC (contrôle en cours de production) toutes les 30 min
- Produits: gélules Amoxicilline 500mg, Ibuprofène 400mg

---

## 2. Tests TRS Combifor

### Scénario: Shift 8h avec pesées IPC

Configuration:
- Shift: 08:00–17:00 = 540 min
- Pesées IPC planifiées: 6 × 5 min = 30 min planifiés
- Changement lot planifié: 30 min
- Total planifié: 60 min → tR = 480 min
- Panne dosateur: 20 min non planifié → tF = 460 min
- Production: 380 000 gélules / 378 000 conformes

Calcul TRS attendu:
- cadencePerMin = 50 000/60 ≈ 833 gél/min
- tN = 380 000/833 ≈ 456 min
- tU = 378 000/833 ≈ 453.8 min
- DO = 460/480 ≈ 0.9583
- TP = 456/460 ≈ 0.9913
- TQ = 378/380 ≈ 0.9947
- **TRS = 453.8/480 ≈ 0.9454 (94.5%)**

Résultat moteur TRS: ✅ Confirmé via `calculateTrs()` en tests unitaires (Cas 1 équivalent).

---

## 3. Catégories Arrêts Combifor (DPI)

| Code        | Description                 | Type        | Statut seed |
|-------------|-----------------------------|-------------|-------------|
| IPC_PESEE   | Pesée IPC 30 min            | Planifié    | ✅ OK       |
| CHG_PROD    | Changement de produit/lot   | Planifié    | ✅ OK       |
| PAN_DOSA    | Panne dosateur capsules     | Non planifié| ✅ OK       |
| ATT_MAT     | Attente matière première    | Non planifié| ✅ OK       |
| NETT_IBC    | Nettoyage IBC               | Planifié    | ✅ OK       |

---

## 4. Findings

### FINDING #COMB-001 — Pesées IPC non trackées individuellement
**Sévérité:** ⚠️ MEDIUM  
**Description:** Les pesées IPC sont déclarées comme un arrêt planifié groupé mais ne sont pas tracées individuellement (heure, résultat). Exigence GxP de traçabilité IPC.  
**Recommandation:** Ajouter un module de saisie IPC avec résultat (masse cible, masse réelle, écart %) — post-beta v1.1.

### FINDING #COMB-002 — Pas de BOM linkage sur l'écran production
**Sévérité:** ⚠️ LOW  
**Description:** La table `assembly_boms` existe mais l'opérateur Combifor ne voit pas la BOM (liste des matières premières à consommer) dans son interface.  
**Recommandation:** Afficher la BOM en lecture seule sur la page "Ma journée" pour le Combifor.

**Verdict COMBIFOR:** 🟡 GO CONDITIONNEL — Fonctionnel pour TRS, traçabilité IPC à planifier
