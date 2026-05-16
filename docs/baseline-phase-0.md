# Phase 0 — Rapport baseline (avant)

## 1. Contexte

Ce document constitue l'état des lieux technique de référence (« avant ») pour
la Phase 0 du chantier Administration / Paramétrage de `trs-dpi-tracker`. Il
audite les quatre points d'API référentiels exposés par le serveur Express
(`/equipments`, `/products`, `/downtime-categories`, `/cadences`), restitue le
résultat brut du pipeline de validation existant (install, typecheck, lint,
test, build backend, build frontend) et consigne, sans les corriger, les écarts
observés. Aucun changement de code n'est introduit dans le cadre de cette
phase ; seul ce rapport est produit.

- Branche : `main`
- SHA : `4679a023c12c2add0fcc8aca560fffff8da79036`
- Périmètre fonctionnel audité : ressources de paramétrage exposées sous
  `/api/*` par `artifacts/api-server`, partagées avec le SPA `artifacts/trs-app`
  via les schémas Zod générés depuis `lib/api-spec/openapi.yaml` (Orval) dans
  `lib/api-zod/src/generated/api.ts`.

## 2. Environnement et commandes reproductibles

- Système : sandbox Linux, racine du dépôt `/projects/sandbox/trs-dpi-tracker`.
- Node : `v24.14.0` dans la sandbox. Le `Dockerfile` du projet et le workflow
  `.github/workflows/ci.yml` épinglent `node:22-slim` / Node 22. L'écart de
  version majeure (24 vs 22) est consigné comme observation (cf. section 6).
- pnpm : `11.1.2` (installé dans la sandbox via `npm i -g pnpm@latest`).
- Variables d'environnement : aucune `.env` n'est nécessaire pour les étapes
  install / typecheck / lint / test. L'étape de build backend exige
  `DATABASE_URL` non vide (consommée par l'initialiseur Drizzle au chargement
  des modules) ; le CI utilise une URL factice, reprise ici à l'identique.

Les commandes ci-dessous reproduisent strictement la séquence du workflow CI :

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm run lint
pnpm run test
DATABASE_URL=postgresql://fake:fake@localhost:5432/fake \
  pnpm --filter @workspace/api-server run build
pnpm run build:frontend
```

L'étape `docker build` n'a pas été exécutée : la sandbox ne dispose pas d'un
démon Docker accessible et la consigne de la Phase 0 est de ne pas tenter
cette commande. L'image `node:22-slim` produite par `Dockerfile` est utilisée
en production (Railway / Replit) ; elle n'est donc pas exercée par cette
baseline.

## 3. Résultats build / tests / lint

| # | Étape          | Commande                                                                                                | Code de sortie | Durée | Statut                              |
|---|----------------|---------------------------------------------------------------------------------------------------------|----------------|-------|-------------------------------------|
| 1 | install        | `pnpm install --frozen-lockfile --ignore-scripts`                                                       | 0              | 6s    | PASS                                |
| 2 | typecheck      | `pnpm run typecheck`                                                                                    | 2              | 6s    | **FAIL** (108 erreurs sur api-server) |
| 3 | lint           | `pnpm run lint` (`eslint .`)                                                                            | 0              | 4s    | PASS (0 erreur, 81 warnings)        |
| 4 | test           | `pnpm run test` (`vitest run`)                                                                          | 0              | 1s    | PASS (65 tests, suite trs-engine)   |
| 5 | build backend  | `DATABASE_URL=postgresql://fake:fake@localhost:5432/fake pnpm --filter @workspace/api-server run build` | 0              | 1s    | PASS                                |
| 6 | build frontend | `pnpm run build:frontend`                                                                               | 0              | 6s    | PASS                                |
| - | docker build   | (non exécuté, sandbox sans démon Docker)                                                                | n/a            | n/a   | SKIPPED                             |

Les durées proviennent des journaux `runs/01-install.log` à
`runs/06-build-frontend.log` produits par FEAT-001. Les durées install et
build sont influencées par la chaleur du cache `node_modules` (déjà peuplé
dans la sandbox) ; en CI à froid, ces durées sont supérieures.

### 3.1 Erreurs détectées

