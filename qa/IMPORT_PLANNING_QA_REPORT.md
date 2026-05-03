# IMPORT PLANNING QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Fonctionnalité:** Import planning Excel + mapping équipements/shifts

---

## 1. Fonctionnalité Planning

### Routes disponibles
| Route                              | Méthode | Statut |
|------------------------------------|---------|--------|
| GET /api/planning                  | GET     | ✅ OK  |
| POST /api/planning                 | POST    | ✅ OK  |
| GET /api/planning-mappings         | GET     | ✅ OK  |
| POST /api/planning-mappings        | POST    | ✅ OK  |
| PUT /api/planning-mappings/:id     | PUT     | ✅ OK  |

### Données planning seed
15 mappings planning chargés via seed DPI El Fejja:
- Blistereuse → Shift Matin (06:00–14:00)
- Blistereuse → Shift Après-midi (14:00–22:00)
- Combifor → Shift Journée (08:00–17:00)
- Étuyeuses → Shift Matin + Après-midi
- etc.

---

## 2. Import Excel Planning

### Format attendu
L'import Excel du planning de production accepte:
- Colonne A: Date (YYYY-MM-DD)
- Colonne B: Équipement (code)
- Colonne C: Produit (code)
- Colonne D: Quantité planifiée
- Colonne E: Shift (MATIN/AM/SOIR/NUIT)

### Tests Import
| Scénario                        | Comportement          | Statut |
|---------------------------------|-----------------------|--------|
| Fichier xlsx valide             | Import OK             | ✅ OK  |
| Équipement code inconnu         | Erreur + ligne rejetée| ✅ OK  |
| Date format invalide            | Erreur validation     | ✅ OK  |
| Fichier non-xlsx uploadé        | Erreur 400            | ✅ OK  |
| Fichier > limite (10MB)         | Erreur Multer         | ✅ OK  |

---

## 3. Findings

### FINDING #PLAN-001 — Pas de prévisualisation avant import
**Sévérité:** ⚠️ MEDIUM  
**Description:** L'import se fait en une étape sans confirmation. Un fichier erroné peut créer des données parasites.  
**Recommandation:** Ajouter un "dry-run" mode: parser le fichier, afficher un résumé, demander confirmation avant insertion.

### FINDING #PLAN-002 — Pas de gestion des conflits de planning
**Sévérité:** ⚠️ MEDIUM  
**Description:** Si un équipement est déjà planifié sur un slot, l'import crée un doublon sans warning.  
**Recommandation:** Vérifier les conflits (`ON CONFLICT`), afficher les lignes conflictuelles à l'utilisateur.

### FINDING #PLAN-003 — Template Excel non fourni
**Sévérité:** ⚠️ LOW  
**Description:** Aucun template Excel de planning n'est fourni à télécharger. L'opérateur doit deviner le format.  
**Recommandation:** Ajouter `GET /api/planning/template` qui retourne un .xlsx vierge avec les en-têtes corrects.

**Verdict IMPORT_PLANNING:** 🟡 GO CONDITIONNEL — PLAN-001 et PLAN-003 à traiter pour adoption
