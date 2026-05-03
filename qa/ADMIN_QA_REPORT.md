# ADMIN QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Page:** /admin — Panel administrateur  
**Utilisateur:** admin@dpi.local

---

## 1. Gestion Utilisateurs

| Action                          | Endpoint                    | Statut |
|---------------------------------|-----------------------------|--------|
| Lister les utilisateurs         | GET /api/users              | ✅ OK  |
| Créer un utilisateur            | POST /api/users             | ✅ OK  |
| Modifier rôle                   | PUT /api/users/:id          | ✅ OK  |
| Désactiver un compte            | PUT /api/users/:id/active   | ✅ OK  |
| Accès réservé admin (RBAC)      | 403 pour opérateur/superv.  | ✅ OK  |

---

## 2. Config DPI El Fejja

| Action                           | Endpoint                         | Statut |
|----------------------------------|----------------------------------|--------|
| Charger config DPI               | POST /api/admin/load-dpi-config  | ✅ OK  |
| Vérifier statut config           | GET /api/admin/config-status     | ✅ OK  |
| Tab "Config DPI EF" visible      | admin.tsx DpiConfigTab           | ✅ OK  |
| Retour count entités chargées    | JSON avec counts                 | ✅ OK  |

---

## 3. Gestion Référentiel

| Entité          | CRUD         | Statut |
|-----------------|--------------|--------|
| Équipements     | R/U (seed)   | ✅ OK  |
| Produits        | R/U (seed)   | ✅ OK  |
| Catégories arrêts | R/U (seed) | ✅ OK  |
| Salles          | R (seed)     | ✅ OK  |
| Utilisateurs    | CRUD complet | ✅ OK  |

---

## 4. Findings

### FINDING #ADM-001 — Pas d'audit log admin
**Sévérité:** ⚠️ MEDIUM (GxP)  
**Description:** Les actions admin (création user, chargement config) ne sont pas loguées dans une table d'audit.  
**Recommandation:** Ajouter table `audit_logs` avec (userId, action, entity, timestamp, ipAddress).

### FINDING #ADM-002 — Pas de confirmation avant load-dpi-config
**Sévérité:** ⚠️ LOW  
**Description:** Le bouton "Charger config DPI" s'exécute sans demander confirmation. Si appelé en prod, risque de doublons.  
**Recommandation:** Modal de confirmation avec warning "Action irréversible — données existantes conservées".

**Verdict ADMIN:** 🟡 GO CONDITIONNEL — ADM-001 (audit log) recommandé avant déploiement GxP
