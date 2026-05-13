# Baseline — chantier `fix/admin-parametrage`

Ce dossier fige l'état du projet **avant** le chantier de refonte du paramétrage
(équipements, produits, types d'arrêts, règles de calcul).

Il sert de point de comparaison pour vérifier qu'aucune régression n'a été
introduite par le chantier.

## Contexte

- **Branche** : `fix/admin-parametrage`
- **Commit parent** (sur `main`) : `4679a02` — _Fix Railway production install_
- **Date** : 2026-05-13
- **Node** : v22 (nvm), **pnpm** : 10.28.1

## Fichiers

| Fichier            | Contenu                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `BUILD_LOG.txt`    | Log complet de `pnpm build` avant chantier                                             |
| `BUILD_STATUS.md`  | Résumé du build (ce qui passe / ce qui échoue)                                         |
| `SEED_SNAPSHOT.md` | Snapshot des codes de référence attendus (équipements, produits, catégories, formules) |
| `KNOWN_BUGS.md`    | Inventaire des bugs/incohérences identifiés sur le paramétrage                         |

## Seed DB : pas de dump SQL

Nous n'avons pas accès à Postgres depuis la sandbox de développement.
Le "seed" de référence est donc constitué des **scripts TypeScript** suivants
(versionnés dans git, exécutables de manière idempotente) :

- `artifacts/api-server/src/scripts/seed.ts` — seed générique (4 équipements, 5 produits, 12 types d'arrêts)
- `artifacts/api-server/src/scripts/seed_dpi.ts` — seed site DPI TERIAK EF (seed métier réel, idempotent via `onConflictDoNothing`)
- `artifacts/api-server/src/scripts/seed-passwords.ts` — réinitialisation des mots de passe utilisateurs

**Pour restaurer l'état de référence en cas de casse :**

```bash
# Depuis la racine du repo
git checkout fix/admin-parametrage -- artifacts/api-server/src/scripts/
pnpm --filter @workspace/api-server exec tsx src/scripts/seed_dpi.ts
```

Le contenu exact attendu après seed est listé dans `SEED_SNAPSHOT.md`.
