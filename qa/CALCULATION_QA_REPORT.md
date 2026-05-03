# CALCULATION QA REPORT — TRS/OEE Engine
**Projet:** DPI TRS Tracker — Site El Fejja  
**Standard:** NF E 60-182  
**Date:** 2026-05-02  
**Fichier testé:** `artifacts/api-server/src/lib/trs-engine.ts`  
**Fichier tests:** `artifacts/api-server/src/__tests__/trs-engine.test.ts`

---

## Résultats Tests Automatisés

```
pnpm test

 RUN  v4.1.5

 Test Files  1 passed (1)
      Tests  65 passed (65)
   Duration  778ms
```

**Verdict:** ✅ 65/65 tests passent — 0 échec

---

## Cas de Test Couverts

### Cas 1 — Production simple
- tO=480, tR=420, tF=390, cadence=60 000/h
- Qté produite: 360 000, conforme: 358 000
- **DO:** 390/420 = 0.9286 ✅
- **TP:** 360/390 = 0.9231 ✅
- **TQ:** 358/360 = 0.9944 ✅
- **TRS:** 358/420 = 0.8524 ✅
- **Cohérence DO×TP×TQ ≈ TRS:** ✅ (tolérance ±0.005)
- **Hiérarchie TRS > TRG > TRE:** ✅

### Cas 2 — Journée nettoyage uniquement
- plannedDowntime = totalité du shift (540 min) → tR = 0
- **DO = 0** sans crash ✅
- **TRS = 0** sans NaN/Infinity ✅
- Comportement conforme NF E 60-182 (activité non productive planifiée)

### Cas 3 — Journée mixte nettoyage + production
- Nettoyage 120 min planifié + production sur 420 min
- **TRS calculé sur tR=420 (non tO=540)** ✅
- Vérification que le nettoyage est correctement déduit du temps requis

### Cas 4 — Arrêt non planifié 60 min (panne)
- unplannedDowntime = 60 min → tF = 420 < tR = 480
- **DO < 1** détecté ✅
- **TP < 1** (sous-production due à la panne) ✅

### Cas 5 — Sous-performance cadence
- Aucun arrêt déclaré, production faible
- **DO = 1.0** (aucun arrêt) ✅
- **TP < 1** — sous-performance détectée ✅
- **cadenceGap > 0** ✅

### Cas 6 — Problème qualité (25% rebuts)
- TQ = 0.75 ✅
- TRS < DO × TP (dégradé par TQ) ✅
- tN > tU (produit ≠ conforme) ✅

### Cas 7 — TRS mensuel NF E 60-182
- **Σ(tU)/Σ(tR)** — NON moyenne journalière ✅
- totalTR = 1270, totalTU = 1021 → TRS mensuel ≈ 0.8039 ✅
- DO/TP/TQ mensuels calculés correctement ✅
- Liste vide → trs=null, DO=null (pas de crash) ✅

### Cas 8 — Division par zéro (anticrash)
- Toutes entrées = 0, cadence = 0
- DO/TP/TQ/TRS/TRG/TRE = 0 (pas NaN, pas Infinity) ✅
- Tous résultats sont des nombres finis ✅

### Cas DPI réel — Blistereuse IMA TR135 S (7200 blisters/h)
- Shift 540 min, planifié 30 min, panne 15 min → tF=495, tR=510
- Production réaliste: 51 732 blisters → tN ≈ 431 min
- DO ≈ 0.9706, TP ≈ 0.87, TQ ≥ 0.99 ✅

---

## Findings

### FINDING #001 — TP non clampé à [0, 1]
**Sévérité:** ⚠️ MEDIUM  
**Description:** Si un opérateur saisit une quantité supérieure à `cadence × tR` (ex: erreur de saisie de zéros), le moteur renvoie TP > 1 et TRS > 1 — physiquement impossibles.  
**Exemple:** quantityProduced=700 000 sur 480 min à 60 000/h → TP=1.45, TRS=1.45  
**Impact:** Données corrompues en base, dashboard TRS affiche >100%  
**Recommandation:** Ajouter validation côté formulaire: `quantityProduced ≤ validatedCadence/60 × tF × 1.05` (tolérance 5%). Ou clamper TP à 1 dans le moteur.  
**Statut:** 🔴 À corriger avant production (risque données)

---

## Couverture Formules

| Formule                     | Testé | Status |
|-----------------------------|-------|--------|
| tT = 1440 min constant      | ✅    | OK     |
| tO = shiftDuration          | ✅    | OK     |
| tR = tO - plannedDowntime   | ✅    | OK     |
| tF = tR - unplannedDowntime | ✅    | OK     |
| tN = qty_produit/cadence    | ✅    | OK     |
| tU = qty_conforme/cadence   | ✅    | OK     |
| DO = tF/tR                  | ✅    | OK     |
| TP = tN/tF                  | ✅    | OK     |
| TQ = tU/tN                  | ✅    | OK     |
| TRS = tU/tR = DO×TP×TQ      | ✅    | OK     |
| TRG = tU/tO                 | ✅    | OK     |
| TRE = tU/tT                 | ✅    | OK     |
| Monthly Σ(tU)/Σ(tR)        | ✅    | OK     |
| safeDivide anticrash        | ✅    | OK     |
| timeToMinutes HH:MM         | ✅    | OK     |
| shiftDuration overnight     | ✅    | OK     |

**Couverture:** 16/16 formules couvertes — 100%

**Verdict CALCULATION:** 🟡 GO CONDITIONNEL — Corriger Finding #001 avant production
