# Architecture du projet - Devis Sarange

## 1. Resume executif

Devis Sarange est une application Next.js 16 de creation de devis pour la menuiserie. Le coeur du produit permet :

- de saisir ou reutiliser une fiche client,
- de configurer des produits a partir d'un catalogue tarifaire extrait d'Excel,
- de synchroniser les reglages du catalogue dans Firebase,
- de calculer les prix, remises, poses, marges nettes et TVA,
- de generer un PDF client complet,
- de sauvegarder les devis et clients dans Firebase,
- d'envoyer un devis par email simple ou par parcours de signature,
- de faire signer le PDF puis de stocker la version signee.

Le depot contient deux mondes distincts :

1. l'application active moderne, basee sur `app/`, `components/`, `lib/`, `data/`, `public/`, `tests/`,
2. un ancien socle `SignatureDevisAPI/` conserve comme reference historique/migration, non branche au runtime Next actuel.

L'ancienne version de `architecture.md` etait devenue fausse : elle decrivait un produit "en cours" alors que l'application couvre deja la quasi totalite du cycle de vie d'un devis. Ce document remplace cette vision obsolete par une cartographie detaillee de l'etat reel du code.

## 2. Stack technique

| Bloc | Technologie | Version / detail |
| --- | --- | --- |
| Framework | Next.js | `16.2.1` |
| UI | React | `19.2.4` |
| Rendu | App Router | `app/` |
| Styles | Tailwind CSS | v4 via `@tailwindcss/postcss` |
| Icones | Lucide React | `1.7.0` |
| Drag and drop | `@dnd-kit/*` | panier reordonnable |
| Backend cloud | Firebase client + admin | Firestore, Auth, Storage |
| PDF client | `jspdf`, `jspdf-autotable`, `html2pdf.js` | generation du devis |
| PDF serveur | `pdf-lib` | injection de signature dans le PDF |
| Email | Nodemailer | SMTP |
| Tests | scripts Node simples | `npm test` |

## 3. Perimetre reel du depot

### 3.1 Inclus dans l'architecture applicative

- `app/` : routes Next, pages et API.
- `components/` : interface utilisateur et orchestration locale.
- `lib/` : logique metier, pricing, PDF, signature, Firebase, utilitaires.
- `data/` : catalogue tarifaire brut exploite par le moteur de prix.
- `public/` : logos, manifest, images produit.
- `tests/` : tests unitaires basiques des briques critiques.
- fichiers racine de configuration : `package.json`, `firestore.rules`, `.env.example`, etc.

### 3.2 Hors perimetre fonctionnel direct

- `node_modules/` : dependances.
- `.next/` : build genere.
- `.git/` : historique Git.
- `SignatureDevisAPI/` : ancien systeme autonome de signature, non execute par le runtime actuel.

## 4. Vue d'ensemble des flux

```mermaid
flowchart LR
  U[Utilisateur interne] --> HP[HomePageClient]
  HP --> CF[ClientForm]
  HP --> PS[ProductSelector]
  HP --> CA[Cart]
  HP --> QS[QuoteSummary]

  PS --> PRD[lib/products.js]
  PRD --> TARIF[data/pricing.json]
  PRD --> GLAZE[lib/glazing.js]
  PRD --> COEF[store coefficients]
  PRD --> PRICE[store pricing]
  PRD --> GLCAT[store vitrages personnalises]

  HP --> CLIENTS[lib/firebase/clients.js]
  HP --> QUOTES[lib/firebase/quotes.js]
  HP --> CATCFG[lib/firebase/catalogue.js]
  CLIENTS --> FS1[(Firestore users/{uid}/clients)]
  QUOTES --> FS2[(Firestore users/{uid}/quotes)]
  CATCFG --> FS3[(Firestore users/{uid}/catalogue/config)]

  QS --> PDF[lib/pdf-generator.js]
  PDF --> FILE[PDF navigateur]

  QS --> SEND[/api/quote-signatures/send]
  SEND --> SIGSVC[lib/quote-signature-service.js]
  SIGSVC --> SESS[(Firestore quoteSignatureSessions)]
  SIGSVC --> STORAGE[(Firebase Storage)]
  SIGSVC --> SMTP[(Serveur SMTP)]

  CLIENT[Client final] --> SIGNPAGE[/signature/:token]
  SIGNPAGE --> TOKAPI[/api/quote-signatures/:token/*]
  TOKAPI --> SIGSVC
```

## 5. Parcours fonctionnels

### 5.1 Creation d'un devis

Le point d'entree principal est `/`, rendu par `app/page.js` puis `components/HomePageClient.jsx`.

Le parcours suit 3 etapes :

1. saisie ou prechargement du client,
2. ajout d'articles dans le panier,
3. recapitulatif, conditions commerciales, PDF et envoi.

