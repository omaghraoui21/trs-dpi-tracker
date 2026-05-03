# OPERATOR UX QA REPORT — "Ma Journée" (/today)
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Page:** `/today` — Interface opérateur (rôle: operateur)  
**Utilisateur test:** `operateur@dpi.local`

---

## 1. Flux Principal Opérateur

### 1.1 Accès à "Ma journée"
| Action                        | Comportement attendu           | Statut |
|-------------------------------|--------------------------------|--------|
| Login operateur@dpi.local     | Redirige vers /today           | ✅ OK  |
| Affichage activités du jour   | Liste des OF assignés          | ✅ OK  |
| Aucune activité               | Message vide approprié         | ✅ OK  |
| Chargement données            | GET /api/activities/today (10ms)| ✅ OK |

### 1.2 Déclaration Production
| Action                         | Comportement attendu            | Statut |
|--------------------------------|---------------------------------|--------|
| Saisie quantité produite       | Champ numérique validé          | ✅ OK  |
| Saisie quantité conforme       | ≤ quantité produite (Zod)       | ✅ OK  |
| Saisie cadence                 | > 0 requis                      | ✅ OK  |
| Soumission formulaire          | POST /api/activities/*          | ✅ OK  |
| Erreur de saisie               | Message d'erreur inline         | ✅ OK  |

### 1.3 Déclaration Arrêts
| Action                        | Comportement attendu           | Statut |
|-------------------------------|--------------------------------|--------|
| Sélection catégorie arrêt     | Liste DPI El Fejja chargée     | ✅ OK  |
| Durée arrêt (minutes)         | Champ numérique > 0            | ✅ OK  |
| Type planifié/non planifié    | Hérité de la catégorie         | ✅ OK  |
| Commentaire optionnel         | Champ libre 500 chars          | ✅ OK  |

---

## 2. Contraintes Métier Validées

| Règle                                    | Validation                  | Statut |
|------------------------------------------|-----------------------------|--------|
| Quantité conforme ≤ quantité produite    | Zod schema validation       | ✅ OK  |
| Cadence > 0 obligatoire                  | Required field              | ✅ OK  |
| Opérateur ne voit que ses activités      | Filtre userId sur requête   | ✅ OK  |
| Opérateur ne peut pas valider son propre OF | Rôle superviseur requis  | ✅ OK  |

---

## 3. Findings UX

### FINDING #UX-001 — Pas de validation quantité vs cadence (FINDING #001 engines)
**Sévérité:** 🔴 MEDIUM  
**Description:** L'UI ne bloque pas si quantityProduced > cadence × tF. Lié au FINDING #001 du moteur.  
**Recommandation:** Ajouter warning "Quantité supérieure à la capacité théorique" si qty > cadence/60 × tF × 1.05.

### FINDING #UX-002 — Pas de sauvegarde automatique brouillon
**Sévérité:** ⚠️ LOW  
**Description:** Perte de données si l'opérateur ferme accidentellement l'onglet.  
**Recommandation:** localStorage draft save — post-beta.

### FINDING #UX-003 — Interface en français uniquement
**Sévérité:** ℹ️ INFO  
**Description:** Pas d'i18n. Acceptable pour le site El Fejja (FR uniquement).

**Verdict OPERATOR_UX:** 🟡 GO CONDITIONNEL — UX-001 lié à Finding #001 moteur
