# Sélecteur de panneaux décoratifs — déploiement & maintenance

Outil client (parcours des ~270 modèles de portes, calcul de plus-value) servi en
**statique** sous `public/selecteur-panneaux/`, donc à la **même origine** que
l'application Next (l'iframe est same-origin : sécurité postMessage « gratuite »).

## Livré — Phase 1 (catalogue + durcissement + habillage)

- **Aucun CDN** : Tailwind compilé en CSS statique, Lucide et la police Inter
  auto-hébergés (l'outil ne casse plus si un CDN est bloqué / sous CSP).
- **Mode B « catalogue »** (`?mode=catalogue`) : aucun prix ni bouton de
  sélection, navigation complète (onglets, recherche, regroupement CLASSICO, zoom).
- **Sécurité postMessage** : diffusion vers l'origine du parent (jamais `'*'`) ;
  `event.origin` vérifié sur l'écouteur `SET_DEVIS_COLOR`.
- **Habillage SARANGE** : barre de marque (logo SARANGE + point orange), signature
  dans le footer, bascule chromatique bleu → orange `#f97316` / ardoise `#0f172a`,
  micro-animations sobres (apparition échelonnée des cartes, survol, voile sur les
  CTA) — respectent `prefers-reduced-motion`.

## URLs

| Usage | URL |
|---|---|
| Catalogue — **toutes** les références (Mode B) | `/selecteur-panneaux/selecteur.html?mode=catalogue` |
| Catalogue — uniquement les modèles **sans plus-value** | `/selecteur-panneaux/selecteur.html?mode=catalogue&inclus=1` |
| Devis complet (Mode A, défaut) | `/selecteur-panneaux/selecteur.html` |

Paramètres optionnels : `?couleur=Gris%20Anthracite` (couleur imposée par le devis,
supplément couleur = 0) ; `?parentOrigin=https://mon-app` (origine du parent si un
jour l'iframe est embarquée en cross-origin).

## Contrat postMessage (pour l'intégration signature — Phase 2)

- Parent → iframe : `{ event: 'SET_DEVIS_COLOR', color: '…' }` (filtré sur l'origine).
- iframe → parent : `{ event: 'PANEL_SELECTED', gamme, panelName, panelRef,
  legendeVitrage, croisillonChoisi, couleurChoisie, plusValuePanneauHT,
  plusValueCouleurHT, plusValueTotaleHT, … }` envoyé à l'origine du parent.
  ⚠️ `plusValueTotaleHT` est **déjà un prix de vente HT final** — ne jamais re-marger.

## Fichiers servis (`public/selecteur-panneaux/`)

- `selecteur.html` — l'outil (artefact servi ; peut être édité directement).
- `tailwind.css`, `inter.css`, `fonts/*.woff2`, `lucide.js` — assets auto-hébergés.
- `*.png` / `*.jpg` (273) + `thumbs/` (273) — visuels pleine résolution + vignettes.

## Régénération

Le dossier de travail `Outils Panneaux décoratifs/` (local, **gitignoré** : il
contient le PDF catalogue de 39 Mo et les images dupliquées) est la source.

```bash
node scripts/build-selecteur-html.mjs   # reconstruit selecteur.html (durcissement + catalogue + branding) depuis la source
node scripts/build-selecteur-css.mjs    # recompile tailwind.css (à relancer après toute modif HTML ajoutant des classes)
node scripts/fetch-inter.mjs            # re-télécharge la police Inter (rare)
```

Après le bootstrap initial, `selecteur.html` peut être modifié directement ;
relancer `build-selecteur-css.mjs` si de nouvelles classes Tailwind sont ajoutées.

## Cache-busting

À chaque mise à jour, suffixer l'URL d'un `?v=` côté intégration
(ex. `selecteur.html?v=2`).

## Livré — Phase 2a (intégration à la signature)

- **Détection au moment de l'envoi** : `buildPanelSelections` ([lib/quote-signature-service.js](../lib/quote-signature-service.js)) dérive les portes à panneau décoratif des `payload.cartItems` (`panneauDecoratif === true`) et les stocke dans la session (`panelSelections`), exposées au client via `toPublicSessionResponse`.
- **Page de signature** ([components/QuoteSignaturePage.jsx](../components/QuoteSignaturePage.jsx)) : une iframe du sélecteur par porte (couleur imposée via `?couleur=`), capture de `PANEL_SELECTED` (origine vérifiée + corrélation `contentWindow`/porte), **signature bloquée** tant qu'un panneau n'est pas choisi pour chaque porte.
- **Persistance + double sécurité** : à la signature, `panelChoices` est validé côté serveur (chaque porte doit avoir un choix) puis enregistré dans `signature.panelChoices`.

## Reste à faire — Phase 2b (tampon PDF)

- **Pas de table SKU** : `Blancs` / `Laitons` en texte suffit pour la commande
  (confirmé par SARANGE).

## Livré — Phase 2b (tampon PDF)

- **Mention au devis non signé** : à la génération ([lib/pdf-generator.js](../lib/pdf-generator.js)),
  chaque porte à panneau décoratif affiche `Panneau decoratif : au choix sur catalogue`.
  La **position exacte** de la mention est mémorisée (`panelLineAnchors` : page, X/Y en mm,
  largeur, hauteur de ligne) — le X est pris après le libellé via `doc.getTextWidth`
  (coordonnée indépendante de la police). Ces repères voyagent dans `pdfInfo.signatureAnchors`
  puis sont persistés sur la session.
- **Tampon « collé à la ligne » (principal)** : à la signature, `applySignatureToPdf`
  ([lib/quote-signature-service.js](../lib/quote-signature-service.js)) **masque** la mention
  « au choix sur catalogue » (rectangle blanc) et écrit le panneau retenu (modèle + couleur +
  croisillons) **exactement sur cette ligne**.
- **Page récapitulative avec visuels** : le PDF signé se termine par une page dont le titre
  s'adapte (« Votre panneau décoratif sélectionné » au singulier, « Vos panneaux… » au pluriel).
  Pour chaque porte : l'intitulé, le **visuel** du panneau, puis **sous le visuel** le détail du
  choix (panneau = gamme + numéro, couleur, croisillons, supplément éventuel) — car la photo ne
  reflète pas toujours la couleur des croisillons. Le client garde ainsi une trace fidèle même
  sans rouvrir le catalogue. Le sélecteur renvoie le nom de fichier exact
  dans `PANEL_SELECTED.image` (ex. `ELA_01.jpg`) ; il est validé (anti path-traversal) puis le
  visuel est lu **sur le disque** (`public/selecteur-panneaux/`, sans dépendance réseau) — repli
  HTTP sinon — et embarqué via `pdf-lib`. Si un visuel manque, un cadre « Visuel indisponible »
  est affiché (sans bloquer la signature). Mise en page **dans le thème du devis** : accents
  orange, visuels encadrés, séparateurs, et accents typographiques corrects dans le titre.
- **Libellé panneau** : `panelName` (= id, ex. « ELA 01 ») contient déjà la gamme — on ne la
  re-préfixe pas (corrige l'ancien « ELA ELA 01 »).
- **Robustesse** : texte assaini WinAnsi (`toPdfSafeText`) + tout le tampon isolé dans un
  `try/catch` — un souci de tampon ne peut **jamais** faire échouer la signature (les choix
  restent enregistrés dans `signature.panelChoices`).
- **Plus-value traitée** : si le panneau choisi dépasse le standard inclus
  (`plusValueTotaleHT > 0`), le supplément `+X EUR HT` est (1) **affiché sur le devis signé**
  (sur la ligne + en annexe le cas échéant) et (2) **signalé à SARANGE** dans l'email interne
  de signature, avec un total « à facturer (avenant) ». Le total TTC du devis signé n'est PAS
  modifié unilatéralement : le supplément se traite en avenant.
