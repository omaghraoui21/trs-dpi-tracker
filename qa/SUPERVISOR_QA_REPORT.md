# SUPERVISOR QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Rôle:** superviseur — Validation OF, suivi équipe, alertes

---

## 1. Flux Superviseur

### 1.1 Tableau de bord superviseur
| Fonctionnalité                | Endpoint                              | Statut |
|-------------------------------|---------------------------------------|--------|
| Validations en attente        | GET /api/dashboard/pending-validations (15ms) | ✅ OK |
| TRS journalier équipements    | GET /api/dashboard/daily-trs          | ✅ OK  |
| Vue salle (multi-équipement)  | Filtrage par roomId                   | ✅ OK  |

### 1.2 Validation des OF
| Action                        | Comportement attendu           | Statut |
|-------------------------------|--------------------------------|--------|
| Voir OF soumis par opérateurs | Filtrage statut=soumis         | ✅ OK  |
| Valider un OF                 | PUT /api/activities/:id/validate | ✅ OK |
| Rejeter un OF avec commentaire| PUT /api/activities/:id/reject | ✅ OK  |
| Superviseur valide son propre OF | Bloqué (403 ou validation métier) | ✅ OK |

### 1.3 Gestion Arrêts
| Action                         | Comportement attendu            | Statut |
|--------------------------------|---------------------------------|--------|
| Voir arrêts déclarés           | Liste par shift/équipement      | ✅ OK  |
| Reclasser arrêt (planifié ↔ non planifié) | Droit superviseur      | ✅ OK  |
| Ajouter commentaire validation | Champ texte libre               | ✅ OK  |

---

## 2. Autorisation RBAC

| Action                          | Opérateur | Superviseur | Admin |
|---------------------------------|-----------|-------------|-------|
| Voir activités propres          | ✅        | ✅          | ✅    |
| Voir toutes les activités salle | ❌        | ✅          | ✅    |
| Valider OF                      | ❌        | ✅          | ✅    |
| Accès admin panel               | ❌        | ❌          | ✅    |
| Changer rôle utilisateur        | ❌        | ❌          | ✅    |

Tests curl RBAC: 5/5 vérifications ✅ (voir SECURITY_QA_REPORT)

---

## 3. Findings

### FINDING #SUP-001 — Pas d'historique des validations
**Sévérité:** ⚠️ MEDIUM (GxP)  
**Description:** Quand un superviseur valide un OF, l'identité du validateur n'est pas toujours visible clairement dans l'UI.  
**Recommandation:** Afficher "Validé par [nom] le [date/heure]" dans le détail OF. La table `activity_state_history` capture déjà les transitions — à rendre visible.

### FINDING #SUP-002 — Pas de notification push en temps réel
**Sévérité:** ⚠️ LOW  
**Description:** Le superviseur doit rafraîchir manuellement pour voir les nouveaux OF soumis.  
**Recommandation:** WebSocket ou polling 30s pour les validations en attente — post-beta.

**Verdict SUPERVISOR:** 🟡 GO CONDITIONNEL — SUP-001 à traiter (traçabilité GxP)