`HomePageClient` garde l'etat central :

- `clientData`
- `cartItems`
- `tvaRate`
- `quoteSettings`
- `currentStep`
- `activeQuoteId`
- etats UI de sauvegarde, generation PDF, envoi, erreurs

### 5.2 Reprise d'un devis existant

Deux mecanismes existent :

- `/?quote=<id>` : charge un devis Firebase existant.
- `/?client=<id>` : charge une fiche client existante pour demarrer un nouveau devis.

### 5.3 Gestion du client

`components/ClientForm.jsx` :

- affiche le formulaire client principal,
- propose de l'autocompletion depuis les clients Firebase deja sauvegardes,
- interroge `https://api-adresse.data.gouv.fr/search/?q=...&limit=5` pour les suggestions d'adresse,
- gere l'adresse principale et l'adresse chantier,
- remonte un objet client normalise au parent.

Important : la fonction de validation interne renvoie actuellement `{}`. Il n'y a donc pas de vraie validation metier cote formulaire.

### 5.4 Ajout des produits

`components/ProductSelector.jsx` couvre plusieurs types de lignes :

- produit catalogue standard,
- composition de menuiseries assemblees,
- produit personnalise libre,
- ligne de texte seule non tarifee,
- ligne de gestion des dechets,
- variantes a prix fixe pour certaines box domotiques.

La logique de prix s'appuie surtout sur :

- `lib/products.js`
- `lib/glazing.js`
- `data/pricing.json`
- `lib/catalogue-coefficients.js`
- `lib/catalogue-pricing.js`
- `lib/pricing-margin.mjs`

### 5.5 Panier et recapitulatif

`components/Cart.jsx` :

- affiche les lignes,
- permet le reordonnancement via `dnd-kit`,
- permet duplication, edition, suppression, ajustement de quantite,
- recalcule les totaux via `computeQuoteTotals`.

`components/QuoteSummary.jsx` :

- affiche le recapitulatif client + lignes,
- autorise les modifications de designation finale,
- gere les taux de TVA globaux ou par ligne,
- gere l'attestation de TVA reduite si necessaire,
- lance le PDF et les envois.

### 5.6 Generation du PDF

Le PDF est genere dans le navigateur par `lib/pdf-generator.js`.

Le flux est :

1. normalisation des donnees,
2. calcul des totaux,
3. prechargement des assets,
4. rendu des pages via `jsPDF`,
5. memorisation des ancres de signature dans `signatureAnchors`,
6. sauvegarde locale du PDF.

Le PDF contient notamment :

- en-tete entreprise/client,
- detail des produits,
- representations visuelles,
- lignes de pose,
- remises et TTC,
- conditions commerciales,
- blocs legaux et CGV,
- zone prevue pour signature future.

### 5.7 Sauvegarde cloud

Depuis `HomePageClient`, une sauvegarde peut etre declenchee :

- manuellement,
- avant generation du PDF,
- avant envoi email/signature.

Le flux est :

1. sauvegarde/normalisation du client via `lib/firebase/clients.js`,
2. sauvegarde/normalisation du devis via `lib/firebase/quotes.js`,
3. maj des horodatages Firestore,
4. eventuelle invalidation de la session de signature precedente si le devis a change.

### 5.8 Envoi email simple

Le devis est d'abord genere cote navigateur, puis :

1. encode en base64,
2. poste a `POST /api/quote-signatures/send`,
3. pris en charge par `lib/quote-signature-service.js`,
4. stocke dans Firebase Storage,
5. envoye par email via SMTP.

Le mode `deliveryMode = "email"` envoie un devis classique sans parcours de signature.

### 5.9 Envoi pour signature

Le meme endpoint `POST /api/quote-signatures/send` est utilise avec `deliveryMode = "signature"`.

Le service serveur :

1. cree ou reutilise une session `quoteSignatureSessions`,
2. stocke le PDF original,
3. genere une URL publique de signature,
4. envoie un email avec lien et piece jointe,
5. ecrit un resume de workflow dans le devis Firestore.

### 5.10 Signature par le client final

Le client ouvre `/signature/[token]`.

`components/QuoteSignaturePage.jsx` :

- charge la session publique,
- affiche le PDF original,
- permet de dessiner une signature ou d'importer un tampon,
- impose l'acceptation de TVA reduite si le devis l'exige,
- autorise la signature ou le refus.

Le serveur applique ensuite la signature visuelle dans le PDF via `pdf-lib`, publie la version signee, met a jour Firestore et envoie les emails associes.

### 5.11 Relances

Depuis la page `/devis`, les relances J+3, J+10, J+30 s'appuient sur :

- `POST /api/quote-signatures/remind`
- `lib/quote-signature-service.js`
- `lib/quote-signature.js`

