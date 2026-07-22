# Onglet COMPTA — Export des devis vers Sage 50

## Rôle

L'onglet **Compta** (`/compta`) prépare, contrôle, trace et exporte les devis de
l'application vers **Sage 50 (v6.5)** sous forme de fichiers **CSV** destinés à
l'import paramétrable de Sage. Ce n'est pas un logiciel de comptabilité : aucune
écriture directe dans la base Sage, aucune API Sage.

**Accès volontairement discret** : la Compta n'apparaît pas dans le menu
principal ni dans la navigation mobile (fonctionnalité réservée au poste où
Sage 50 est installé). On y accède par le petit lien « Compta » en bas de la
barre latérale desktop (à côté du numéro de version), ou directement par
l'URL `/compta`.

Flux prévu :

1. Le devis est créé normalement dans l'application.
2. Dans l'onglet Compta, on sélectionne le devis : les lignes Sage sont
   prévisualisées et contrôlées automatiquement.
3. Le CSV est généré et téléchargé (client provisoire `ZZZIMPORT`).
4. La pièce est importée dans Sage, puis **le client provisoire est remplacé
   manuellement par le vrai client** avant toute validation/facturation.
5. L'export est marqué « Importé dans Sage » dans l'application.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `lib/sage-export.mjs` | Moteur **pur** : paramètres Compta, mapping TVA→article, construction du modèle d'export, validations, rendu CSV, nommage, empreinte anti-doublon, encodage (Windows-1252/UTF-8). Aucune dépendance `@/` : tout est injecté (testable par le runner Node). |
| `lib/sage-export-service.js` | Liaison avec le vrai moteur de calcul (`products.js`, `quote-totals.mjs`, désignations, variantes). Les montants exportés sortent du **même moteur** que le devis affiché et le PDF (remises nettes, commission redistribuée, pose par unité, TVA par ligne). |
| `lib/compta-local.mjs` | **Persistance LOCALE (source de vérité)** : paramètres Sage et historique des exports dans le localStorage du poste (clés versionnées liées à l'utilisateur), construction des enregistrements, export/import JSON de la configuration. Stockage injectable → testable Node. |
| `lib/firebase/compta.js` | **Miroir Firestore FACULTATIF** (désactivé par défaut) : recopie best-effort des paramètres, des exports (même id que local) et du résumé `comptaExport` sur le devis. Toute erreur est interceptée par la page — jamais bloquant. |
| `app/compta/page.js` | Interface : liste/recherche/filtres, statuts, prévisualisation des lignes, récapitulatif, génération/retéléchargement, historique, panneau de paramètres (avec export/import JSON et toggle de synchronisation). |
| `tests/sage-export.test.mjs` | Tests du moteur (TVA 5,5/10/20, autoliquidation, remise→prix net, gratuit, quantités, multi-taux, doublons, totaux incohérents, article manquant, CSV, échappement, encodage…). |
| `tests/compta-local.test.mjs` | Tests de la persistance locale (clés par uid, défauts, aller-retour, corruption, remplacement versionné, statuts, borne d'historique, config JSON). |

Points d'intégration existants réutilisés :

- **Variantes** : la variante **retenue à la signature** est exportée si elle
  existe, sinon la variante active (un avertissement le précise).
- **Numéro de devis** `DV-…` = identifiant externe de la pièce Sage. Comme il est
  régénéré à chaque modification du devis, un écart entre le numéro du devis et
  celui de l'export actif déclenche l'alerte « Modifié depuis l'export ».
- **Anti-doublon** : chaque CSV a une empreinte de contenu. Un second clic ne
  crée jamais un export identique : le fichier existant est retéléchargé. Une
  régénération volontaire crée une version `v2, v3…` et passe l'ancienne en
  « Remplacé » (historique conservé, avec le CSV archivé pour retéléchargement fidèle).

## Statuts

| Statut | Origine |
| --- | --- |
| Non préparé | Aucun export enregistré (dérivé). |
| Prêt / Erreur de validation | Résultat des contrôles à la sélection du devis (dérivé, non stocké). |
| À importer dans Sage | Export généré (`generated`). |
| Importé dans Sage | Marqué manuellement (`imported`). |
| Annulé | Export annulé (`cancelled`). |
| Remplacé | Ancienne version après régénération (`replaced`). |

## Contrôles avant export (bloquants)

Devis vide, désignation absente, quantité invalide, prix invalide, taux de TVA
non reconnu, code article Sage manquant pour un régime utilisé, identifiant
externe absent, **totaux des lignes ≠ totaux du devis** (recalcul croisé avec
`computeQuoteTotals`). Les avertissements (variantes, client provisoire) ne
bloquent pas.

## Correspondance TVA → articles Sage (par défaut, modifiable)

| Régime | Article |
| --- | --- |
| TVA 5,5 % | `IMP055` |
| TVA 10 % | `IMP100` |
| TVA 20 % | `IMP200` |
| Autoliquidation (art. 283-2 CGI) | `IMPAUTO` |
| Exonération / vrai 0 % | *(à configurer si utilisé)* |

Le taux 0 de l'application est interprété par défaut comme **autoliquidation**
(réglage `Taux 0 % interprété comme`). Des surcharges par nature de ligne sont
prévues (ex. `POSE100` pour la pose à 10 %) afin de distinguer plus tard
fournitures et pose (`FOUR…`/`POSE…`).

## Articles / données à créer manuellement dans Sage 50

1. Client provisoire **`ZZZIMPORT`** — désignation « CLIENT À COMPLÉTER ».
2. Articles génériques **`IMP055`**, **`IMP100`**, **`IMP200`**, **`IMPAUTO`**
   avec le bon taux/régime de TVA associé côté Sage.
3. (Optionnel) Articles `POSE055/POSE100/POSE200` si vous activez les surcharges pose.
4. Un **profil d'import paramétrable** pointant sur les colonnes du CSV (voir ci-dessous).

## Format CSV (v1, layout « E/L »)

Réglages par défaut : séparateur `;`, décimales à virgule, dates `JJ/MM/AAAA`,
encodage **Windows-1252** (ANSI), ligne d'en-tête incluse, fins de ligne CRLF,
délai de livraison **14 jours calendaires**. Tout est modifiable dans les
paramètres de l'onglet.

Colonnes (13) : `Type;TypePiece;Date;Client;Reference;RefChantier;Article;Designation;Quantite;PrixUnitaireHT;MontantHT;TauxTVA;DateLivraisonLigne`

Date de livraison (exigée par l'import Sage) : `dateLivraison = date de la
pièce + délai configuré` (14 jours calendaires par défaut). La colonne
`DateLivraisonLigne` (correspondance Sage : **Lg Date Liv. article**) est
**vide sur la ligne E** et **renseignée sur chaque ligne L** — pose, métrage
offert, recyclage, lignes à zéro, remises comprises — toujours en chaîne
stricte `JJ/MM/AAAA` (jamais ISO, ni heure, ni Date sérialisée, ni valeur
vide/invalide), même si le « Format de date » configurable de la pièce est
différent. La date calculée est affichée dans l'en-tête de la prévisualisation.

Exemple généré (pièce du 22/07/2026, délai 14 jours → livraison 05/08/2026) :

```csv
Type;TypePiece;Date;Client;Reference;RefChantier;Article;Designation;Quantite;PrixUnitaireHT;MontantHT;TauxTVA;DateLivraisonLigne
E;COMMANDE;22/07/2026;ZZZIMPORT;DV-262021715;Chantier Dupont;;;;;;;
L;;;;;;IMP200;Fenêtre PVC sur mesure 1200x1350 mm - Gris anthracite;2;728,11;1456,22;20;05/08/2026
L;;;;;;IMP200;Pose Fenêtre PVC;2;250,00;500,00;20;05/08/2026
L;;;;;;IMP100;Forfait déplacement;1;60,00;60,00;10;05/08/2026
```

Les prix exportés sont les **prix unitaires HT nets après remise** (ex.
910,14 € − 20 % → 728,11 €) ; les montants correspondent exactement au devis.
Les lignes gratuites (0 €) et les remises commerciales (montant négatif) sont
exportées telles quelles.

Garanties de robustesse du fichier :

- **Échappement CSV** : tout champ contenant le séparateur actif, un guillemet
  ou un retour à la ligne est entouré de guillemets, avec guillemets internes
  doublés. Les désignations et la référence chantier sont de toute façon
  aplaties en amont : aucun enregistrement ne s'étale sur plusieurs lignes
  physiques (fins de ligne strictement CRLF).
- **Désignation technique complète, compressée intelligemment si besoin** : la
  colonne `Designation` reçoit la désignation technique (repère, type,
  dimensions, profilé, finition, vitrage, poignée, ventilation, performances
  thermiques, options, pose…), aplatie en une seule ligne. Les mentions
  commerciales de remise sont retirées (« Remise : -20% », « gain -182,03 € »,
  « Avant remise … »), le prix exporté étant déjà net. Le champ désignation de
  Sage 50 étant limité à **250 caractères** (constaté : au-delà Sage tronque
  lui-même en plein mot et perd la fin — Uw/Sw), le réglage « Longueur max. des
  désignations » vaut **250 par défaut**. Quand une désignation dépasse, une
  **compression par étapes** retire d'abord les détails sans valeur facture —
  hauteur de poignée (« à 600 mm (mi-hauteur) »), descriptif marketing du
  profilé (« 5 chambres – renforts acier – double joint »), redondances — en
  s'arrêtant dès que ça tient : dimensions, finition, vitrage, ventilation et
  Uw/Sw sont toujours conservés. La troncature « … » n'intervient qu'en tout
  dernier recours. Chaque raccourcissement est signalé par un avertissement
  visible ; la version complète (`designationFull`) reste dans le modèle et
  l'historique, et la prévisualisation affiche exactement la valeur envoyée
  dans le CSV. (0 = illimité, déconseillé avec Sage.)
- **Encodage Windows-1252 sans perte silencieuse** : les typographiques
  français usuels (’ – — … œ € ° ×) sont couverts nativement ; quelques
  quasi-équivalents font l'objet d'une normalisation contrôlée documentée
  (traits d'union Unicode → `-`, primes → apostrophe/guillemet, ligatures
  fi/fl…). Tout caractère restant incompatible est **signalé en avertissement
  avant la génération** (il serait remplacé par `?` dans le fichier) — passez
  en UTF-8 ou corrigez la désignation.

## Stockage local (mode par défaut) et synchronisation facultative

L'onglet est conçu pour le PC où Sage 50 est installé : **la génération et le
téléchargement du CSV ne dépendent jamais de Firestore**. Le fichier est
construit en mémoire, encodé, téléchargé via un Blob — puis seulement ensuite
l'historique est enregistré.

Données stockées localement (localStorage du navigateur, clés versionnées) :

| Clé | Contenu |
| --- | --- |
| `sarange.compta.settings.v1.{uid}` | Paramètres Sage (client provisoire, articles, format CSV, …). |
| `sarange.compta.exports.v1.{uid}` | Historique des exports : statuts (À importer / Importé / Annulé / Remplacé), versions v1/v2…, empreintes anti-doublon, CSV archivés pour retéléchargement fidèle. |

(`{uid}` = identifiant Firebase de l'utilisateur, `local` à défaut. L'historique
est borné aux 150 exports les plus récents.)

- **Valeurs par défaut** : si aucun réglage local n'existe, les défauts sont
  utilisables immédiatement (ZZZIMPORT, IMP…, point-virgule, Windows-1252…).
- **Sauvegarde / restauration** : boutons « Exporter la config » / « Importer la
  config » dans les paramètres (fichier `sarange-compta-config.json`).
- **Vider les paramètres locaux** : bouton « Valeurs par défaut » + Enregistrer ;
  ou supprimer les deux clés ci-dessus dans DevTools → Application →
  Local Storage (supprimer la clé `exports` efface l'historique local).
- **Synchronisation Firestore** : case à cocher dans les paramètres,
  **désactivée par défaut**. Quand elle est active, paramètres et historique
  sont recopiés en best-effort dans `users/{uid}/compta/settings` et
  `users/{uid}/comptaExports/{id}` (mêmes ids que localement) + résumé
  `comptaExport` sur le devis. Tout échec (règles non déployées, hors ligne)
  n'affiche qu'un avertissement du type « Le CSV a été téléchargé, mais
  l'historique distant n'a pas pu être enregistré » — le fichier est toujours
  téléchargé. Les règles ajoutées dans `firestore.rules` ne doivent être
  déployées **que** si vous activez cette synchronisation.

Vérifier que le téléchargement fonctionne sans Firestore :

1. couper le réseau (ou DevTools → Network → Offline) après chargement des
   devis → « Générer et télécharger le CSV » produit bien le fichier ;
2. règles Firestore refusant tout (cas actuel, règles non déployées) → aucun
   blocage, aucun message d'erreur si la synchronisation est désactivée ;
3. recharger la page → paramètres, historique et statuts locaux sont conservés ;
4. aucun compte supplémentaire ni déploiement de règles n'est nécessaire.

## Sécurité / droits

L'application est mono-rôle (authentification Firebase, données cloisonnées par
utilisateur). Les données Compta restent sur le poste ; les collections cloud
(`users/{uid}/compta/*`, `users/{uid}/comptaExports/*`) ne servent qu'à la
synchronisation facultative et suivent les mêmes règles propriétaire
(`request.auth.uid == userId`). Il n'existe pas de système de rôles fins dans
l'app ; si un jour il est ajouté, les actions sont déjà séparées (consulter /
générer / paramétrer / marquer importé / annuler).

## Hypothèses à confirmer sur votre Sage 50 v6.5

1. **Structure E/L** : l'ordre et le nom exacts des colonnes attendues par votre
   profil d'import (le layout v1 est volontairement remappable ; ajustez au
   besoin `SAGE_CSV_COLUMNS`/`buildSageCsv` ou les réglages séparateur/en-tête).
2. **Type de pièce** : `COMMANDE` par défaut — vérifier le code exact attendu
   (devis, bon de commande…) dans votre dossier Sage.
3. **Longueur maximale** des désignations acceptée par Sage : l'export envoie
   désormais la désignation complète (illimitée par défaut) ; si Sage tronque
   ou refuse au-delà d'un seuil, saisir ce seuil dans « Longueur max. des
   désignations » (un avertissement signale alors les lignes raccourcies).
4. **Encodage** accepté par l'import (Windows-1252 par défaut ; UTF-8 possible).
5. **Autoliquidation** : vérifier que l'article `IMPAUTO` porte bien le régime
   « TVA due par le preneur » côté Sage, et que le taux exporté `0` convient.
6. **Quantités décimales** et **montants négatifs** (ligne remise) : vérifier
   qu'ils sont acceptés par l'import paramétrable.
