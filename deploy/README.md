# Index DGFiP des numéros de TVA — production Vercel

L'index permet de vérifier un numéro de TVA intracommunautaire auprès de la
source officielle (jeu de données DGFiP publié sur data.gouv.fr) et produit le
statut `VERIFIED_DGFIP`.

**Architecture** : l'extraction complète (~4,8 millions d'entrées, 128 Mo) est
découpée en fichiers par préfixe des **trois premiers chiffres du SIREN**,
compressés et publiés sur **Vercel Blob**. Une vérification ne télécharge
qu'**un seul fichier** (~40 Ko) : l'index complet n'est jamais chargé dans une
fonction Vercel, dont le système de fichiers est en lecture seule et `/tmp`
éphémère.

```
dgfip-vat/{version}/000.json.gz … 999.json.gz   correspondances SIREN → TVA
dgfip-vat/current.json                          manifeste de la version active
```

Le manifeste est publié **en dernier** : tant qu'il pointe l'ancienne version,
l'application lit des données cohérentes. La bascule est donc atomique.

**Sans index**, l'application reste fonctionnelle : la vérification se replie
sur VIES puis sur la confirmation manuelle documentée. Un numéro non vérifié
bloque uniquement la facturation en autoliquidation, jamais le devis.

---

## 1. Actions manuelles dans les tableaux de bord

Trois actions, à faire une seule fois. **Aucun jeton ne doit être écrit dans le
dépôt.**

### a. Créer le Blob Store (tableau de bord Vercel)

1. Projet **devis-sarange** → onglet **Storage** → **Create Database** →
   **Blob** ;
2. nommer par exemple `dgfip-vat-index`, puis **Connect** au projet ;
3. accès **public** : acceptable ici, le magasin ne contient que des données
   publiques DGFiP — **n'y déposer aucune donnée interne ou client** ;
4. relever l'URL publique de base, de la forme
   `https://<identifiant>.public.blob.vercel-storage.com` ;
5. relever le jeton `BLOB_READ_WRITE_TOKEN` (onglet **.env.local** du magasin).

### b. Ajouter le secret dans GitHub

Dépôt **SARANGE-PRO/devis-sarange** → **Settings** → **Secrets and variables**
→ **Actions** :

| Type | Nom | Valeur |
|---|---|---|
| **Secret** | `BLOB_READ_WRITE_TOKEN` | le jeton relevé en (a) |
| **Variable** | `DGFIP_BLOB_BASE_URL` | l'URL publique de base relevée en (a) |

En ligne de commande, sans afficher la valeur :

```bash
gh secret set BLOB_READ_WRITE_TOKEN          # saisie masquée
gh variable set DGFIP_BLOB_BASE_URL --body "https://<identifiant>.public.blob.vercel-storage.com"
```

### c. Ajouter la variable d'environnement Vercel

Projet **devis-sarange** → **Settings** → **Environment Variables** :

| Nom | Valeur | Environnements |
|---|---|---|
| `DGFIP_BLOB_BASE_URL` | l'URL publique de base | Production, Preview |

La connexion du magasin au projet ajoute automatiquement `BLOB_READ_WRITE_TOKEN`
côté Vercel : **l'application n'en a pas besoin**, elle lit par URL publique.

Redéployer ensuite pour que la variable soit prise en compte.

---

## 2. Première publication

Depuis GitHub : onglet **Actions** → **Index DGFiP des numéros de TVA** →
**Run workflow**. Durée constatée : environ **une minute** pour le
téléchargement et le découpage, plus le temps d'envoi des fichiers.

Journal attendu :

```
Découpage de 4826845 entrées par préfixe de SIREN…
  891 fichiers de préfixe à publier (version 20260730T143946Z)
Envoi des fichiers de préfixe…
Sondes de validation sur les fichiers publiés…
  sonde 820001014 -> FR22820001014 : OK
  sonde négative 999999999 -> NOT_FOUND_DGFIP : OK
Publication du manifeste (bascule atomique)…
Index publié : 4826845 entrées (extraction du 2026-07-29…).
```

