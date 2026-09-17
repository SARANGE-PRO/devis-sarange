# Index DGFiP des numéros de TVA — production

L'index permet de vérifier un numéro de TVA intracommunautaire auprès de la
source officielle (jeu de données DGFiP publié sur data.gouv.fr) et produit le
statut `VERIFIED_DGFIP`.

**Architecture** : l'extraction complète (~4,8 millions d'entrées, 130 Mo) est
découpée en **100 fichiers d'effectif équilibré** (~48 000 entrées, ~300 Ko
compressés chacun), publiés sur les **GitHub Releases de ce dépôt**. Une
vérification télécharge le manifeste puis **un seul fichier** : l'index complet
n'est jamais chargé dans une fonction Vercel.

```
release « dgfip-vat »             current.json              manifeste (pointeur)
release « dgfip-vat-{version} »   000.json.gz … 099.json.gz correspondances SIREN → TVA
```

Le découpage se fait par **plages de SIREN**, pas par préfixe : les SIREN étant
attribués séquentiellement, un préfixe peut porter 200 000 entreprises et un
autre aucune. Le manifeste porte la borne haute de chaque fichier ; le lecteur
trouve le bon fichier par dichotomie.

Le manifeste est remplacé **en dernier**, une fois la release versionnée
entièrement publiée et sondée : tant qu'il pointe l'ancienne version,
l'application lit des données cohérentes. La bascule est donc atomique.

**Sans index**, l'application reste fonctionnelle : la vérification se replie
sur VIES puis sur la confirmation manuelle documentée. Un numéro non vérifié
bloque uniquement la facturation en autoliquidation, jamais le devis.

---

## 1. Pourquoi les GitHub Releases (et plus Vercel Blob)

L'index était publié sur Vercel Blob. Chaque `put()`, `del()` ou `list()`
compte comme une **Advanced Operation**, et le plan **Hobby n'en inclut que
2 000 par mois**. Une publication en écrivait 892 et en supprimait 892 : le
quota était épuisé en deux jours, après quoi Vercel **bloque le magasin
pendant trente jours, en lecture comme en écriture** (`403 Your store is
blocked`). Constaté du 05/08 au 02/09/2026, puis à partir du 06/09/2026 : la
vérification des numéros de TVA affichait « Sources officielles injoignables ».

Les releases GitHub n'ont **aucun quota d'opérations**, sont gratuites pour un
dépôt public, et le workflow y écrit avec le jeton `GITHUB_TOKEN` que GitHub
Actions fournit de lui-même. **Aucun secret, aucune variable à configurer**,
ni dans GitHub ni dans Vercel.