## 6. Chemins de donnees

### 6.1 Donnees produit et pricing

Chemin principal :

1. `data/pricing.json` contient les grilles tarifaires brutes.
2. `lib/products.js` trouve la bonne feuille et arrondit les dimensions en mm vers la grille en cm superieure.
3. `lib/glazing.js` ajoute les surcouts de vitrage, panneaux, sous-bassement et thermique.
4. `lib/catalogue-coefficients.js` applique des coefficients par produit, avec cache navigateur et hydration cloud.
5. `lib/catalogue-pricing.js` applique des overrides de prix unitaires/options/poses, avec cache navigateur et hydration cloud.
6. `lib/glazing.js` resolve les vitrages natifs et les vitrages personnalises definis dans le catalogue cloud.
7. `lib/pricing-margin.mjs` compense les remises visibles si on veut preserver une marge nette ou un discount net.
8. `lib/quote-totals.mjs` calcule HT, TVA, TTC et repartition par taux.

### 6.2 Donnees client

Chemin principal :

1. saisie dans `ClientForm`,
2. normalisation par `sanitizeClientData` dans `lib/client-cloud.js`,
3. sauvegarde optionnelle dans `users/{uid}/clients/{clientId}`,
4. copie egalement embarquee dans `payload.clientData` du devis.

### 6.3 Donnees devis

Chemin principal :

1. `HomePageClient` construit l'etat du devis,
2. `lib/quote-cloud.js` normalise le payload,
3. `lib/firebase/quotes.js` ecrit le document dans `users/{uid}/quotes/{quoteId}`,
4. la page `/devis` s'abonne a la collection pour affichage, filtres et actions.

### 6.4 Donnees PDF

Chemin principal :

1. `buildQuotePdfDocument()` genere `doc`, `blob`, `arrayBuffer`, `filename`, `quoteNumber`, `issueDate`, `totals`, `signatureAnchors`,
2. le navigateur peut telecharger directement le PDF,
3. pour l'envoi, le PDF est converti en base64 puis transmis a l'API,
4. l'API le stocke dans Firebase Storage.

### 6.5 Donnees de signature

Chemin principal :

1. session stockee dans `quoteSignatureSessions/{sessionId}`,
2. resume de workflow stocke aussi dans `users/{uid}/quotes/{quoteId}.signatureWorkflow`,
3. PDF original et PDF signe stockes dans Firebase Storage sous `quote-signatures/...`,
4. les pages publiques lisent la session via le token,
5. la signature finalisee modifie le PDF puis met a jour la session et le devis.

### 6.6 Cache navigateur et catalogue cloud

Le catalogue conserve un cache navigateur pour rester reactif et survivre a une perte de connexion. Ce cache vit en `localStorage` :

- `sarange.catalogue.coefficients`
- `sarange.catalogue.pricing`
- `sarange.catalogue.customGlazings`

Quand Firebase est configure et qu'un utilisateur est connecte, ces donnees sont egalement synchronisees dans `users/{uid}/catalogue/config`.

## 7. Modeles de donnees utiles

### 7.1 Client (`clientData`)

Source principale : `lib/client-cloud.js`.

```js
{
  savedClientId: '',
  nom: '',
  prenom: '',
  referenceDevis: '',
  adresse: '',
  codePostal: '',
  ville: '',
  telephone: '',
  email: '',
  memeAdresseChantier: true,
  adresseChantier: '',
  codePostalChantier: '',
  villeChantier: ''
}
```

### 7.2 Client Firestore

`users/{uid}/clients/{clientId}`

```js
{
  displayName,
  fullName,
  email,
  telephone,
  telephoneDigits,
  city,
  codePostal,
  referenceHint,
  searchText,
  payload,
  createdAt,
  updatedAt,
  lastUsedAt
}
```

### 7.3 Devis Firestore

`users/{uid}/quotes/{quoteId}`

```js
{
  title,
  status,
  schemaVersion: 3,
  clientId,
  clientName,
  clientEmail,
  clientPhone,
  clientCity,
  referenceDevis,
  productCount,
  totalHT,
  totalTTC,
  tvaRate,
  searchText,
  payload: {
    clientData,
    cartItems,
    tvaRate,
    currentStep,
    quoteSettings
  },
  signatureWorkflow,
  createdAt,
  updatedAt
}
```

### 7.4 Ligne panier (`cartItem`)

Le schema exact varie selon le type de ligne, mais on retrouve typiquement :

```js
{
  id,
  type,
  category,
  productId,
  label,
  sheetName,
  width,
  height,
  quantity,
  includePose,
  remise,
  tvaRate,
  customDescription,
  customImage,
  options,
  composition,
  customPrice
}
```

Types particuliers supportes :

