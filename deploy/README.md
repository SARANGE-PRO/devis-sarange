# Déploiement de l'index DGFiP des numéros de TVA

L'index local permet de vérifier un numéro de TVA intracommunautaire auprès de
la source officielle (jeu de données DGFiP publié sur data.gouv.fr), sans
appeler une API à chaque devis. Il alimente le statut `VERIFIED_DGFIP`.

**Sans cet index**, l'application reste fonctionnelle : la vérification se
replie sur API Entreprise (si habilitée), puis sur VIES, puis sur la
confirmation manuelle documentée. Un numéro non vérifié bloque uniquement la
facturation en autoliquidation, jamais le devis.

---

## 1. Prérequis : un système de fichiers persistant

L'index pèse environ **130 Mo** pour **~4,8 millions d'entrées**. Il lui faut
un répertoire :

- **persistant** — il survit aux redéploiements ;
- **accessible en lecture** par le processus applicatif ;
- **accessible en écriture** par le compte qui exécute la tâche planifiée.

> ⚠️ **Hébergement sans disque persistant (Vercel, Netlify, Cloud Run par
> défaut…)** : ces plateformes ont un système de fichiers en lecture seule, et
> leur répertoire `/tmp` est éphémère et non partagé entre les invocations.
> L'index ne peut pas y être déployé. Deux options :
> 1. habiliter **API Entreprise** (`API_ENTREPRISE_TOKEN`, `_CONTEXT`,
>    `_OBJECT`, `_RECIPIENT`) : la vérification DGFiP se fait alors par SIREN,
>    sans index, et aucune des étapes ci-dessous n'est nécessaire ;
> 2. héberger l'application sur une machine ou un conteneur disposant d'un
>    volume persistant, et appliquer la procédure ci-dessous.

Emplacement recommandé sur une machine dédiée :

```bash
sudo mkdir -p /var/lib/sarange/dgfip
sudo chown sarange:sarange /var/lib/sarange/dgfip
sudo chmod 750 /var/lib/sarange/dgfip
```

Le répertoire est volontairement **hors du répertoire de déploiement** : une
mise en production ne doit pas effacer l'index.

---

## 2. Configuration

| Variable | Rôle | Valeur |
|---|---|---|
| `TVA_DGFIP_INDEX_PATH` | chemin de l'index | `/var/lib/sarange/dgfip/dgfip-vat-index.json` |
| `TVA_DGFIP_DATASET_ID` | jeu de données data.gouv.fr | `6a2b4e2393218f1e63d7389b` *(défaut)* |
| `TVA_DGFIP_MIN_ENTRIES` | seuil minimal d'acceptation d'un index | `1` *(défaut)* |
| `NODE_OPTIONS` | mémoire pour la construction | `--max-old-space-size=4096` |

Un chemin relatif est résolu depuis la racine du projet — jamais depuis le
répertoire courant. La même variable doit être visible **par l'application** et
**par la tâche planifiée**.

L'identifiant du jeu de données est l'identifiant **technique permanent**
(le slug, lui, peut changer). Le script refuse toute mise à jour si le
producteur ou l'éditeur déclaré n'est pas la DGFiP.

---

## 3. Premier lancement, au déploiement

```bash
cd /srv/devis-sarange
npm run update-dgfip-vat-index
```

Durée constatée : **~40 s** (téléchargement + construction). Compte rendu
attendu :

```
Index DGFiP actualisé : 4826845 entrées (extraction publiée le 2026-07-29…).
Lignes lues : 4826846 | acceptées : 4826845 | rejetées : 1 | motif principal : … | code de sortie : 0
```

Puis la vérification post-déploiement (§5).

---

## 4. Mise à jour quotidienne

Le jeu de données est actualisé quotidiennement par la DGFiP.

### systemd (recommandé)

```bash
sudo cp deploy/systemd/dgfip-vat-index-*.service /etc/systemd/system/
sudo cp deploy/systemd/dgfip-vat-index-*.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dgfip-vat-index-update.timer
sudo systemctl enable --now dgfip-vat-index-check.timer
sudo systemctl list-timers 'dgfip-vat-index-*'
```

`Persistent=true` rattrape une exécution manquée (machine éteinte). Adaptez
`User`, `WorkingDirectory` et `TVA_DGFIP_INDEX_PATH` dans les unités.

### cron (alternative)

```cron
30 4 * * * cd /srv/devis-sarange && TVA_DGFIP_INDEX_PATH=/var/lib/sarange/dgfip/dgfip-vat-index.json npm run update-dgfip-vat-index >> /var/log/sarange/dgfip-update.log 2>&1
0  6 * * * cd /srv/devis-sarange && TVA_DGFIP_INDEX_PATH=/var/lib/sarange/dgfip/dgfip-vat-index.json npm run check-dgfip-vat-index  >> /var/log/sarange/dgfip-check.log  2>&1
```

### Verrou d'exécution

Le script pose un verrou `<index>.lock` : une seconde exécution simultanée
(tâche planifiée + lancement manuel) s'interrompt immédiatement avec le
message « Mise à jour déjà en cours ». Un verrou abandonné par un processus
interrompu est repris automatiquement au bout d'une heure. Aucune
configuration n'est nécessaire.

---

## 5. Supervision

### Codes de sortie de `update-dgfip-vat-index`

| Code | Situation |
|---|---|
| `0` | index actualisé, **ou** extraction inchangée (aucun téléchargement), **ou** exécution ignorée car déjà en cours |
| `1` | métadonnées injoignables, producteur non DGFiP, téléchargement interrompu, index refusé (vide, trop de lignes illisibles, effondrement du volume, formats invalides), écriture impossible |

Dans tous les cas d'échec, **le dernier index valide est conservé** : la
vérification continue de fonctionner avec les données précédentes.

### Alertes

`npm run check-dgfip-vat-index` sort en code `1` et écrit l'alerte sur la
sortie d'erreur dans les cas suivants :

- **la mise à jour a échoué** → unité systemd en `failed`
  (`systemctl is-failed dgfip-vat-index-update.service`) ou code `1` en cron ;
- **l'index a plus de sept jours** ;
- **l'index est absent** ou illisible (producteur non conforme compris) ;
- **le nombre d'entrées est anormalement faible** (seuil : 1 000 000).

Branchez la supervision sur ces deux codes de sortie, ou sur les journaux
(`journalctl -u dgfip-vat-index-update.service`).

---

## 6. Vérification après déploiement

```bash
npm run check-dgfip-vat-index
```

Résultat attendu :

```
OK   Index présent et lisible
  producteur : DGFIP | publication : … | actualisé : … | entrées : 4826845
OK   Index actualisé depuis moins de sept jours — 0 jour(s)
OK   Volume d’entrées cohérent — 4826845 entrées
OK   Sonde 820001014 -> FR22820001014 — FR22820001014
OK   Sonde négative 999999999 -> NOT_FOUND_DGFIP — not-found-dgfip

0 contrôle(s) en échec | code de sortie : 0
```

Les deux sondes vérifient qu'une correspondance connue est bien trouvée, et
qu'un SIREN inconnu ne produit **jamais** un faux `VERIFIED_DGFIP`.

---

## 7. Rotation et sauvegarde

L'index est **régénérable à tout moment** depuis la source officielle : il n'a
pas besoin d'être sauvegardé. Il n'est pas versionné (voir `.gitignore`).
Prévoir ~300 Mo d'espace libre (index + fichier temporaire d'écriture).
