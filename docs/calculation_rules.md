# Règles de calcul TRS — NF E 60-182

## Définitions des temps

| Symbole | Nom | Définition |
|---------|-----|------------|
| tT | Temps Total | Durée du calendrier (24h/jour, 365j/an) |
| tO | Temps d'Ouverture | tT − fermetures planifiées (week-end, congés, jours fériés) |
| tR | Temps Requis | tO − arrêts planifiés non productifs (réunions, nettoyage planifié) |
| tF | Temps de Fonctionnement | tR − arrêts non planifiés (pannes, attentes matière) |
| tN | Temps Net | Temps théorique pour produire la quantité réelle à cadence nominale |
| tU | Temps Utile | Temps théorique pour produire la quantité conforme à cadence nominale |

## Formules TRS

```
DO  = tF / tR          (Disponibilité Opérationnelle)
TP  = tN / tF          (Taux de Performance)
TQ  = tU / tN          (Taux de Qualité)
TRS = DO × TP × TQ = tU / tR
```

## Formules TRG / TRE

```
TRG = tU / tO          (Taux de Rendement Global)
TRE = tU / tT          (Taux de Rendement Économique)
```

## Calcul tN et tU

```
tN = quantityProduced  / cadenceNominale  (en minutes)
tU = quantityConforming / cadenceNominale (en minutes)
```

La cadence nominale utilisée est `validated_cadence` de la table `cadences`, filtrée par :
- `product_id` et `equipment_id` correspondants
- `valid_from <= date_saisie` AND (`valid_to IS NULL` OR `valid_to >= date_saisie`)

## Calcul mensuel (RÈGLE CRITIQUE)

**Ne jamais faire la moyenne des TRS journaliers.**

```sql
-- TRS mensuel correct :
TRS_mensuel = SUM(tU) / SUM(tR)

-- Exemple de calcul incorrect (à éviter) :
-- TRS_mensuel = AVG(TRS_journalier)  ← FAUX
```

Implémentation dans `kpi_monthly` :
```
trs = t_u_total / t_r_total
```

## Seuils de couleur

| Seuil | Couleur | Signification |
|-------|---------|---------------|
| TRS ≥ 75% | Vert | Objectif atteint |
| 55% ≤ TRS < 75% | Orange | Surveillance |
| TRS < 55% | Rouge | Alerte |

## Impact des arrêts sur les temps

| impact_type | Arrêt déduit de |
|-------------|-----------------|
| tO | Temps d'ouverture (fermeture planifiée) |
| tR | Temps requis (arrêt planifié non productif) |
| tF | Temps de fonctionnement (panne, attente) |
| tN | Temps net (micro-arrêts, ralentissements) |
| tU | Temps utile (rebuts, non-qualité) |
| TQ | Impact qualité direct |

## Agrégation planning vs réalisé

```
planning_adherence_rate = produced_quantity / planned_quantity
```

Si `planned_quantity = 0`, le taux est `NULL` (non calculable).
