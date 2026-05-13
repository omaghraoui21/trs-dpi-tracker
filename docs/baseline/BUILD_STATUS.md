# État du build — baseline `fix/admin-parametrage`

Date : 2026-05-13 — Commit parent : `4679a02`

## Commande

```bash
pnpm build   # = typecheck (libs + artifacts) + build récursif
```

## Résultats

| Package                             | Typecheck | Build            | Notes                                                                                             |
| ----------------------------------- | --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `@workspace/db` (lib)               | ✅        | ✅ (emit .d.ts)  |                                                                                                   |
| `@workspace/api-zod` (lib)          | ✅        | ✅ (emit .d.ts)  |                                                                                                   |
| `@workspace/api-client-react` (lib) | ✅        | ✅ (emit .d.ts)  |                                                                                                   |
| `@workspace/api-server`             | ✅        | ✅               | `dist/index.mjs` = **6.8 MB**                                                                     |
| `@workspace/trs-app` (front)        | ✅        | ✅               | bundle total = **~1.4 MB**, `admin` chunk = **78 KB**                                             |
| `@workspace/mockup-sandbox`         | ✅        | ❌               | fail sur `PORT` env var manquant — **non bloquant** (package auxiliaire, hors périmètre chantier) |
| `scripts`                           | ✅        | — (pas de build) |                                                                                                   |

## Point d'attention

Le script root `pnpm build` échoue actuellement parce que `mockup-sandbox`
dépend d'une variable d'env `PORT` au temps de build. Pour un build propre
des deux packages qui nous intéressent, utiliser :

```bash
pnpm typecheck:libs                                     # compile les libs d'abord
pnpm --filter @workspace/api-server run build           # OK
PORT=3001 BASE_PATH=/ pnpm --filter @workspace/trs-app run build   # OK
```

Le script `pnpm validate:production` à la racine fait exactement ça
et devrait être utilisé pour valider le chantier.

## Piège détecté : project references TypeScript

`pnpm typecheck:libs` (qui fait `tsc --build`) **ne reconstruit pas les .d.ts
des libs si le tsbuildinfo les considère à jour mais que `dist/` a été supprimé**.
Si les typecheck des artifacts échouent sur `TS6305 Output file ... has not been built`,
relancer :

```bash
rm -rf lib/*/dist lib/*/tsconfig.tsbuildinfo
npx tsc --build --force
```
