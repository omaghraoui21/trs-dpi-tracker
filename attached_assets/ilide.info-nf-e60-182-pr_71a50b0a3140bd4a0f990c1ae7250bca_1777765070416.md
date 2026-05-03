Boutique AFNOR
NF E 60-182 — 4 —

#  Avant-propos

Le présent document a été élaboré sur base des recommandations CNOMO traitant du même sujet et des usages en vigueur et présente une application de certains indicateurs de performance.

Le taux de rendement synthétique, le taux de rendement global et le taux de rendement économique permettent de réaliser un suivi fiable de l'évolution des moyens de production. Ils peuvent servir d'outil pour améliorer le pilotage de la production en définissant les axes de progrès et en suivant les performances industrielles.

#  1 Domaine d'application

La présente norme précise les définitions des temps d'état et des éléments nécessaires à l'évaluation des indicateurs de performance des moyens de production des industries manufacturières dénommés taux de rendement synthétique (TRS), taux de rendement global (TRG), et taux de rendement économique (TRE) destinés à permettre un suivi fiable de ces moyens.

#  2 Termes et définitions

NOTE La figure 1 présente les termes et définitions donnés dans le présent article.

##  2.1 Moyen de production

machine ou groupe de machines (incluant outillages et auxiliaires) en fonctionnement automatique ou semi automatique

##  2.2 Temps d'état d'un moyen de production

NOTE Un temps d'état, temps pendant lequel un moyen de production est dans un état particulier (fonctionnement, arrêt,...), est caractérisé par la durée écoulée entre deux instants mesurables liés au moyen.

###  2.2.1
**temps total**
**$t_T$**
temps de référence intégrant l'ensemble des états possibles du moyen

NOTE Pour une journée, le temps total est de 24 h ; pour une semaine, le temps total est de 168 h ; pour un an, le temps total est de 365 jours $\times$ 24 h, etc.

###  2.2.2
**temps d'ouverture**
**$t_O$**
partie du temps total ($t_T$) correspondant à l'amplitude des horaires de travail du moyen de production et incluant les temps d'arrêt de désengagement du moyen de production par exemple (nettoyage, sous charge, modification, essai, formation, réunion, pause, maintenance préventive,...)

###  2.2.3
**temps requis**
**$t_R$**
partie du temps d'ouverture ($t_O$) pendant lequel l'utilisateur engage son moyen de production avec la volonté de produire comprenant les temps d'arrêt subis et programmés (par exemple pannes, changement de série, réglage, absence de personnel)

Boutique AFNOR · — 5 — NF E 60-182

### 2.2.4
**temps d'arrêt propre**
**$t_{AP}$**
AF
partie du temps requis ($t_R$) correspondant au temps d'arrêt imputable au moyen de production

NOTE 1 Ce temps peut être décomposé pour permettre une analyse plus fine des causes d'arrêt et une meilleure mesure des résultats des actions correctives.

NOTE 2 Ce temps correspond à la somme des temps de panne ($t_P$), temps d'arrêt d'exploitation ($t_{AE}$), temps d'arrêt fonctionnels ($t_{AF}$) et temps de micro arrêts ($t_{MA}$).

#### 2.2.4.1
**temps de panne**
**$t_P$**
partie du temps d'arrêt propre ($t_{AP}$) dûe à un dysfonctionnement

NOTE La cause de cet arrêt peut être imputable à une panne liée au moyen de production, au produit entrant. C'est la partie aléatoire du $t_{AP}$.

#### 2.2.4.2
**temps d'arrêt d'exploitation**
**$t_{AE}$**
At
partie du temps d'arrêt propre ($t_{AP}$) provoquée par l'utilisateur par exemple pour les arrêts de service dus à l'impossibilité du personnel de remplir sa fonction, à des problèmes de qualité,...

#### 2.2.4.3
**temps d'arrêt fonctionnels**
**$t_{AF}$**
partie programmée du temps d'arrêt propre ($t_{AP}$) qui peut se décomposer en :

* $t_{COP}$ Temps de changement d'outil programmé
* $t_{RF}$ Temps de réglage fréquentiel
* $t_{DC}$ Temps de contrôle
* $t_{CF}$ Temps de changement de fabrication
* $t_{EF}$ Temps d'entretien fréquentiel

#### 2.2.4.4
**temps de micro arrêt**
**$t_{MA}$**
MA
partie du temps d'arrêt propre ($t_{AP}$) constituée de temps d'arrêt difficilement mesurables dont le seuil est défini par l'entreprise

### 2.2.5
**temps d'arrêt induit**
**$t_{AI}$**
SAI
partie du temps requis ($t_R$) correspondant au temps d'arrêt pendant lequel le moyen de production ne peut accomplir sa fonction pour des causes externes : défaut d'approvisionnement, saturation de pièces, manque de personnel, manque de ressources extérieures, défaut d'énergie

