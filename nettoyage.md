# Nettoyage sécurité — À faire

## Tokens à révoquer immédiatement
- [ ] Token Supabase exposé dans le chat → Supabase > Account > Access Tokens > Revoke
- [ ] Token Railway exposé dans le chat → railway.app > Account Settings > Tokens > Revoke

## Mot de passe base de données
- [ ] Changer le mot de passe DB Supabase → Supabase > Project Settings > Database > Reset password
- [ ] Mettre à jour `DATABASE_URL` dans Railway avec le nouveau mot de passe → Railway > Variables
- [ ] Mettre à jour le secret `DATABASE_URL` dans GitHub → Settings > Secrets and variables > Actions

## Compte admin app
- [ ] Changer le mot de passe du compte `omaghraoui@gmail.com` dans l'app (exposé dans le chat)

## Workflow backup (déjà fait)
- [x] Fix SSL (`PGSSLMODE=require`)
- [x] Fix pooler IPv4 (`aws-1-eu-west-3.pooler.supabase.com`)
- [x] Fix version `pg_dump 17`
- [x] Backup fonctionnel avec artifact 90 jours
- [ ] Mettre à jour `actions/upload-artifact@v4` → `@v5` avant juin 2026 (dépréciation Node.js 20)