- produit standard catalogue,
- composite,
- `custom-product`,
- `text-only`,
- `gestion-dechets`,
- variantes a prix fixe.

### 7.5 Parametres commerciaux (`quoteSettings`)

Source : `lib/quote-settings.mjs`.

Contient notamment :

- mode de paiement `standard` ou `schedule`,
- acompte standard 50/40/30,
- repartition personnalisee signature/ouverture/solde,
- delai de livraison preset ou libre.

### 7.6 Session de signature

Collection : `quoteSignatureSessions/{sessionId}`

Structure logique :

```js
{
  sessionId,
  source,
  status,
  deliveryMode,
  userId,
  quoteId,
  recipient,
  quote,
  document: {
    originalPdfPath,
    originalFilename,
    signedPdfPath,
    signedFilename,
    signatureAnchors
  },
  signature: {
    signerName,
    signerIp,
    userAgent,
    reducedVatAccepted,
    refusalReason
  },
  reminders,
  sentAt,
  viewedAt,
  signedAt,
  refusedAt,
  expiredAt,
  createdAt,
  updatedAt
}
```

### 7.7 Resume de signature embarque dans le devis

Le devis stocke aussi un sous-objet `signatureWorkflow` pour rendre l'interface `/devis` rapide sans devoir parcourir toute la session :

- `sessionId`
- `status`
- `deliveryMode`
- `signingUrl`
- `sentAt`
- `viewedAt`
- `signedAt`
- `refusedAt`
- `expiredAt`
- `needsResend`
- drapeaux de disponibilite des PDF

### 7.8 Catalogue cloud

Document : `users/{uid}/catalogue/config`

```js
{
  schemaVersion: 1,
  coefficients,
  pricing,
  customGlazingOptions,
  createdAt,
  updatedAt
}
```

## 8. Inventaire complet des fichiers

Cette section documente tous les fichiers utiles du depot versionne hors `node_modules/` et `.next/`.

### 8.1 Racine du projet

| Chemin | Role |
| --- | --- |
| `AGENTS.md` | Consignes projet pour agents IA. Signale notamment que cette version de Next.js a des differences importantes et qu'il faut lire la doc locale de Next avant d'ecrire du code. |
| `CLAUDE.md` | Redirection minimale vers `AGENTS.md`. |
| `README.md` | README encore base sur le template Create Next App, non representatif du produit reel. |
| `architecture.md` | Cette documentation d'architecture detaillee. |
| `brandsarange.html` | Support de reference visuelle/branding au niveau racine. N'est pas branche a l'application. |
| `base64_final.txt` | Fichier artefact non reference dans le code actuel au moment de l'analyse. |
| `.env.example` | Liste des variables d'environnement attendues pour Firebase, SMTP et signature. |
| `package.json` | Manifest npm, scripts de dev/build/test, dependances. |
| `package-lock.json` | Verrou de dependances npm. |
| `next.config.mjs` | Configuration Next actuellement vide. |
| `jsconfig.json` | Active l'alias d'import `@/*`. |
| `eslint.config.mjs` | Configuration ESLint basee sur `eslint-config-next`. |
| `postcss.config.mjs` | Active Tailwind CSS v4 via PostCSS. |
| `firestore.rules` | Regles Firestore : acces restreint au proprietaire pour `users/{uid}/quotes` et `users/{uid}/clients`. |
| `test-env.mjs` | Script de verification locale de l'environnement Firebase Admin + SMTP. |

### 8.2 `app/` - routes Next actives

| Chemin | Role |
| --- | --- |
| `app/layout.js` | Layout global. Charge la police Inter, le provider Firebase, metadata, viewport et `globals.css`. |
| `app/globals.css` | Styles globaux minimaux et import Tailwind. |
| `app/page.js` | Route `/`. Affiche `HomePageClient` sous `Suspense`. |
| `app/devis/page.js` | Route `/devis`. Liste, filtre et pilote les devis cloud. |
| `app/clients/page.js` | Route `/clients`. CRUD des fiches clients. |
| `app/catalogue/page.js` | Route `/catalogue`. Edition des coefficients, prix et vitrages personnalises, avec synchronisation Firestore si la session Firebase est active. |
| `app/compta/page.js` | Route `/compta`. Onglet Compta : preparation, controle, generation et suivi des exports CSV vers Sage 50 (voir `COMPTA.md`). |
| `app/signature/[token]/page.js` | Route publique de signature d'un devis. |
| `app/api/quote-signatures/send/route.js` | `POST` authentifie pour envoyer un devis par email ou signature. |
| `app/api/quote-signatures/remind/route.js` | `POST` authentifie pour les relances J+3/J+10/J+30. |
| `app/api/quote-signatures/[token]/route.js` | `GET` public pour recuperer la session de signature. |
| `app/api/quote-signatures/[token]/document/route.js` | `GET` public pour servir le PDF original ou signe. |
| `app/api/quote-signatures/[token]/sign/route.js` | `POST` public pour signer un devis via token. |
| `app/api/quote-signatures/[token]/refuse/route.js` | `POST` public pour refuser un devis via token. |