### 2.2.6
**temps de fonctionnement**
**$t_F$**
partie du temps requis ($t_R$) pendant lequel le moyen de production produit des pièces bonnes et mauvaises dans le respect ou non du temps de cycle de référence ($t_{CR}$) et avec toutes ou parties des fonctions en service

Boutique AFNOR
NF E 60-182 — 6 —

### 2.2.7
**temps net**
**t<sub>N</sub>**
partie du temps de fonctionnement (t<sub>E</sub>) pendant lequel le moyen de production aurait produit des pièces bonnes et mauvaises, dans le respect du temps de cycle de référence (t<sub>CR</sub>)

### 2.2.8
**temps utile**
**t<sub>u</sub>**
partie du temps net (t<sub>N</sub>) correspondant au temps non mesurable obtenu en multipliant le nombre de pièces bonnes par le temps de cycle de référence (t<sub>CR</sub>)

## 2.3 Autres définitions

### 2.3.1
**temps de cycle de référence**
**t<sub>CR</sub>**
temps fixé pour obtenir une pièce compte tenu du moyen de production (temps théorique défini par les «Méthodes»)

### 2.3.2
**nombre de pièces réalisées**
**NPR**
nombre de pièces bonnes (pièces conformes) et mauvaises (pièces non conformes) réalisées

### 2.3.3
**nombre de pièces bonnes**
**NPB**
nombre de pièces bonnes (pièces conformes) réalisées

### 2.3.4
**nombre de pièces théoriquement réalisables**
**NPTR**
nombre de pièces qui auraient été produites pendant le temps requis si le moyen de production fonctionnait au temps de cycle de référence

## 2.4 Indicateurs

### 2.4.1 taux stratégique d'engagement des moyens
**T<sub>S</sub>**
rapport entre le temps d'ouverture (t<sub>O</sub>) et le temps total (t<sub>T</sub>)

$$ T_S = \frac{t_O}{t_T} $$

### 2.4.2 taux de charge
**T<sub>C</sub>**
rapport entre le temps requis (t<sub>R</sub>) et le temps d'ouverture (t<sub>O</sub>)

$$ T_C = \frac{t_R}{t_O} $$

### 2.4.3 taux de réquisition
**T<sub>R</sub>**
rapport entre le temps requis (t<sub>R</sub>) et le temps total (t<sub>T</sub>)

$$ T_R = \frac{t_R}{t_T} $$

Boutique AFNOR — 7 — NF E 60-182

###  2.4.4 disponibilité opérationnelle
**$D_O$**

rapport entre le temps de fonctionnement ($t_F$) et le temps requis ($t_R$)

$$D_O = \frac{t_F}{t_R}$$

###  2.4.5 taux de performance
**$T_P$**

rapport entre le temps net ($t_N$) et le temps de fonctionnement ($t_F$)

$$T_P = \frac{t_N}{t_F}$$

NOTE Il mesure les écarts de performance du moyen de production et intègre les variations de cadence (liées au process ou aux réglages du moyen de production).

###  2.4.6 taux de qualité
**$T_Q$**

rapport entre le nombre de pièces bonnes (NPB) et le nombre de pièces réalisées (NPR)

$$T_Q = \frac{NPB}{NPR} = \frac{t_u}{t_N}$$

###  2.4.7 taux de rendement synthétique (TRS)
indicateur de performance de productivité des moyens correspondant au rapport entre le temps utile ($t_u$) et le temps requis ($t_R$)

$$TRS = \frac{t_u}{t_R}$$

NOTE 1 Il peut être calculé en faisant le rapport entre le nombre de pièces bonnes réalisées (NPB) et le nombre de pièces théoriquement réalisables (NPTR) :

$$TRS = \frac{NPB}{NPTR}$$

NOTE 2 Il peut également être obtenu à partir des trois indicateurs de performances qui le composent :

$$TRS = NPB \frac{t_{CR}}{t_R} = \frac{t_u}{t_N} \times \frac{t_N}{t_F} \times \frac{t_F}{t_R} = T_Q \times T_P \times D_O$$

###  2.4.8 taux de rendement global (TRG)
indicateur de productivité de l'organisation industrielle correspondant au rapport entre le temps utile ($t_u$) et le temps d'ouverture ($t_O$)

$$TRG = \frac{t_u}{t_O}$$

NOTE 1 Il compare le nombre de pièces bonnes réalisées au nombre de pièces théoriquement réalisables pendant le temps d'ouverture.

NOTE 2 Il peut également être obtenu à partir des quatre indicateurs de performances qui le composent :

$$TRG = \frac{t_u}{t_R} \times \frac{t_R}{t_O} = TRS \times T_C = T_Q \times T_P \times D_O \times T_C$$