- **Étape 2 (typecheck)** : échec avec 108 erreurs côté `@workspace/api-server`,
  réparties en trois familles (36 `TS6305` + 71 `TS7006` + 1 `TS18046` = 108).
  - `TS6305` : `Output file 'lib/db/dist/index.d.ts' has not been built from
    source`. Cette erreur indique que `lib/db` n'est pas pré-construit avant
    la phase de typecheck par artefact dans cette exécution ; les déclarations
    `.d.ts` attendues n'existent donc pas lorsque `tsc -p tsconfig.json
    --noEmit` est lancé sur `artifacts/api-server`.
    - Première occurrence verbatim :
      `src/index.ts(2,20): error TS6305: Output file '/projects/sandbox/trs-dpi-tracker/lib/db/dist/index.d.ts' has not been built from source file '/projects/sandbox/trs-dpi-tracker/lib/db/src/index.ts'.`
  - `TS7006` : paramètres implicites `any`. Les fichiers concernés (liste
    exhaustive établie depuis `runs/02-typecheck.log`) sont :
    `routes/admin-config.ts`, `routes/calendar-events.ts`,
    `routes/daily-entries.ts`, `routes/dashboard.ts`,
    `routes/monthly-closures.ts`, `routes/notifications.ts`,
    `routes/planning.ts`, `routes/production-entries.ts`,
    `routes/products.ts`, `services/excelReportService.ts`,
    `scripts/seed.ts` et `scripts/seed_dpi.ts`. (`routes/equipments.ts`
    n'apparaît PAS dans cette famille : ses deux seules erreurs sont des
    `TS6305` aux lignes 2 et 11.)
    - Dernière occurrence verbatim :
      `src/services/excelReportService.ts(299,42): error TS7006: Parameter 'd' implicitly has an 'any' type.`
  - `TS18046` : une unique occurrence,
    `src/routes/production-entries.ts(159,55): error TS18046: 'p' is of type 'unknown'.`
  - Sortie pnpm finale :
    `[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @workspace/api-server@0.0.0 typecheck: tsc -p tsconfig.json --noEmit Exit status 2`.

  Conformément au périmètre de la Phase 0, ces erreurs ne sont pas corrigées.
  Elles sont remontées comme observation (section 6) en vue d'un correctif
  ultérieur (typiquement : ordonner la construction `lib/db` avant la phase
  typecheck par artefact, et annoter les paramètres implicites).

- **Étape 3 (lint)** : aucune erreur. Les 81 warnings se répartissent
  principalement entre `@typescript-eslint/no-unused-vars`,
  `@typescript-eslint/no-explicit-any`, `react-hooks/exhaustive-deps` et
  `no-console` (scripts de seed). `eslint .` quitte avec le code 0 puisque les
  warnings ne font pas échouer le run.
- **Étape 4 (test)** : aucune erreur. La seule suite Vitest présente est
  `artifacts/api-server/src/__tests__/trs-engine.test.ts` (65 cas, tous verts).
  Aucun test n'exerce les quatre points d'API audités à la section 4.
- **Étapes 5 et 6 (builds)** : aucune erreur, aucun warning.

## 4. Audit des endpoints référentiels

Les quatre routeurs sont montés dans `artifacts/api-server/src/app.ts`
(`app.use("/api", router)`) puis assemblés dans
`artifacts/api-server/src/routes/index.ts`. Chaque route exposée est donc
préfixée par `/api`. Les schémas Zod cités correspondent aux constantes
exportées par `@workspace/api-zod` (générées depuis `lib/api-spec/openapi.yaml`
par Orval).

Conventions transverses (vérifiées dans le code) :

- Authentification : `requireAuth` (cf. `artifacts/api-server/src/middlewares/auth.ts`).
  Sur absence de jeton : `401 { error: "Authentication required" }`. Sur
  jeton invalide ou expiré : `401 { error: "Invalid or expired token" }`.
- Autorisation : `requireRole(...)`. Sur rôle manquant :
  `403 { error: "Insufficient permissions" }`.
- Validation : chaque handler en écriture appelle `XBody.safeParse(req.body)`
  et, le cas échéant, `XParams.safeParse(req.params)`. En cas d'échec :
  `400 { error: parsed.error.message }`.
- Gestion globale des erreurs : `app.ts` installe un handler final qui
  renvoie `500 { error: "Internal server error" }` pour toute exception non
  capturée (et `403 { error: "CORS policy violation" }` pour le rejet CORS).
- Soft-delete : sur les ressources qui exposent une route `DELETE /:id`,
  l'opération exécute `db.update(...).set({ isActive: false })` puis renvoie
  `204 No Content`. Aucune route ne remet `isActive` à `true` (vérifié par
  `grep -RIn "reactivate" artifacts lib`, qui ne renvoie aucune occurrence
  dans le code source).
- Filtrage actif / inactif : aucun endpoint n'expose `includeInactive`. Les
  GET retournent toutes les lignes, actives ET inactives, sans filtre serveur
  (vérifié par `grep -RIn "includeInactive" artifacts lib`, zéro occurrence).
- Cache HTTP : `cache30` (`Cache-Control: private, max-age=30`, défini dans
  `artifacts/api-server/src/lib/cache-control.ts`) est appliqué uniquement sur
  `GET /equipments` et `GET /downtime-categories`.

### 4.1 /equipments

- Fichier source : `artifacts/api-server/src/routes/equipments.ts`.
- Schéma : `lib/db/src/schema/equipments.ts` (colonnes `id`, `siteId`, `roomId`,
  `code`, `name`, `equipmentType`, `description`, `trsObjective`, `isActive`,
  `createdAt`, `updatedAt`). Contrainte d'unicité sur `code`.
- Format de réponse (helper `formatEquipment`, lignes 17 à 26) :
  `{ id, name, code, description, trsObjective: number, isActive, createdAt: ISO 8601 string }`.
  Les champs `siteId`, `roomId`, `equipmentType` et `updatedAt` ne sont pas
  projetés.

| Méthode + chemin           | Ligne | Middlewares                                       | Validation Zod                                | Codes renvoyés                                                                                                         |
|----------------------------|------:|---------------------------------------------------|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `GET /api/equipments`      |    27 | `requireAuth`, `cache30`, `asyncHandler`          | (aucune)                                      | `200` tableau de `formatEquipment` ; `401` auth ; `500` global                                                         |
| `POST /api/equipments`     |    32 | `requireAuth`, `requireRole("admin")`             | `CreateEquipmentBody`                         | `201` ; `400` parse ; `401` auth ; `403` rôle ; `500` global (y compris violation d'unicité non interceptée, cf. 6.4) |
| `PATCH /api/equipments/:id`|    45 | `requireAuth`, `requireRole("admin")`             | `UpdateEquipmentParams`, `UpdateEquipmentBody`| `200` ; `400` parse params ou body ; `401` ; `403` ; `404` si la ligne n'existe pas ; `500` global                     |
| `DELETE /api/equipments/:id`|    68 | `requireAuth`, `requireRole("admin")`             | (id récupéré via `req.params["id"]`)          | `204` ; `400` si `id` absent ; `401` ; `403` ; `404` si la ligne n'existe pas ; `500` global                           |

- `POST /api/equipments` n'enveloppe pas l'insertion dans un `try/catch` autour
  de `isUniqueViolation` : un doublon de `code` (Postgres `23505`) remonte au
  handler global et produit donc `500 { error: "Internal server error" }`.
- `includeInactive` : **absent**. `GET /api/equipments` renvoie l'intégralité
  de la table, indépendamment de `isActive`.
- `reactivate` : **absente**. `DELETE` positionne `isActive=false` ; aucune
  route ne remet `isActive` à `true`.

### 4.2 /products

- Fichier source : `artifacts/api-server/src/routes/products.ts` (lignes 1 à
  100 pour `/products`, 102 à fin pour `/cadences`).
- Schéma : `lib/db/src/schema/products.ts` (colonnes `id`, `code`, `name`,
  `dosage`, `pharmaceuticalForm`, `description`, `isActive`, `createdAt`,
  `updatedAt`). Contrainte d'unicité sur `code`.
- Format de réponse (helper `formatProduct`, lignes 17 à 25) :
  `{ id, name, code, description, isActive, createdAt: ISO 8601 string }`.
  Les champs `dosage`, `pharmaceuticalForm` et `updatedAt` ne sont pas projetés.

| Méthode + chemin          | Ligne | Middlewares                            | Validation Zod                            | Codes renvoyés                                                                                                                                                      |
|---------------------------|------:|----------------------------------------|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/products`       |    27 | `requireAuth`                          | (aucune)                                  | `200` tableau de `formatProduct` ; `401` ; `500`                                                                                                                    |
| `POST /api/products`      |    32 | `requireAuth`, `requireRole("admin")`  | `CreateProductBody`                       | `201` ; `400` parse ; `401` ; `403` ; **`409 { error: "Un produit avec ce code existe déjà" }`** sur violation d'unicité (`isUniqueViolation`) ; `500` global       |
| `PATCH /api/products/:id` |    50 | `requireAuth`, `requireRole("admin")`  | `UpdateProductParams`, `UpdateProductBody`| `200` ; `400` parse params ou body ; `401` ; `403` ; `404` si la ligne n'existe pas ; `500` global (la violation d'unicité n'est PAS interceptée sur PATCH)        |
| `DELETE /api/products/:id`|    78 | `requireAuth`, `requireRole("admin")`  | (id récupéré via `req.params["id"]`)      | `204` ; `400` si `id` absent ; `401` ; `403` ; `404` ; `500` global                                                                                                |

- `POST /api/products` est le seul endpoint de cette section qui intercepte
  explicitement `isUniqueViolation` (cf. `artifacts/api-server/src/lib/db-errors.ts`).
  Asymétrie consignée en section 6.
- `GET /api/products` n'utilise aucune middleware de cache (pas de `cache30`).
- `includeInactive` : **absent**. `GET /api/products` renvoie tous les produits.
- `reactivate` : **absente**. `DELETE` positionne `isActive=false` ; pas de
  réactivation.

### 4.3 /downtime-categories

- Fichier source : `artifacts/api-server/src/routes/downtime-categories.ts`.
- Schéma : `lib/db/src/schema/downtime-categories.ts` (colonnes `id`, `code`,
  `label`, `description`, `famille`, `impactType`, `impactKpi`, `isPlanned`,
  `requiresComment`, `isActive`, `isQuickShortcut`, `shortcutEquipments`,
  `createdAt`, `updatedAt`). Contrainte d'unicité sur `code`.
- Format de réponse (helper `formatCategory`, lignes 16 à 29) :
  `{ id, code, label, description, famille, impactType, isPlanned, requiresComment, isActive, isQuickShortcut, shortcutEquipments }`.
  Les champs `impactKpi`, `createdAt` et `updatedAt` ne sont pas projetés.

| Méthode + chemin                       | Ligne | Middlewares                                              | Validation Zod                                                  | Codes renvoyés                                                                                          |
|----------------------------------------|------:|----------------------------------------------------------|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `GET /api/downtime-categories`         |    31 | `requireAuth`, `cache30`, `asyncHandler`                 | (aucune)                                                        | `200` tableau de `formatCategory` ; `401` ; `500`                                                       |
| `POST /api/downtime-categories`        |    36 | `requireAuth`, `requireRole("admin", "supervisor")`      | `CreateDowntimeCategoryBody`                                    | `201` ; `400` parse ; `401` ; `403` ; `500` (violation d'unicité non interceptée)                       |
| `PATCH /api/downtime-categories/:id`   |    50 | `requireAuth`, `requireRole("admin", "supervisor")`      | `UpdateDowntimeCategoryParams`, `UpdateDowntimeCategoryBody`    | `200` ; `400` parse params ou body ; `401` ; `403` ; `404` ; `500`                                      |
| `DELETE /api/downtime-categories/:id`  |    73 | `requireAuth`, `requireRole("admin")`                    | (id récupéré via `req.params["id"]`)                            | `204` ; `400` si `id` absent ; `401` ; `403` ; `404` ; `500`                                            |

- Spécificité notée : sur `POST` et `PATCH`, les champs `isQuickShortcut` et
  `shortcutEquipments` sont extraits de `req.body` avant `safeParse`, puis
  réinjectés manuellement sur l'objet d'insertion / de mise à jour. Ces deux
  champs ne sont donc pas validés par Zod ; le typage TypeScript est appliqué
  à la main sur `req.body`.
- `requireRole` n'est pas symétrique entre méthodes : `POST` et `PATCH`
  acceptent `admin` ET `supervisor`, alors que `DELETE` exige `admin`. À
  confirmer avec les rôles fonctionnels (cf. section 6).
- `includeInactive` : **absent**.
- `reactivate` : **absente**. `DELETE` positionne `isActive=false`.

### 4.4 /cadences

- Fichier source : `artifacts/api-server/src/routes/products.ts` (lignes 102 à
  fin). Le routeur `products` héberge également les routes `/cadences`.
- Schéma : `lib/db/src/schema/cadences.ts` (colonnes `id`, `productId`,
  `equipmentId`, `referenceCadence`, `theoreticalCadence`, `validatedCadence`,
  `unit`, `validFrom` (défaut `2025-01-01`), `validTo`, `source`, `isActive`,
  `createdAt`, `updatedAt`). Contrainte d'unicité composite sur
  `(productId, equipmentId, validFrom)`.
- Format de réponse (projection en ligne dans la requête `db.select({ ... })`,
  lignes 104 à 113 et 180 à 194) :
  `{ id, productId, equipmentId, theoreticalCadence: number, validatedCadence: number, unit, productName, equipmentName }`.
  Les champs `referenceCadence`, `validFrom`, `validTo`, `source`, `isActive`,
  `createdAt`, `updatedAt` **ne sont pas projetés**. Les valeurs numériques
  (stockées en `numeric`) sont converties via `parseFloat` côté serveur.

| Méthode + chemin       | Ligne | Middlewares                            | Validation Zod                                | Codes renvoyés                                                                                                            |
|------------------------|------:|----------------------------------------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `GET /api/cadences`    |   102 | `requireAuth`                          | `ListCadencesQueryParams` (UUID `productId` / `equipmentId` optionnels) | `200` tableau projeté (jointure produits + équipements) ; `401` ; `500`. Si `safeParse` échoue, les filtres sont ignorés (le code reste à `200`). |
| `POST /api/cadences`   |   138 | `requireAuth`, `requireRole("admin")`  | `UpsertCadenceBody`                           | **`200`** (et non `201`) que la ligne soit créée ou mise à jour ; `400` parse ; `401` ; `403` ; `500`                     |

- Aucune route `DELETE /api/cadences/:id` ni `PATCH /api/cadences/:id` :
  l'unique opération d'écriture est l'upsert de `POST /api/cadences`, qui
  cherche une ligne existante sur `(productId, equipmentId)` puis met à jour
  ou insère.
- L'upsert ne tient pas compte de `isActive` : si une cadence existante a
  `isActive=false`, elle est mise à jour en place, pas réactivée explicitement
  (le champ n'est pas touché par le `set(...)`).
- Le statut HTTP `200` est utilisé même sur insertion (pas de différenciation
  création / mise à jour).
- `includeInactive` : **absent** (la projection ne contient même pas le
  champ `isActive`, donc le client ne peut pas distinguer les cadences
  désactivées).
- `reactivate` : **absente** (pas de DELETE non plus, aucun cycle de cycle
  désactivation / réactivation côté API).
- Pas de `cache30`.

## 5. Synthèse transversale

| Endpoint              | `includeInactive` | `reactivate` | Soft-delete                                                       | Cache GET | Validation Zod                                                                  |
|-----------------------|-------------------|--------------|-------------------------------------------------------------------|-----------|---------------------------------------------------------------------------------|
| `/equipments`         | absent            | absent       | oui (`isActive=false`)                                            | `cache30` | `CreateEquipmentBody`, `UpdateEquipmentBody`, `UpdateEquipmentParams`           |
| `/products`           | absent            | absent       | oui (`isActive=false`)                                            | aucun     | `CreateProductBody`, `UpdateProductBody`, `UpdateProductParams`                 |
| `/downtime-categories`| absent            | absent       | oui (`isActive=false`)                                            | `cache30` | `CreateDowntimeCategoryBody`, `UpdateDowntimeCategoryBody`, `UpdateDowntimeCategoryParams` |
| `/cadences`           | absent            | absent       | non (table possède `isActive`, mais aucune route `DELETE` ; la projection ne renvoie pas `isActive`) | aucun     | `ListCadencesQueryParams`, `UpsertCadenceBody`                                  |

Vérifications grep complémentaires effectuées au moment de la rédaction :

```bash
$ grep -RIn -E "includeInactive|reactivate" artifacts lib --exclude-dir=node_modules
(aucun résultat)
```

Les seules occurrences de `reactivate` dans `artifacts/` ou `lib/` proviennent
de fichiers `node_modules/@types/node/timers.d.ts` (commentaires JSDoc des
typings de Node), donc hors code source applicatif.

## 6. Observations (non corrigées)

1. `includeInactive` n'existe sur aucun des quatre endpoints. Le filtrage
   actif / inactif est entièrement à la charge du client : la liste mélange
   systématiquement les deux états. Aucune middleware de filtrage par
   défaut n'est appliquée non plus.
2. Aucune route `reactivate` ni de restauration n'est exposée. Une fois
   `isActive=false`, l'enregistrement ne peut être réactivé que par
   modification directe en base (ou via un PATCH passant `isActive=true` sur
   les ressources où le champ est inclus dans `UpdateXBody`, à confirmer
   ressource par ressource).
3. `/cadences` ne projette ni `isActive`, ni `validFrom`, ni `validTo`. Côté
   API, il est donc impossible de distinguer une cadence active d'une
   cadence désactivée, ni de connaître la fenêtre de validité ; `POST /cadences`
   réalise un upsert sans modifier `isActive`.
4. `POST /equipments` et `POST /downtime-categories` ne gèrent pas la
   violation d'unicité Postgres (`23505`) : un doublon de `code` provoque un
   `500 { error: "Internal server error" }` au lieu d'un `409`. Seul
   `POST /products` enveloppe l'insertion dans un `try / catch` autour de
   `isUniqueViolation` et renvoie `409 { error: "Un produit avec ce code
   existe déjà" }`. Le helper `isUniqueViolation` est pourtant disponible
   dans `artifacts/api-server/src/lib/db-errors.ts`.
5. Sur `/downtime-categories`, `POST` et `PATCH` autorisent les rôles
   `admin` ET `supervisor` alors que `DELETE` exige `admin`. Asymétrie à
   confirmer avec la matrice de rôles fonctionnels.
6. `POST /cadences` renvoie `200` même lorsque la cadence est créée (pas de
   `201` pour l'insertion). Le client ne peut pas distinguer création et
   mise à jour à partir du seul code HTTP.
7. Aucune pagination ni enveloppe (`{ data, meta }`) : chaque `GET` renvoie
   un tableau brut. Les listes peuvent croître sans limite côté serveur.
   Les schémas `ListXResponse` du `openapi.yaml` sont également des tableaux
   nus.
8. Couverture de tests : la seule suite Vitest existante est
   `artifacts/api-server/src/__tests__/trs-engine.test.ts` (65 cas). Aucun
   test ne touche les quatre endpoints référentiels audités ici, ni les
   middlewares `requireAuth` / `requireRole`, ni le helper `isUniqueViolation`.
9. La phase `pnpm run typecheck` échoue en local et reproduit 108 erreurs
   (cf. section 3.1) : famille `TS6305` (artefacts non pré-construits sur
   `lib/db`) et famille `TS7006` (paramètres implicites `any`). Le CI peut
   passer en raison d'un ordre de build différent ou d'un cache, mais le
   point est à instrumenter pour ne plus tolérer cet écart entre exécutions
   locales et CI.
10. Effet de bord du typecheck : `pnpm run typecheck` modifie
    `lib/api-client-react/tsconfig.tsbuildinfo` et
    `lib/api-zod/tsconfig.tsbuildinfo` (`lib/db/tsconfig.tsbuildinfo` est
    également suivi mais reste stable lors du typecheck par artefact). La
    règle `*.tsbuildinfo` figure pourtant déjà à la ligne 7 de `.gitignore` ;
    les trois fichiers (`lib/api-client-react/tsconfig.tsbuildinfo`,
    `lib/api-zod/tsconfig.tsbuildinfo`, `lib/db/tsconfig.tsbuildinfo`) sont
    suivis parce qu'ils ont été commités avant que la règle s'applique. La
    remédiation correcte est `git rm --cached` sur ces trois chemins (et non
    une modification de `.gitignore`, déjà en place), à programmer dans une
    phase ultérieure.
11. Les helpers `format*` projettent une vue partielle de chaque ressource :
    `equipments` masque `siteId`, `roomId`, `equipmentType`, `updatedAt` ;
    `products` masque `dosage`, `pharmaceuticalForm`, `updatedAt` ;
    `downtime-categories` masque `impactKpi`, `createdAt`, `updatedAt` ;
    `cadences` masque `referenceCadence`, `validFrom`, `validTo`, `source`,
    `isActive`, `createdAt`, `updatedAt`. Les consommateurs API n'ont donc
    aucun accès à `updatedAt` sur les quatre ressources, ce qui complique
    toute logique d'horodatage (ETag, conflit optimiste, audit léger).
12. L'étape `docker build` n'est pas exercée par cette baseline, alors que
    le projet ship un `Dockerfile` `node:22-slim` utilisé par les déploiements
    Railway / Replit. Couverture à ajouter dans le pipeline lorsque la
    sandbox / le runner le permet.
13. Le helper `formatCategory` (`routes/downtime-categories.ts`, lignes 15 à
    29) renvoie 11 champs incluant `isQuickShortcut` et `shortcutEquipments`,
    mais le schéma `ListDowntimeCategoriesResponseItem` du contrat
    (`lib/api-zod/src/generated/api.ts`, lignes 275 à 293) et la définition
    `DowntimeCategory` correspondante dans `lib/api-spec/openapi.yaml`
    (lignes 1310 à 1335) ne déclarent que 9 champs et omettent
    `isQuickShortcut` et `shortcutEquipments`. Le contrat publié
    sous-décrit donc la réponse réelle de `GET /api/downtime-categories`.
14. `POST /api/cadences` (`routes/products.ts`, lignes 145 à 153) recherche
    une ligne existante uniquement sur `(productId, equipmentId)` avant de
    décider entre `update` et `insert`. La contrainte d'unicité de
    `cadencesTable` est pourtant `(productId, equipmentId, validFrom)`
    (`lib/db/src/schema/cadences.ts:22`). Lorsque plusieurs versions
    `validFrom` coexistent pour le même couple produit/équipement,
    l'upsert met à jour `existing[0]` de manière non déterministe et peut
    cibler une autre version que celle attendue par l'appelant.
15. Les routes `PATCH /api/equipments/:id`, `PATCH /api/products/:id` et
    `PATCH /api/downtime-categories/:id` n'enveloppent pas l'appel `db.update`
    dans un `try/catch` autour de `isUniqueViolation`. Une collision sur le
    champ `code` lors d'un PATCH produit donc un `500 { error: "Internal
    server error" }`, y compris sur `/products` dont le `POST` traite
    pourtant explicitement l'erreur `23505` en `409`. L'observation 4 ne
    couvrait que le côté POST ; l'asymétrie existe également côté PATCH.

Ces points sont documentés en l'état ; aucun correctif n'est appliqué dans le
cadre de la Phase 0.

## 7. Annexes

Journaux bruts produits par FEAT-001 (chemins relatifs au dépôt) :

- `.agents/tasks/task-baseline-phase-0/runs/SUMMARY.md`
- `.agents/tasks/task-baseline-phase-0/runs/01-install.log`
- `.agents/tasks/task-baseline-phase-0/runs/02-typecheck.log`
- `.agents/tasks/task-baseline-phase-0/runs/03-lint.log`
- `.agents/tasks/task-baseline-phase-0/runs/04-test.log`
- `.agents/tasks/task-baseline-phase-0/runs/05-build-backend.log`
- `.agents/tasks/task-baseline-phase-0/runs/06-build-frontend.log`