Remarque : le menu principal contient aussi un lien `/parametres`, mais `app/parametres/page.js` n'existe pas actuellement.

### 8.3 `components/` - interface utilisateur

| Chemin | Role |
| --- | --- |
| `components/AppShell.jsx` | Coquille d'application : sidebar desktop, topbar mobile, container de page. |
| `components/BottomNav.jsx` | Navigation mobile basse. |
| `components/Sidebar.jsx` | Navigation laterale, etat auth Firebase, bouton deconnexion. |
| `components/HomePageClient.jsx` | Orchestrateur principal du parcours devis sur `/`. |
| `components/ClientForm.jsx` | Formulaire client, autocompletion cloud, autocompletion adresse France. |
| `components/ProductSelector.jsx` | Configurateur de produits, services, composites et lignes specifiques. |
| `components/Cart.jsx` | Panier avec tri, duplication, edition, suppression et TVA globale. |
| `components/QuoteSummary.jsx` | Recapitulatif final, edition de designations, TVA par ligne, PDF, envois. |
| `components/QuoteSummary.module.css` | Styles de l'overlay de generation PDF. |
| `components/QuoteCommercialTerms.jsx` | Edition des conditions commerciales et echeancier. |
| `components/QuoteSignaturePage.jsx` | Experience publique de consultation et signature du devis. |
| `components/FirebaseProvider.jsx` | Provider auth Firebase, persistance de session et hooks exposes au reste de l'app. |
| `components/FirebaseAuthCard.jsx` | Carte d'authentification email/mot de passe et Google. |
| `components/MenuiserieVisual.jsx` | Rendu visuel d'une menuiserie ou composition cote interface. |
| `components/CompositeSVG.jsx` | SVG riche pour les produits composes. |
| `components/QuoteCloudPanel.jsx` | Panneau de sauvegarde cloud non monte actuellement dans l'application. |
| `components/icons/WasteRecycleIcon.jsx` | Icone SVG de gestion des dechets. |

### 8.4 `lib/` - logique metier et techniques transverses

| Chemin | Role |
| --- | --- |
| `lib/products.js` | Coeur du moteur de catalogue, categories, options, composites, pricing unitaire et lineaire, dechets, thermiques. |
| `lib/glazing.js` | Regles de vitrage, panneaux sandwich, surfaces utiles, prix au m2, indicateurs thermiques et store des vitrages personnalises. |
| `lib/menuiserie.js` | Construction de configurations de rendu a partir des options produit. |
| `lib/MenuiserieRenderer.js` | Rendu canvas des menuiseries pour l'UI et le PDF. |
| `lib/designation-generator.js` | Generation des designations lisibles inserees dans le PDF. |
| `lib/pdf-generator.js` | Generation du PDF client complet et memorisation des ancres de signature. |
| `lib/pdf-page-utils.js` | Helpers de pagination jsPDF et deduplication de sources image. |
| `lib/assets.js` | Assets inline utilitaires pour le PDF (logos SVG, icones). |
| `lib/quote-totals.mjs` | Calcul des totaux HT/TVA/TTC, ventilation par taux et flags TVA reduite. |
| `lib/quote-settings.mjs` | Normalisation et phrasing des conditions commerciales. |
| `lib/pricing-margin.mjs` | Calcul de compensation pour marge nette ou discount net cibles. |
| `lib/quote-cloud.js` | Normalisation de payload de devis, record Firestore, recherche et sanitation. |
| `lib/client-cloud.js` | Normalisation client, derive d'identifiant, display name, recherche. |
| `lib/quote-signature.js` | Etats, labels, helpers de routing et regles d'expiration de signature. |
| `lib/quote-signature-service.js` | Service serveur principal de delivery, stockage, signature PDF, relances et emails. |
| `lib/catalogue-cloud.js` | Normalisation du document catalogue et agregation du payload courant a synchroniser. |
| `lib/catalogue-coefficients.js` | Store navigateur pour coefficients produit (`localStorage`). |
| `lib/catalogue-pricing.js` | Store navigateur pour prix/options/poses (`localStorage`), hydrate depuis Firebase. |
| `lib/api-route-errors.js` | Helper commun pour reponses JSON d'erreur dans les routes API. |
| `lib/sage-export.mjs` | Moteur PUR d'export Sage 50 (onglet Compta) : parametres, mapping TVA→article, modele d'export, validations, CSV, nommage, empreinte anti-doublon, encodage. Dependances injectees (testable Node). |
| `lib/sage-export-service.js` | Liaison du moteur Sage avec le vrai moteur de calcul (products, quote-totals, designations, variantes) : les montants exportes sont ceux du devis/PDF. |
| `lib/compta-local.mjs` | Persistance LOCALE de l'onglet Compta (source de verite) : parametres Sage et historique des exports en localStorage (cles versionnees par uid), export/import JSON de la configuration. Stockage injectable (testable Node). |

