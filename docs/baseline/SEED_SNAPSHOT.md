# Snapshot des données de référence — baseline

Référence pour vérifier qu'un seed post-chantier produit toujours les mêmes codes.

Sources :

- `artifacts/api-server/src/scripts/seed.ts` (seed générique)
- `artifacts/api-server/src/scripts/seed_dpi.ts` (seed DPI TERIAK EF — le seed métier réel)

## 1. Site (seed_dpi)

| Code | Nom                 |
| ---- | ------------------- |
| `EF` | Site El Fejja — DPI |

## 2. Locaux (seed_dpi)

`A23`, `A26`, `A27`, `BLISTER`, `SEC`, `A20`, `A19`, `A18` — 8 locaux

## 3. Équipements

### Seed générique (`seed.ts`)

| Code      | Nom                                | Type            | TRS obj |
| --------- | ---------------------------------- | --------------- | ------- |
| `GEL-001` | Géluleuse Harro Höfliger           | geluleuse       | 75      |
| `BLI-001` | Blistereuse IMA TR135 S            | blistereuse     | 75      |
| `LCS-001` | Ligne conditionnement secondaire 1 | conditionnement | 70      |
| `LCS-002` | Ligne conditionnement secondaire 2 | conditionnement | 70      |

### Seed DPI (`seed_dpi.ts`)

`GEL-HH-MODUC`, `BLI-IMA-TR135S`, `TAM-RUSSELL`, `MEL-INVERSINA-20L`, `F0171`, `SEC-L1`, `SEC-L2` — 7 équipements

## 4. Produits

### Seed générique

`PROD-001` (Amoxicilline 500mg), `PROD-002` (Paracétamol 1000mg), `PROD-003` (Ibuprofène 400mg), `PROD-004` (Oméprazole 20mg), `PROD-005` (Metformine 850mg) — 5 produits

### Seed DPI

`AEROFOR-12`, `AERONIDE-200`, `AERONIDE-400`, `COMBIFOR-12-200`, `COMBIFOR-12-400` — 5 produits DPI

## 5. Types d'arrêts (Downtime categories)

### Seed générique — 12 catégories

`NET-PLAN`, `MAINT-PREV`, `REGLAGE`, `PANNE`, `ATTENTE-MAT`, `ATTENTE-DOC`, `MICRO-ARRET`, `RALENTIS`, `REBUT`, `REPROCESSING`, `FERMETURE`, `REUNION`

### Seed DPI — 36 catégories (regroupées par famille)

**Poudre (4)** : `BOUCH`, `ECOUL`, `POUDRE_COLLANTE`, `SEGREG`
**Géluleuse (7)** : `AG`, `REGL_GEL`, `ALIM_GEL`, `POIDS_HORS_TENDANCE`, `REJET_GELULE`, `DEDUSTER`, `VACUUM`
**Blistereuse (9)** : `AB`, `CHG_PVC`, `CHG_ALU`, `CHG_COMBIFOR`, `CAMERA`, `THERMOFORMAGE`, `SCELLAGE`, `DECALAGE`, `ALIM_BLISTERS`
**Changements / nettoyage (5)** : `CHSG`, `NET_COMP_LOCAL`, `NET_MAJ_EQ`, `NET_MIN_EQ`, `VA`
**Attentes (6)** : `MQCH`, `ATT_MP`, `ATT_GEL`, `ATT_PVC`, `ATT_ALU`, `ATT_ETUI`
**Maintenance (4)** : `IM`, `PANNE_MECA`, `PANNE_ELEC`, `UTIL`
**Qualité (4)** : `NQ`, `OOS_POIDS`, `REBUT`, `ATT_CQ`
**Performance (3)** : `SP`, `ECART_CADENCE`, `MICRO_ARRETS`
**Organisation (3)** : `ORG`, `PAUSE`, `FORMATION`

## 6. Règles de calcul (formules TRS) — seeded on first GET

Auto-seed de 13 formules NF E 60-182 dans `routes/calculation-formulas.ts` :
`TRS`, `TRG`, `TRE`, `DO`, `TP`, `TQ`, `tT`, `tO`, `tR`, `tF`, `tN`, `tU`, `PLANNING`

Toutes en `version: 1`, `validationStatus: "validated"`, `isActive: true`.

## 7. Utilisateurs (seed générique)

| Email                   | Rôle       | Mot de passe initial |
| ----------------------- | ---------- | -------------------- |
| `admin@dpi.local`       | admin      | `admin123`           |
| `superviseur@dpi.local` | supervisor | `super123`           |
| `operateur@dpi.local`   | operator   | `oper123`            |