> Tous les préfixes n'existent pas : environ 891 fichiers sur 1000, les autres
> ne correspondant à aucune entreprise. Le lecteur traite une absence de
> fichier comme un SIREN inconnu (`NOT_FOUND_DGFIP`).

---

## 3. Mise à jour quotidienne

Le workflow [`.github/workflows/dgfip-vat-index.yml`](../.github/workflows/dgfip-vat-index.yml)
s'exécute :

- **automatiquement** à 02h30 UTC (04h30 à Paris en heure d'été, 03h30 en heure
  d'hiver) — le jeu DGFiP est publié quotidiennement ;
- **manuellement** via **Run workflow**.

`concurrency: dgfip-vat-index` empêche deux publications simultanées.
L'exécution est idempotente : si l'empreinte de la ressource n'a pas changé,
rien n'est téléchargé ni publié, et le workflow réussit.

### Élagage

Après chaque bascule réussie, les versions au-delà des **deux plus récentes**
sont supprimées. La version active est toujours conservée.

---

## 4. Supervision et alertes

### Échec de publication

Le script sort en **code non nul** et le workflow est marqué **en échec** si :
métadonnées injoignables, producteur non DGFiP, téléchargement interrompu,
index refusé (vide, trop de lignes illisibles, effondrement du volume, formats
invalides), sonde en échec, ou envoi impossible.

Dans tous ces cas, **`current.json` n'est pas republié** : la version
précédente reste active et l'application continue de fonctionner.

Activez les notifications GitHub sur les échecs de workflow
(**Settings** → **Notifications** → *Actions*), ou branchez votre supervision
sur l'API des exécutions.

### Contrôle de l'index publié

```bash
DGFIP_BLOB_BASE_URL="https://<identifiant>.public.blob.vercel-storage.com" \
  npm run check-dgfip-vat-index
```

Sortie en code 1 — et alerte sur la sortie d'erreur — si :

- **l'index est absent** ou le manifeste illisible ;
- **l'index a plus de sept jours** ;
- **le nombre d'entrées est anormalement faible** (seuil : 1 000 000) ;
- **une sonde échoue**.

---

## 5. Vérification après déploiement

```bash
DGFIP_BLOB_BASE_URL="https://<identifiant>.public.blob.vercel-storage.com" \
  npm run check-dgfip-vat-index
```

Résultat attendu :

```
Mode PRODUCTION — Vercel Blob : https://…
OK   Index présent et lisible
  producteur : DGFIP | publication : … | actualisé : … | entrées : 4826845
OK   Index actualisé depuis moins de sept jours — 0 jour(s)
OK   Volume d’entrées cohérent — 4826845 entrées
OK   Sonde 820001014 -> FR22820001014 — FR22820001014
OK   Sonde négative 999999999 -> NOT_FOUND_DGFIP — not-found-dgfip

0 contrôle(s) en échec | code de sortie : 0
```

Contrôlez enfin dans l'application : ouvrez une fiche client professionnelle,
lancez **Vérifier** — le statut doit passer à **Vérifié (DGFiP)** avec la date
de publication de l'extraction.

---

## 6. Développement local

Le constructeur d'index local reste disponible pour les tests, **sans Vercel
Blob** :

```bash
npm run update-dgfip-vat-index   # construit data/dgfip-vat-index.json (128 Mo)
npm run check-dgfip-vat-index    # mode LOCAL si DGFIP_BLOB_BASE_URL est absent
```

Le fichier n'est pas versionné (`.gitignore`). Sans `DGFIP_BLOB_BASE_URL`,
l'application utilise cet index local ; c'est le mode de développement.

Pour tester la publication sans rien envoyer :

```bash
npm run publish-dgfip-vat-index -- --dry-run
```