### 8.5 `lib/firebase/` - acces Firebase

| Chemin | Role |
| --- | --- |
| `lib/firebase/client.js` | Initialisation client Firebase Auth/Firestore/Storage, detection de configuration. |
| `lib/firebase/admin.js` | Initialisation serveur Firebase Admin, verification du bearer token, acces Storage/Firestore admin. |
| `lib/firebase/catalogue.js` | Lecture, ecriture et abonnement sur `users/{uid}/catalogue/config`. |
| `lib/firebase/clients.js` | CRUD et abonnement sur `users/{uid}/clients`. |
| `lib/firebase/quotes.js` | CRUD et abonnement sur `users/{uid}/quotes`, avec invalidation de session de signature si devis modifie. |
| `lib/firebase/compta.js` | Miroir Firestore FACULTATIF de l'onglet Compta (desactive par defaut) : recopie best-effort des parametres (`users/{uid}/compta/settings`), des exports (`users/{uid}/comptaExports`) et du resume `comptaExport` sur le devis. Jamais requis pour generer/telecharger un CSV. |

### 8.6 `data/`

| Chemin | Role |
| --- | --- |
| `data/pricing.json` | Catalogue brut des tarifs par feuille et grille dimensionnelle. Piece maitresse du calcul. |

### 8.7 `public/`

| Chemin | Role |
| --- | --- |
| `public/logo.svg` | Logo principal. |
| `public/favicon.svg` | Favicon navigateur. |
| `public/app-emblem.png` | Embleme de l'application. |
| `public/logorgemadeinfrance.png` | Asset utilise dans le PDF. |
| `public/manifest.json` | Manifest applicatif. |
| `public/products/volets/box-domotique-cherubini-metahome.webp` | Illustration produit pour une box domotique a prix fixe. |
| `public/products/volets/box-domotique-gaposa-rollappx.webp` | Illustration produit pour une box domotique a prix fixe. |

### 8.8 `tests/`

| Chemin | Role |
| --- | --- |
| `tests/pricing-margin.test.mjs` | Valide les calculs de compensation de marge nette / discount net. |
| `tests/quote-settings.test.mjs` | Valide la normalisation et les phrases de conditions commerciales. |
| `tests/quote-signature.test.mjs` | Valide les helpers de statut et de relance de signature. |
| `tests/pdf-page-utils.test.mjs` | Valide les utilitaires de pagination PDF et dedup image. |
| `tests/sage-export.test.mjs` | Valide le moteur d'export Sage : regimes de TVA, remises nettes, lignes gratuites, multi-taux, anti-doublon, controles de coherence, rendu CSV et encodage. |
| `tests/compta-local.test.mjs` | Valide la persistance locale Compta : cles par uid, defauts, remplacement versionne, statuts, borne d'historique, export/import JSON de configuration. |

### 8.9 `SignatureDevisAPI/` - ancien systeme, conserve comme reference

Ce dossier ne fait pas partie du runtime Next actuel. Il documente l'ancienne architecture de signature de devis, basee sur HTML/JS autonome, Google Apps Script, Google Drive et Gmail.

| Chemin | Role |
| --- | --- |
| `SignatureDevisAPI/index.html` | Ancienne page publique de signature. |
| `SignatureDevisAPI/admin.html` | Ancienne interface admin. |
| `SignatureDevisAPI/js/app.js` | Logique front de signature de l'ancien systeme. |
| `SignatureDevisAPI/js/admin.js` | Logique admin de preparation/envoi de l'ancien systeme. |
| `SignatureDevisAPI/css/style.css` | Styles de la page publique legacy. |
| `SignatureDevisAPI/css/admin.css` | Styles de la page admin legacy. |
| `SignatureDevisAPI/gas-handler-admin.js` | Backend Google Apps Script legacy. |
| `SignatureDevisAPI/QuoteParserService.js` | Parsing PDF legacy. |
| `SignatureDevisAPI/debug_pdf.js` | Script debug legacy autour des PDF. |
| `SignatureDevisAPI/ARCHITECTURE.MD` | Documentation de l'ancien systeme. |
| `SignatureDevisAPI/brandsarange.html` | Brand board legacy. |
| `SignatureDevisAPI/TESTDEVIS.PDF` | PDF d'exemple legacy. |
| `SignatureDevisAPI/package.json` | Dependances du prototype legacy. |
| `SignatureDevisAPI/package-lock.json` | Lock file du prototype legacy. |
| `SignatureDevisAPI/favicon-32.png` | Asset legacy. |
| `SignatureDevisAPI/favicon-192.png` | Asset legacy. |
| `SignatureDevisAPI/apple-touch-icon.png` | Asset legacy. |

