# Migration vers serveur PostgreSQL entreprise

## Pourquoi c'est simple

L'application utilise PostgreSQL standard via Drizzle ORM.
Aucun code propriétaire Supabase n'est requis pour les fonctionnalités de base.
La migration se résume à changer `DATABASE_URL`.

## Prérequis serveur

- PostgreSQL ≥ 14 (recommandé : 16)
- Extension `pgcrypto` activée (pour `gen_random_uuid()`)
- Accès réseau depuis le serveur d'application

## Étape 1 — Exporter les données depuis Supabase

```bash
# Export complet (schéma + données)
pg_dump $SUPABASE_DATABASE_URL \
  --no-owner \
  --no-privileges \
  --format=plain \
  --file=backup_$(date +%Y%m%d).sql

# Export données uniquement (sans schéma)
pg_dump $SUPABASE_DATABASE_URL \
  --data-only \
  --format=plain \
  --file=data_$(date +%Y%m%d).sql
```

## Étape 2 — Initialiser le serveur entreprise

```bash
# Créer la base de données
psql -h $COMPANY_HOST -U postgres -c "CREATE DATABASE dpi_trs;"

# Activer l'extension UUID
psql -h $COMPANY_HOST -U postgres -d dpi_trs -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Appliquer le schéma
psql -h $COMPANY_HOST -U postgres -d dpi_trs < database/schema.sql

# Importer les données
psql -h $COMPANY_HOST -U postgres -d dpi_trs < data_YYYYMMDD.sql
```

## Étape 3 — Mettre à jour la variable d'environnement

```env
# Avant (Supabase)
DATABASE_URL=postgresql://postgres:[password]@[supabase-host]:5432/postgres

# Après (serveur entreprise)
DATABASE_URL=postgresql://dpi_user:[password]@[company-host]:5432/dpi_trs
```

## Étape 4 — Vérification

```bash
# Tester la connexion
pnpm --filter @workspace/api-server exec node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) FROM users').then(r => console.log('OK:', r.rows[0]));
"

# Vérifier le nombre de lignes par table
psql $DATABASE_URL -c "
SELECT schemaname, tablename, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"
```

## Gestion des migrations futures

Utiliser Drizzle Kit en mode migration (au lieu de push) pour la production :

```bash
# Générer une migration SQL versionnée
pnpm --filter @workspace/db run generate

# Appliquer la migration
pnpm --filter @workspace/db run migrate

# Ne jamais utiliser 'push' en production (destructeur)
```

## Checklist migration

- [ ] Backup Supabase complet
- [ ] Schéma appliqué sur serveur entreprise
- [ ] Données importées et vérifiées (comptage lignes)
- [ ] Tests de connexion API
- [ ] Variables d'environnement mises à jour (prod + staging)
- [ ] DNS/firewall mis à jour
- [ ] Backup automatique configuré sur nouveau serveur
- [ ] Monitoring configuré (pg_activity, pgBadger)

## Backup automatique (cron)

```bash
#!/bin/bash
# /etc/cron.d/dpi_trs_backup
BACKUP_DIR=/var/backups/dpi_trs
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
pg_dump $DATABASE_URL \
  --format=custom \
  --file=$BACKUP_DIR/dpi_trs_$DATE.dump

# Garder 30 jours
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete
```
