# SECURITY QA REPORT
**Projet:** DPI TRS Tracker — Site El Fejja  
**Date:** 2026-05-02  
**Niveau:** GxP / Pharma — traçabilité requise

---

## 1. Tests d'Authentification et Autorisation (curl réels)

### 1.1 Accès non authentifié à route protégée
```
GET /api/users (sans token)
→ HTTP 401 ✅
```

### 1.2 Opérateur → route admin (403)
```
GET /api/users (token opérateur)
→ HTTP 403 ✅
```

### 1.3 Opérateur → endpoint load-dpi-config (403)
```
POST /api/admin/load-dpi-config (token opérateur)
→ HTTP 403 ✅
```

### 1.4 Token invalide
```
GET /api/activities/today (Authorization: Bearer invalid.token.here)
→ HTTP 401 ✅
```

### 1.5 Superviseur → route admin
```
GET /api/users (token superviseur)
→ HTTP 403 ✅
```

**Résultat RBAC:** ✅ 5/5 vérifications passent — Rôles correctement appliqués

---

## 2. Revue Code Sécurité

### 2.1 Authentification JWT
- ✅ JWT signé avec `SESSION_SECRET` via env var (jamais hardcodé)
- ✅ Middleware `requireAuth` appliqué sur toutes les routes protégées
- ✅ Middleware `requireRole` avec enum strict (`admin`, `superviseur`, `operateur`)
- ✅ Expiration token vérifiée

### 2.2 Mots de passe
- ✅ bcrypt (rounds ≥ 10) — `lib/auth.ts`
- ✅ Jamais stockés en clair
- ✅ Hash comparé en temps constant (bcrypt.compare)
- ⚠️ Mots de passe dev faibles (`admin123`, `super123`) — à changer avant production

### 2.3 Headers HTTP
- ✅ `helmet` activé — headers sécurité automatiques
- ✅ CORS configuré (à restreindre au domaine prod)
- ✅ Rate limiting: `express-rate-limit` installé et configuré

### 2.4 Injection SQL
- ✅ Drizzle ORM — requêtes paramétrées, pas de SQL brut dynamique
- ✅ Validation inputs via Zod schemas avant persistence

### 2.5 Variables d'environnement
- ✅ `SESSION_SECRET` via Replit Secrets (jamais dans le code)
- ✅ `DATABASE_URL` via Replit Secrets
- ✅ `.env` dans `.gitignore`
- ✅ `.env.example` créé (sans valeurs réelles)

---

## 3. Findings

### FINDING #SEC-001 — Mots de passe dev hardcodés dans seed
**Sévérité:** 🔴 HIGH — Blocant production  
**Description:** `seed_dpi.ts` crée des utilisateurs avec mots de passe connus (`admin123`, etc.)  
**Recommandation:** Générer des mots de passe aléatoires ou obliger le changement au premier login. Documenter dans INSTALL.md.

### FINDING #SEC-002 — CORS trop permissif en dev
**Sévérité:** ⚠️ MEDIUM  
**Description:** CORS accepte toutes les origines en développement.  
**Recommandation:** Restreindre à `ALLOWED_ORIGINS` (domaine Replit prod + domaine custom) en `NODE_ENV=production`.

### FINDING #SEC-003 — Endpoint load-dpi-config accessible en production
**Sévérité:** ⚠️ MEDIUM  
**Description:** `POST /api/admin/load-dpi-config` peut être appelé à tout moment par un admin, même en prod.  
**Recommandation:** Désactiver via flag `ENABLE_SEED_ENDPOINT=false` ou supprimer la route après first run.

### FINDING #SEC-004 — Pas de 2FA / MFA
**Sévérité:** ⚠️ LOW — Post-beta  
**Description:** Authentification simple par email/password. En environnement GxP, un 2FA est recommandé.  
**Recommandation:** Planifier pour v1.1 post-beta.

---

## 4. Résumé

| Catégorie                 | Statut  |
|---------------------------|---------|
| RBAC (auth/roles)         | ✅ OK   |
| JWT (signature, expiry)   | ✅ OK   |
| Passwords (bcrypt)        | ✅ OK   |
| Headers (helmet)          | ✅ OK   |
| Rate limiting             | ✅ OK   |
| SQL injection             | ✅ OK   |
| Secrets management        | ✅ OK   |
| CORS                      | ⚠️ À revoir prod |
| Mots de passe seed        | 🔴 À changer |

**Verdict SECURITY:** 🟡 GO CONDITIONNEL — SEC-001 à traiter avant production