Boutique AFNOR
NF E 60-182 — 8 —

## 2.4.9 taux de rendement économique
**TRE**

indicateur stratégique d'engagement des moyens correspondant au rapport entre le temps utile ($t_U$) et le temps total ($t_T$)

$$TRE = \frac{t_U}{t_T}$$

NOTE 1 Il compare le nombre de pièces bonnes réalisées au nombre de pièces théoriquement réalisables pendant le temps total.

NOTE 2 Il peut également être obtenu à partir des cinq indicateurs de performances qui le composent :

$$TRE = \frac{t_U}{t_R} \times \frac{t_R}{t_O} \times \frac{t_O}{t_T} = TRS \times T_C \times T_S = T_Q \times T_P \times D_O \times T_C \times T_S$$


<table>
  <thead>
    <tr>
        <th> </th>
        <th colspan="8">$t_T$ = Temps Total (24 heures, 168 heures, ...)</th>
    </tr>
    <tr>
        <th> </th>
        <th colspan="5">$t_O$ = Temps d'Ouverture</th>
        <th colspan="3" rowspan="5">Fermeture</th>
    </tr>
    <tr>
        <th> </th>
        <th colspan="4">$t_R$ = Temps Requis</th>
        <th colspan="3" rowspan="4">Sous charge, entretien préventif, essais, pauses</th>
    </tr>
    <tr>
        <th> </th>
        <th colspan="3">$t_F$ = Temps de Fonctionnement</th>
        <th colspan="3" rowspan="3">Arrêts propres<br/>(fonctionnels - exploitation - pannes - micro arrêts),<br/>arrêts induits</th>
    </tr>
    <tr>
        <th> </th>
        <th colspan="2">$t_N$ = Temps Net</th>
        <th colspan="3" rowspan="2">Ecarts de cadences</th>
    </tr>
    <tr>
        <th> </th>
        <th>$t_U$ = Temps Utile</th>
        <th colspan="3">Non-qualité</th>
    </tr>
    <tr>
        <th colspan="9">**TRS = $t_U / t_R$**</th>
    </tr>
  </thead>
  <tbody>
    <tr>
        <td>soit TRS</td>
        <td>=</td>
        <td colspan="2">$t_U / t_N$</td>
        <td>x</td>
        <td>$t_N / t_F$</td>
        <td>x</td>
        <td>$t_F / t_R$</td>
        <td> </td>
    </tr>
    <tr>
        <td> </td>
        <td>=</td>
        <td colspan="2">$\Downarrow$</td>
        <td>x</td>
        <td>$\Downarrow$</td>
        <td>x</td>
        <td>$\Downarrow$</td>
        <td> </td>
    </tr>
    <tr>
        <td>soit TRS</td>
        <td>=</td>
        <td colspan="2">$T_Q$<br/>Taux de qualité</td>
        <td>x</td>
        <td>$T_P$<br/>Taux de performance</td>
        <td>x</td>
        <td>$D_O$<br/>Disponibilité opérationnelle</td>
        <td> </td>
    </tr>
    <tr>
        <th colspan="9">**TRG = $t_U / t_O$**</th>
    </tr>
    <tr>
        <td>soit TRG</td>
        <td>=</td>
        <td colspan="4">$t_U / t_R$</td>
        <td>x</td>
        <td>$t_R / t_O$</td>
        <td> </td>
    </tr>
    <tr>
        <td> </td>
        <td>=</td>
        <td colspan="4">$\Downarrow$</td>
        <td>x</td>
        <td>$\Downarrow$</td>
        <td> </td>
    </tr>
    <tr>
        <td>soit TRG</td>
        <td>=</td>
        <td colspan="4">TRS</td>
        <td>x</td>
        <td>$T_C$<br/>Taux de charge</td>
        <td> </td>
    </tr>
    <tr>
        <th colspan="9">**TRE = $t_U / t_T$**</th>
    </tr>
    <tr>
        <td>soit TRE</td>
        <td>=</td>
        <td colspan="5">$t_U / t_O$</td>
        <td>x</td>
        <td>$t_O / t_T$</td>
    </tr>
    <tr>
        <td> </td>
        <td>=</td>
        <td colspan="5">$\Downarrow$</td>
        <td>x</td>
        <td>$\Downarrow$</td>
    </tr>
    <tr>
        <td>soit TRE</td>
        <td>=</td>
        <td colspan="5">TRG</td>
        <td>x</td>
        <td>$T_S$<br/>Taux stratégique d'engagement</td>
    </tr>
    <tr>
        <th> </th>
        <th colspan="8">$t_U / t_T$<br/>$\Downarrow$<br/>**TRE**</th>
    </tr>
  </tbody>
</table>

Figure 1 — Présentation graphique des définitions