Contrainte : le dépôt doit rester **public** pour que l'application lise les
fichiers sans jeton (l'index ne contient que des données publiques DGFiP). Si
le dépôt devenait privé, il faudrait héberger l'index ailleurs et renseigner
`DGFIP_INDEX_BASE_URL`.

---

## 2. Première publication

Depuis GitHub : onglet **Actions** → **Index DGFiP des numéros de TVA** →
**Run workflow**. Durée constatée : environ **cinq minutes** pour le
téléchargement et le découpage, puis **deux minutes** d'envoi (cadence limitée
par l'API GitHub).

En ligne de commande :

```bash
gh workflow run dgfip-vat-index.yml
gh run watch
```

Journal attendu :

```
Dépôt : SARANGE-PRO/devis-sarange (https://github.com/SARANGE-PRO/devis-sarange/releases/download)
Découpage de 4834738 entrées en fichiers équilibrés…
  100 fichiers à publier (version 20260917T081500Z)
Création de la release dgfip-vat-20260917T081500Z (brouillon)…
Envoi des fichiers…
  100/100 fichiers envoyés
Publication de la release versionnée…
Sondes de validation sur les fichiers publiés…
  sonde 820001014 -> FR22820001014 : OK
  sonde négative 999999999 -> NOT_FOUND_DGFIP : OK
Remplacement du manifeste (bascule)…
  manifeste public : version 20260917T081500Z active
Index publié : 4834738 entrées (extraction du 2026-09-16…).
```

Le script peut aussi tourner en local, avec le jeton de `gh` :

```bash
GITHUB_TOKEN="$(gh auth token)" npm run publish-dgfip-vat-index
npm run publish-dgfip-vat-index -- --dry-run   # aucun envoi, aucun jeton
npm run publish-dgfip-vat-index -- --force     # republie même si l'extraction est inchangée
```

> Ne jamais lancer une publication locale pendant qu'une exécution GitHub
> Actions est en cours : les publications doivent rester sérialisées.

---

## 3. Mise à jour hebdomadaire

Le workflow [`.github/workflows/dgfip-vat-index.yml`](../.github/workflows/dgfip-vat-index.yml)
s'exécute :

- **automatiquement le lundi** à 03h30 UTC (05h30 à Paris en été, 04h30 en hiver) ;
- **manuellement** via **Run workflow**, sans limite de fréquence.

L'extraction DGFiP est publiée chaque jour ; un rythme hebdomadaire suffit,
VIES et la confirmation manuelle couvrant les immatriculations de la semaine.

`concurrency: dgfip-vat-index` empêche deux publications simultanées.
L'exécution est idempotente : si l'empreinte de la ressource n'a pas changé,
rien n'est téléchargé ni publié, et le workflow réussit.

### Élagage

Après chaque bascule réussie, les versions au-delà des **deux plus récentes**
sont supprimées (release et tag). La version active est toujours conservée.
Une version plus récente que l'active ne peut être qu'une publication
interrompue avant la bascule : elle est supprimée aussi.

---

## 4. Supervision et alertes

### Échec de publication

Le script sort en **code non nul** et le workflow est marqué **en échec** si :
métadonnées injoignables, producteur non DGFiP, téléchargement interrompu,
index refusé (vide, trop de lignes illisibles, effondrement du volume, formats
invalides), envoi impossible, ou sonde en échec.

Dans tous ces cas, la release incomplète est **supprimée** et `current.json`
n'est pas remplacé : la version précédente reste active et l'application
continue de fonctionner.

### Contrôle après chaque exécution

Le job **Contrôler l'index publié** tourne après chaque publication, **même si
elle a échoué**, et lit l'index exactement comme l'application. Il échoue si :

- **l'index est absent** ou le manifeste illisible ;
- **l'index a plus de vingt et un jours** (deux publications manquées) ;
- **le nombre d'entrées est anormalement faible** (seuil : 1 000 000) ;
- **une sonde échoue**.

Activez les notifications GitHub sur les échecs de workflow
(**Settings** → **Notifications** → *Actions*) : c'est l'alerte.

En local :

```bash
npm run check-dgfip-vat-index             # index publié
npm run check-dgfip-vat-index -- --local  # index local de développement
```

Résultat attendu :

```
Mode PUBLIÉ — GitHub Releases : https://github.com/SARANGE-PRO/devis-sarange/releases/download
OK   Index présent et lisible
  producteur : DGFIP | version : 20260917T081500Z | publication : … | actualisé : … | entrées : 4834738
OK   Index actualisé depuis moins de vingt et un jours — 0 jour(s)
OK   Volume d’entrées cohérent — 4834738 entrées
OK   Sonde 820001014 -> FR22820001014 — FR22820001014
OK   Sonde négative 999999999 -> NOT_FOUND_DGFIP — not-found-dgfip

0 contrôle(s) en échec | code de sortie : 0
```

### Dans l'application

L'API `/api/tva/verify` renvoie l'état de chaque source (`sources`, `detail`)
et journalise un avertissement `[tva/verify]` dans les journaux Vercel quand
aucune source ne répond. Le formulaire client affiche ce détail dans le
message « Sources officielles injoignables », par exemple
`Index DGFiP : injoignable ou saturé · VIES : injoignable ou saturé`.

---

## 5. VIES (repli)

VIES répond presque toujours HTTP 200, y compris quand il n'a pas pu
interroger l'État membre : `userError` vaut alors `MS_MAX_CONCURRENT_REQ`
(serveur français saturé, fréquent en journée) ou `MS_UNAVAILABLE`. Le
lecteur distingue ces cas d'un numéro réellement invalide (`INVALID`), retente
jusqu'à trois fois, et ne conclut jamais « invalide » sur une saturation.

Un numéro communiqué par le client que VIES ne reconnaît pas est **conservé**
en « non vérifié » (message dédié dans le formulaire) : seul le client, ou une
confirmation manuelle documentée, peut trancher.

---

## 6. Vérification après déploiement

```bash
npm run check-dgfip-vat-index
```

Puis dans l'application : ouvrez une fiche client professionnelle, lancez
**Vérifier** — le statut doit passer à **Vérifié (DGFiP)** avec la date de
publication de l'extraction.

---

## 7. Variables d'environnement (toutes optionnelles)

| Nom | Rôle | Défaut |
|---|---|---|
| `DGFIP_INDEX_REPOSITORY` | dépôt GitHub hébergeant les releases | `SARANGE-PRO/devis-sarange` |
| `DGFIP_INDEX_BASE_URL` | URL de base des fichiers (`off` pour désactiver l'index publié) | `https://github.com/<dépôt>/releases/download` |
| `DGFIP_KEEP_VERSIONS` | versions conservées à l'élagage (minimum 2) | `2` |
| `TVA_DGFIP_INDEX_PATH` | index local de développement | `data/dgfip-vat-index.json` |
| `TVA_VIES_API_URL` | racine de l'API REST VIES | `https://ec.europa.eu/taxation_customs/vies/rest-api` |

**Nettoyage de l'ancienne configuration** : la variable Vercel
`DGFIP_BLOB_BASE_URL`, la variable et le secret GitHub Actions
(`DGFIP_BLOB_BASE_URL`, `BLOB_READ_WRITE_TOKEN`) et le magasin Vercel Blob
`dgfip-vat-index` ne servent plus et peuvent être supprimés.

---

## 8. Développement local

Le constructeur d'index local reste disponible pour les tests, sans réseau
vers GitHub :

```bash
npm run update-dgfip-vat-index             # construit data/dgfip-vat-index.json (130 Mo)
npm run check-dgfip-vat-index -- --local   # contrôle de cet index
```

Le fichier n'est pas versionné (`.gitignore`). En développement, l'application
lit d'abord l'index publié ; s'il est injoignable, elle se replie sur cet index
local, puis sur VIES.
