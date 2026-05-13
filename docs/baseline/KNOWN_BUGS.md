# Bugs & incohérences connus — module Paramétrage

État à la création de la branche `fix/admin-parametrage` (2026-05-13, parent `4679a02`).

Périmètre : les 4 référentiels du module Paramétrage —
**Équipements**, **Produits**, **Types d'arrêts**, **Règles de calcul / cadences / objectifs**.

Les bugs sont classés par **impact**. Chaque bug référence le fichier source pour
faciliter le travail de correction.

---

## 🔴 P1 — Impact fonctionnel / conformité

### B1 — Aucun audit log sur les CRUD de référentiels

- **Fichiers** : `artifacts/api-server/src/routes/{equipments,products,downtime-categories,calculation-formulas}.ts`
- **Symptôme** : aucune trace de _qui_ a créé/modifié/désactivé un référentiel.
- **Détail** : la table `audit_log` existe, le helper `writeAudit()` est écrit dans
  `artifacts/api-server/src/lib/audit.ts`, mais **n'est appelé nulle part** dans
  les routes de paramétrage (0 occurrence).
- **Impact** : traçabilité = 0. Bloquant pour exigences pharma (GMP, ISO).

### B2 — Soft-delete sans vérification des dépendances

- **Fichiers** : mêmes que B1.
- **Symptôme** : on peut désactiver un équipement qui a 10 000 entrées de prod, ou
  un type d'arrêt utilisé par des événements actifs, sans aucun avertissement.
- **Impact** : risque opérationnel (KPI calculés sur un référentiel désactivé).

### B3 — Pas de réactivation possible depuis l'UI

- **Fichier** : `artifacts/trs-app/src/pages/admin.tsx`
- **Symptôme** : une fois `isActive=false`, l'élément est invisible dans l'UI.
  Pour le réactiver, il faut passer en DB.
- **Conséquence observable** : les utilisateurs finissent par créer un doublon
  avec un code légèrement différent.

### B4 — Rôles incohérents entre référentiels

- **Fichiers** : `routes/{equipments,products,downtime-categories,calculation-formulas}.ts`
- **Symptôme** :
  - Équipements : create/update/delete = `admin` only
  - Produits : create/update/delete = `admin` only
  - Catégories : create/update = `admin` **ou** `supervisor`, delete = `admin` only
  - Formules : create/validate = `admin` only
- **Impact** : confusion utilisateurs, règle non documentée.

### B5 — Erreur 500 sur code en doublon (au lieu de 409)

- **Fichiers** : `routes/{equipments,downtime-categories,calculation-formulas}.ts`
  (toutes les routes **sauf** `POST /products` qui le fait correctement)
- **Symptôme** : créer un équipement/catégorie/formule avec un `code` déjà utilisé
  renvoie 500 (le `23505` Postgres remonte brut). Côté UI, toast "Erreur serveur".
- **Fix trivial** : utiliser `isUniqueViolation()` qui existe dans `lib/db-errors.ts`
  et retourner 409 + message explicite.
- **Également absent sur tous les PATCH** (changer le code vers un existant → 500).

---

## 🟠 P2 — Incohérences structurelles (drift schéma ↔ UI ↔ API)

### B6 — Champs DB jamais retournés ni éditables

- **Fichiers** : `routes/{equipments,products}.ts` (formatters), `pages/admin.tsx`
- **Symptôme** :
  - `equipments.equipmentType`, `.siteId`, `.roomId` → en DB mais pas dans `formatEquipment`
  - `products.dosage`, `.pharmaceuticalForm` → en DB mais pas dans `formatProduct`
  - `downtime_categories.impactKpi` → en DB mais pas éditable dans l'UI
- **Impact** : données saisies par le seed métier mais **invisibles** dans l'admin UI.

### B7 — Drift OpenAPI/DB sur les catégories d'arrêt

- **Fichiers** : `routes/downtime-categories.ts`, `lib/api-zod/src/generated/api.ts`
- **Symptôme** : les champs `isQuickShortcut`, `shortcutEquipments` ne sont **pas**
  dans la spec OpenAPI → le route handler **strip ces champs du body avant `safeParse()`
  puis les réinjecte manuellement** (lignes 36-48).
- **Fragilité** : toute régénération Orval propre casse ce mécanisme.

