# PRODUCTION MANAGER DASHBOARD QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Rôles:** admin, superviseur senior  
**Pages:** /dashboard, /reports

---

## 1. Indicateurs Dashboard Testés

| Indicateur                    | Endpoint                        | Temps  | Statut |
|-------------------------------|---------------------------------|--------|--------|
| TRS journalier par équipement | GET /api/dashboard/daily-trs    | 6.6 ms | ✅ OK  |
| Validations en attente        | GET /api/dashboard/pending-validations | 15.1 ms | ✅ OK |
| TRS mensuel (Σ-méthode)       | Calculé via calculateMonthlyTrs | < 1 ms | ✅ OK  |

### 1.1 TRS par Équipement (journalier)
- DO/TP/TQ/TRS affichés en pourcentage
- Code couleur: vert (>75%), orange (50-75%), rouge (<50%)
- Historique 7 jours disponible

### 1.2 TRS Mensuel
- Calcul via `calculateMonthlyTrs()` — Σ(tU)/Σ(tR) conforme NF E 60-182
- Comparaison vs objectif (75% par défaut DPI El Fejja)
- Distinction TRS/TRG/TRE visible

---

## 2. Rapports et Exports

| Fonctionnalité                | Statut   | Note                          |
|-------------------------------|----------|-------------------------------|
| Export Excel arrêts           | ✅ OK    | Via ExcelJS                   |
| Export Excel TRS mensuel      | ✅ OK    | Via ExcelJS                   |
| Rapport PDF                   | ⚠️ N/A   | Non implémenté (post-beta)    |
| Rapport par salle             | ✅ OK    | Filtrage roomId               |

---

## 3. Findings

### FINDING #MGR-001 — Objectif TRS non configurable par l'UI
**Sévérité:** ⚠️ LOW  
**Description:** L'objectif TRS (75%) est hardcodé dans les requêtes. Un responsable ne peut pas le modifier sans intervention dev.  
**Recommandation:** Ajouter table `kpi_targets` et UI admin pour configurer les objectifs par équipement.

### FINDING #MGR-002 — Pas de vue comparative inter-équipements
**Sévérité:** ⚠️ LOW  
**Description:** Le dashboard n'a pas de vue "best/worst performer" sur la semaine.  
**Recommandation:** Post-beta — graphe comparatif des 7 équipements.

**Verdict MGR_DASHBOARD:** 🟢 GO — Fonctionnel pour la beta production
