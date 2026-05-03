# OFFLINE QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Architecture:** SPA React + API REST — pas de PWA/Service Worker actuellement

---

## 1. Comportement Hors-Ligne

### État actuel
L'application **ne supporte pas le mode hors-ligne** — elle nécessite une connexion réseau active pour toutes les opérations:
- Chargement des pages (SPA statique servi depuis le réseau)
- Toutes les requêtes API (lecture et écriture)
- Authentification JWT (validation en temps réel)

### Comportement en cas de coupure réseau
| Scénario                  | Comportement actuel              | Acceptable beta |
|---------------------------|----------------------------------|-----------------|
| Coupure pendant saisie OF | Erreur réseau, données perdues   | ⚠️ Risque       |
| Rechargement page offline | Page blanche / erreur réseau     | ⚠️ Normal       |
| Token expiré + offline    | Redirect login (impossible)      | ⚠️ Bloquant     |

---

## 2. Infrastructure Réseau El Fejja

**Contexte:** Le site El Fejja dispose d'un réseau WiFi industriel dans les salles de production. Le risque de coupure réseau est faible mais existant (maintenances infrastructure, coupures électriques).

**Mitigations actuelles:**
- Serveur hébergé en local (Replit/Supabase) — latence faible
- Connexion filaire disponible aux postes superviseur

---

## 3. Recommandations

### Court terme (beta)
- Ajouter une bannière "Connexion perdue" avec retry automatique
- Implémenter un `beforeunload` qui alerte l'opérateur avant de quitter une saisie en cours

### Post-beta (v1.1)
- Service Worker basique pour:
  - Mettre en cache le référentiel (équipements, produits, catégories)
  - Permettre la saisie offline d'un OF avec sync à la reconnexion
  - Cacher la page shell (layout) pour éviter la page blanche

---

## 4. Findings

### FINDING #OFFLINE-001 — Pas de gestion déconnexion réseau
**Sévérité:** ⚠️ MEDIUM  
**Description:** Saisie perdue en cas de coupure réseau pendant la soumission.  
**Recommandation beta:** `beforeunload` + banner reconnexion  
**Recommandation v1.1:** Service Worker + offline queue

### FINDING #OFFLINE-002 — Pas de PWA manifest
**Sévérité:** ⚠️ LOW — Post-beta  
**Description:** L'app ne peut pas être installée sur tablette en mode "Add to Home Screen".  
**Recommandation:** Ajouter `manifest.json` et meta PWA pour améliorer l'UX tablette industrielle.

**Verdict OFFLINE:** 🟡 GO CONDITIONNEL — Acceptable pour beta réseau stable. OFFLINE-001 à traiter v1.0.1