### B8 — `shortcutEquipments` = CSV de codes, pas une vraie FK

- **Fichier** : `lib/db/src/schema/downtime-categories.ts`
- **Symptôme** : champ `text` contenant des codes équipements séparés par virgule
  (`"A27, A28"`), parsé côté frontend à chaque rendu.
- **Conséquence** : si un équipement est renommé, les raccourcis deviennent orphelins
  silencieusement. Pas de contrainte d'intégrité.

### B9 — UI Formules : fonctionnalités backend inutilisables

- **Fichier** : `pages/admin.tsx` (`FormulasTab`, ~lignes 645-790)
- **Symptôme** : le backend supporte `POST /formulas` (créer nouvelle version) et
  `POST /formulas/:id/validate`. **Aucun de ces deux endpoints n'est appelable
  depuis l'UI**. Seules actions UI : lister + "Tester".
- **Conséquence** : pour modifier une formule, il faut passer par curl ou SQL.

### B10 — Évaluateur de formules = `new Function()` + seed non idempotent

- **Fichier** : `routes/calculation-formulas.ts`
- **Problèmes** :
  1. L'évaluation utilise `new Function("\"use strict\"; return (${expr});")`, même
     protégé par un regex whitelist `[\d\s+\-*/().]`. C'est une odeur de sécurité.
  2. **Les 13 formules builtins sont seedées au premier `GET /formulas`** (si la
     table est vide). C'est du seed implicite au runtime, pas reproductible,
     pas visible dans les migrations.

---

## 🟡 P3 — UX & dette technique

### B11 — Pas de search / sort / pagination / filtre

- **Fichiers** : `pages/admin.tsx` (4 onglets), `routes/*.ts`
- **Symptôme** : `GET /api/equipments` retourne toutes les lignes, l'UI liste tout.
- **Impact actuel** : OK (tables ≤ 50 lignes). **Cassera** à 500+.

### B12 — Mix hooks générés + `apiFetch` bruts

- **Fichier** : `pages/admin.tsx`
- **Symptôme** : create/update utilisent les hooks Orval (`useCreateEquipment`,
  `useUpdateEquipment`), mais **tous les DELETE** et **toutes les opérations sur
  les formules** passent par `apiFetch`/`apiDelete` bruts. L'invalidation du cache
  React Query est manuelle → dé-sync possible.

### B13 — `admin.tsx` monolithique (2035 lignes)

- **Fichier** : `pages/admin.tsx`
- **Symptôme** : 13 onglets, chacun re-duplique le pattern `<Dialog> + <table> +
delete inline + form`. ~150 lignes copiées-collées par onglet.
- **Impact** : coût de maintenance linéaire en nombre d'onglets, divergence de
  style entre onglets déjà visible.

---

## Tableau récapitulatif

| ID  | Titre                                          | P   | Fichier principal                          |
| --- | ---------------------------------------------- | --- | ------------------------------------------ |
| B1  | Pas d'audit log                                | P1  | `routes/*.ts`                              |
| B2  | Pas de pré-check dépendances avant soft-delete | P1  | `routes/*.ts`                              |
| B3  | Pas de réactivation UI                         | P1  | `pages/admin.tsx`                          |
| B4  | Rôles incohérents                              | P1  | `routes/*.ts`                              |
| B5  | 500 au lieu de 409 sur doublon code            | P1  | `routes/*.ts`                              |
| B6  | Champs DB cachés                               | P2  | `routes/*.ts` + `pages/admin.tsx`          |
| B7  | Drift OpenAPI/DB sur catégories                | P2  | `routes/downtime-categories.ts`            |
| B8  | `shortcutEquipments` = CSV sans FK             | P2  | `lib/db/src/schema/downtime-categories.ts` |
| B9  | UI formules : new version / validate manquants | P2  | `pages/admin.tsx`                          |
| B10 | Évaluateur formules + seed implicite           | P2  | `routes/calculation-formulas.ts`           |
| B11 | Pas de search/sort/pagination                  | P3  | partout                                    |
| B12 | Mix hooks générés / apiFetch bruts             | P3  | `pages/admin.tsx`                          |
| B13 | `admin.tsx` monolithique 2035 lignes           | P3  | `pages/admin.tsx`                          |