## 9. Logique metier detaillee

### 9.1 Catalogue et categories

`lib/products.js` expose les categories principales :

- fenetres,
- coulissants,
- portes-fenetres,
- portes,
- volets,
- services,
- custom.

Le fichier gere aussi :

- les options couleur,
- les surcouts de pose,
- les variantes fixes,
- le calcul des dechets,
- les produits composites,
- les indicateurs thermiques,
- les resume de prix avant/apres remise.

### 9.2 Regles de prix

Le calcul de base d'un article suit globalement cet ordre :

1. recuperation du prix grille par dimension,
2. application du coefficient local produit,
3. ajout des surcouts couleur,
4. ajout vitrage / panneau / sous-bassement,
5. ajout d'options (OB, grilles, petits bois, poignee, motorisation...),
6. compensation eventuelle pour objectif de marge nette ou discount net,
7. application de la remise visible,
8. ajout de la pose si demandee,
9. multiplication par la quantite.

Cas particuliers :

- `custom-product` : le prix provient directement de `customPrice`,
- `text-only` : la ligne vaut toujours zero,
- `gestion-dechets` : calcule un cout a partir de facteurs de surface/poids,
- composites : aggregation des modules enfants.

### 9.3 TVA

`lib/quote-totals.mjs` prend en charge :

- TVA `0`, `5.5`, `10`, `20`,
- TVA globale par devis,
- TVA specifique par ligne,
- ventilation par buckets,
- drapeaux `hasReducedVat` et `hasZeroVat`.

Si plusieurs taux coexistent, le PDF et l'UI basculent en mode multi-taux.

### 9.4 Conditions commerciales

`lib/quote-settings.mjs` gere :

- la normalisation des valeurs,
- la validation des echeanciers personnalises,
- la transformation en texte legal lisible,
- les blocs de phrases injectes dans le PDF.

### 9.5 Rendu visuel des produits

Le rendu combine plusieurs couches :

- `lib/menuiserie.js` transforme les options en structure graphique,
- `lib/MenuiserieRenderer.js` dessine sur canvas,
- `components/CompositeSVG.jsx` dessine les compositions complexes.

Ces rendus sont reutilises a la fois dans l'interface et dans le PDF.

### 9.6 PDF

`lib/pdf-generator.js` est un morceau central du projet. Il :

- precharge les logos et images,
- rend les representations produits,
- injecte les designations construites,
- genere la numerotation de devis,
- pose les blocs legaux,
- reserve un bloc precise pour la signature ulterieure,
- retourne les ancres permettant a `pdf-lib` de signer visuellement le bon endroit plus tard.

### 9.7 Signature electronique "maison"

La signature n'utilise pas un prestataire externe type DocuSign. Le projet gere lui-meme :

- le stockage de la session,
- l'expiration,
- le lien public securise par token,
- la capture de signature image,
- l'injection graphique dans le PDF,
- les notifications email,
- les relances.

## 10. API et contrats d'entree/sortie

### 10.1 `POST /api/quote-signatures/send`

Authentification :

- bearer token Firebase obligatoire.

Body attendu :

```json
{
  "quoteId": "id-du-devis",
  "deliveryMode": "email ou signature",
  "pdfBase64": "pdf encode en base64",
  "pdfInfo": {
    "filename": "...",
    "quoteNumber": "...",
    "issueDate": "...",
    "issueDateLabel": "...",
    "pageCount": 0,
    "signatureAnchors": {}
  }
}
```

### 10.2 `POST /api/quote-signatures/remind`

Authentification :

- bearer token Firebase obligatoire.

Body attendu :

```json
{
  "sessionId": "qs_...",
  "reminderLevel": 1
}
```

### 10.3 `GET /api/quote-signatures/[token]`

Public. Retourne une vue publique de la session de signature : statut, recipient, quote, urls document, flags TVA reduite, dates.

### 10.4 `GET /api/quote-signatures/[token]/document?type=original|signed`

Public. Retourne le PDF inline.

### 10.5 `POST /api/quote-signatures/[token]/sign`

Public. Body attendu :

```json
{
  "signatureDataUrl": "data:image/png;base64,...",
  "signerName": "Nom du signataire",
  "acceptReducedVat": true
}
```

Le serveur ajoute aussi l'IP et le user-agent.

### 10.6 `POST /api/quote-signatures/[token]/refuse`

Public. Body possible :

```json
{
  "reason": "Motif libre"
}
```

## 11. Variables d'environnement

Source : `.env.example`

### 11.1 Firebase client

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### 11.2 Firebase admin

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `FIREBASE_ADMIN_STORAGE_BUCKET`
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`

### 11.3 Signature

- `QUOTE_SIGNATURE_BASE_URL`
- `QUOTE_SIGNATURE_FROM_EMAIL`
- `QUOTE_SIGNATURE_FROM_NAME`
- `QUOTE_SIGNATURE_INTERNAL_EMAIL`
- `QUOTE_SIGNATURE_REPLY_TO`
- `QUOTE_SIGNATURE_EXPIRY_DAYS`
- `NEXT_PUBLIC_QUOTE_SIGNATURE_EXPIRY_DAYS`

### 11.4 SMTP

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

## 12. Comment utiliser l'outil

### 12.1 Usage metier quotidien

1. ouvrir `/`,
2. saisir ou rechercher un client,
3. ajouter les produits,
4. verifier le recapitulatif,
5. choisir les conditions commerciales,
6. generer le PDF,
7. sauvegarder/en envoyer le devis.

### 12.2 Reprise d'un devis

- ouvrir `/devis`,
- rechercher/filtrer le devis,
- cliquer pour le reouvrir sur `/?quote=<id>`.

### 12.3 Creation d'un devis depuis une fiche client

- ouvrir `/clients`,
- choisir un client,
- utiliser le lien de demarrage de devis vers `/?client=<id>`.

### 12.4 Reglage du catalogue

- ouvrir `/catalogue`,
- modifier les coefficients par produit, les prix unitaires/options et les vitrages personnalises,
- si la session Firebase est ouverte, constater que les changements sont synchronises dans le cloud,
- sinon, constater qu'ils restent caches localement dans le navigateur.

### 12.5 Environnement de developpement

Commandes utiles :

```bash
npm install
npm run dev
npm run test
npm run build
```

Conditions pratiques :

- sans variables Firebase, l'app peut encore servir a monter un devis et generer un PDF, mais les fonctions cloud seront desactivees,
- sans SMTP + Firebase Admin, la signature et l'envoi ne fonctionneront pas.

## 13. Tests et couverture

Les tests existants couvrent surtout des briques unitaires.

Couvert :

- calculs de marge nette / discount net,
- conditions commerciales,
- helpers de statut signature,
- helpers de pagination PDF.

Non ou peu couvert :

- parcours UI complet,
- integration Firebase Auth/Firestore/Storage,
- generation PDF bout en bout,
- routes API de signature,
- application reelle d'une signature sur un PDF.

## 14. Points d'attention et zones a surveiller

### 14.1 Route manquante

Le menu reference `/parametres`, mais la page n'existe pas.

### 14.2 Validation client incomplete

`ClientForm` ne porte pas encore une vraie validation metier.

### 14.3 README obsolete

`README.md` est encore celui du template Next.js. Il ne decrit ni les flux, ni Firebase, ni la signature.

### 14.4 Catalogue hybride cache + cloud

Le catalogue utilise maintenant un mode hybride : cache local navigateur + Firestore. Cela reduit le risque de perte, mais demande une session Firebase valide pour partager les reglages entre postes.

### 14.5 Composant inutilise

`components/QuoteCloudPanel.jsx` existe mais n'est pas reference par le reste du code.

### 14.6 Artefacts legacy dans le depot

Le dossier `SignatureDevisAPI/`, `brandsarange.html` et `base64_final.txt` peuvent semer le doute chez un repreneur s'ils ne sont pas explicitement qualifies de legacy/reference.

### 14.7 Documentation legacy et caractere "source of truth"

L'ancien `architecture.md` et `SignatureDevisAPI/ARCHITECTURE.MD` ne doivent plus etre consideres comme la source de verite de l'application active. Le code actif est celui du couple `app/` + `components/` + `lib/`.

## 15. Conclusion operative

Le projet n'est pas un simple generateur de PDF : c'est un mini SI de devis avec :

- saisie client,
- moteur de chiffrage,
- persistance cloud,
- portefeuille de devis,
- portefeuille clients,
- parametrage cloud du catalogue avec cache local,
- moteur PDF,
- workflow de signature,
- emails et relances.

Pour reprendre le projet efficacement, les points d'entree les plus importants sont :

1. `components/HomePageClient.jsx` pour le parcours principal,
2. `lib/products.js` pour le pricing,
3. `lib/pdf-generator.js` pour le document final,
4. `lib/quote-signature-service.js` pour l'envoi et la signature,
5. `lib/firebase/quotes.js` et `lib/firebase/clients.js` pour la persistence.
