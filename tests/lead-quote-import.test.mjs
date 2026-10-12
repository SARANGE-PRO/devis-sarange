// Import d'une demande du configurateur du site en lignes de panier.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/lead-quote-import.test.mjs
//
// Les lignes produites doivent être celles que le sélecteur de produits
// aurait fabriquées au bureau (prix de grille, vitrage, coloration, options
// sur le vantail principal, volet monobloc, box domotique) ; tout ce qui ne
// se devine pas reste une note ou une ligne libre à chiffrer.
import assert from 'node:assert/strict';

const {
  attachLeadPhotos,
  buildLeadCartItems,
  buildLeadQuoteTitle,
  colorStateFromLead,
  leadIncludesPose,
  leadPhotoCount,
  principalSashIndex,
  stableStringify,
} = await import('../lib/lead-quote-import.mjs');
const { calculateItemPrice } = await import('../lib/products.js');
const { computeQuoteTotals } = await import('../lib/quote-totals.mjs');
const { buildQuoteDraftRecord } = await import('../lib/quote-cloud.js');

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

// Une demande telle que le site la produit (payload.js, buildProject).
const fenetre = (over = {}) => ({
  familleId: 'fenetre',
  quantity: 2,
  title: 'Fenêtre, 2 vantaux, pvc, blanc, 120 × 125 cm',
  productId: 'fenetre-2v',
  glazingId: 'rg-vi01-pvc',
  colorOptionId: 'blanc',
  couleur: 'Blanc 9016',
  widthMm: 1200,
  heightMm: 1250,
  horsCatalogue: false,
  notes: [],
  options: { oscilloBattant: false, grilleVentilation: false, cintre: false, petitsBois: false, petitsBoisH: 0, petitsBoisV: 0, petitsBoisType: null, petitsBoisCouleur: null },
  photoCount: 0,
  ...over,
});
const project = (items, pose = 'Fourniture + Pose SARANGE') => ({ version: 1, leadId: 'abc123', source: 'configurateur', items, pose });

run('une fenetre ordinaire devient une ligne catalogue au prix de grille, posee, vitrage standard', () => {
  const [item] = buildLeadCartItems(project([fenetre()]), { now: 1 });
  assert.equal(item.id, 'lead-1-1');
  assert.equal(item.productId, 'fenetre-2v');
  assert.equal(item.sheetName, 'Fenêtre 2V');
  assert.equal(item.quantity, 2);
  assert.equal(item.unitPrice, 498);
  assert.equal(item.billedWidthCm, 120);
  assert.equal(item.billedHeightCm, 125);
  assert.equal(item.includePose, true);
  assert.equal(item.colorOption.id, 'blanc');
  assert.equal(item.glazingOption.id, 'rg-vi01-pvc');
  assert.equal(item.glazingOption.isBaseIncluded, true);
  assert.deepEqual(item.sashOptions, {});
  assert.equal(item.voletMonobloc, false);
  assert.equal(item.petitsBoisH, 0);
  assert.equal(item.showThermalData, true);
  assert.ok(Number.isFinite(item.thermalUw), 'Uw calculé comme au bureau');
  assert.match(item.marketingBase, /Profiles PVC Schuco 70 mm/);
  assert.equal(item.marketingFinition, 'Finition : Blanc');
  assert.equal(item.leadTitle, 'Fenêtre, 2 vantaux, pvc, blanc, 120 × 125 cm');
  assert.deepEqual(item.leadNotes, []);
  // Le calcul de prix du bureau accepte la ligne telle quelle.
  const calc = calculateItemPrice(item);
  assert.ok(calc.totalLine > 0);
  assert.equal(calc.posePrice, 250);
});

run('options, vitrage acoustique, couleur, petits bois et volet lie : les memes champs que le formulaire', () => {
  const [item] = buildLeadCartItems(
    project([
      fenetre({
        productId: 'fenetre-2v-alu',
        glazingId: 'rg-vi21-alu',
        colorOptionId: 'coloration-2f',
        couleur: 'Gris 7016 2 faces',
        options: { oscilloBattant: true, grilleVentilation: true, cintre: false, petitsBois: true, petitsBoisH: 2, petitsBoisV: 1, petitsBoisType: '26x8-teinte-hors-standard', petitsBoisCouleur: 'gris anthracite' },
        voletLie: { manoeuvre: 'SOLAIRE', label: 'Solaire' },
        notes: ['volet avec la fenêtre : monobloc ou séparé, à trancher au bureau'],
      }),
    ])
  );
  assert.equal(item.productId, 'fenetre-2v-alu');
  assert.equal(item.material, 'alu');
  assert.equal(item.showThermalData, false);
  assert.equal(item.glazingOption.id, 'rg-vi21-alu');
  assert.equal(item.colorOption.id, 'coloration-2f');
  assert.equal(item.rawColorState.color2fType, 'standard_7016');
  assert.equal(item.marketingFinition, 'Finition : Gris 7016 2 faces');
  assert.equal(item.svgColor, '#4A4A4A');
  // OB et grille sur le vantail principal (celui de la poignée) seulement.
  assert.deepEqual(item.sashOptions, { 1: { ob: true, vent: true } });
  assert.deepEqual([item.petitsBoisH, item.petitsBoisV, item.petitsBoisType], [2, 1, '26x8-teinte-hors-standard']);
  assert.equal(item.voletMonobloc, true);
  assert.equal(item.voletMonoblocManoeuvre, 'solaire');
  assert.ok(item.leadNotes.some((n) => /monobloc/.test(n)));
  // Pas de grille alu pour ces cotes : la ligne existe, à 0, et le dit.
  assert.equal(item.unitPrice, 0);
  assert.ok(item.leadNotes.some((n) => /à chiffrer|hors grille/.test(n)));
});

run('sans cotes, la ligne existe a 0 avec une note ; hors grille, le tarif de repli est signale', () => {
  const [sans] = buildLeadCartItems(project([fenetre({ widthMm: undefined, heightMm: undefined, notes: ['cotes à relever sur place'] })]));
  assert.equal(sans.unitPrice, 0);
  assert.equal(sans.widthMm, 0);
  assert.ok(sans.leadNotes.some((n) => /Cotes à relever/.test(n)));
  assert.equal(sans.thermalUw, null);
  const [hors] = buildLeadCartItems(project([fenetre({ widthMm: 3200, heightMm: 1250 })]));
  assert.equal(hors.outOfGridPricing, true);
  assert.ok(hors.unitPrice > 0);
  assert.ok(hors.leadNotes.some((n) => /hors grille/.test(n)));
});

run('porte d entree : grille reno, panneau et parties fixes en notes, jamais devines', () => {
  const [item] = buildLeadCartItems(
    project([
      {
        familleId: 'porte-entree', quantity: 1, title: "Porte d'entrée, mixte pvc / alu, panneau REVA 62, 90 × 215 cm, + tierce 40 cm",
        productId: 'porte-reno', glazingId: null, colorOptionId: 'coloration-2f', couleur: 'Gris Anthracite (RAL 7016) - 2 faces',
        widthMm: 900, heightMm: 2150, horsCatalogue: false, panneau: 'REVA 62, Gris Anthracite (RAL 7016) - 2 faces',
        options: { tierce: true, tierceWidthMm: 400, imposte: false, imposteHeightMm: 0 },
        notes: ['grille rénovation par défaut, à confirmer', 'tierce de 400 mm'],
      },
    ])
  );
  assert.equal(item.productId, 'porte-reno');
  assert.equal(item.unitPrice, 1027);
  assert.equal(item.panneauDecoratif, false);
  assert.ok(item.glazingOption, 'une porte sans panneau décoratif est vitrée pour le formulaire');
  assert.ok(item.leadNotes.some((n) => /Panneau choisi sur le site : REVA 62/.test(n)));
  assert.ok(item.leadNotes.some((n) => /tierce de 400 mm/.test(n)));
  assert.equal(calculateItemPrice(item).posePrice, 400);
});

run('volet seul : grille Volet Filaire, couleur volet, et la box domotique GAPOSA pour un solaire, une seule fois', () => {
  const volet = { familleId: 'volet-roulant', quantity: 2, title: 'Volet roulant, solaire, gris 7016, 120 × 140 cm, + pilotage smartphone', productId: 'volet-solaire', glazingId: null, colorOptionId: 'coloration-2f', couleur: 'Gris 7016', widthMm: 1200, heightMm: 1400, horsCatalogue: false, notes: [], extraLines: ['volet-box-domotique'] };
  const items = buildLeadCartItems(project([volet, { ...volet, extraLines: ['volet-box-domotique'] }]));
  assert.equal(items.length, 3);
  assert.equal(items[0].productId, 'volet-solaire');
  assert.equal(items[0].sheetName, 'Volet Filaire');
  assert.equal(items[0].colorOption.id, 'coloration-2f');
  assert.equal(items[0].colorOption.surcharge, 0.1);
  assert.equal(items[0].glazingOption, null);
  assert.ok(items[0].unitPrice > 0);
  assert.equal(items[0].marketingFinition, 'Finition : Gris Anthracite RAL 7016');
  const box = items[2];
  assert.equal(box.productId, 'volet-box-domotique');
  assert.equal(box.productVariantId, 'box_domotique_gaposa_rollappx');
  assert.equal(box.unitPrice, 179);
  assert.equal(box.hasDimensions, false);
  // Une fenêtre avec volet radio et box : CHERUBINI.
  const [, boxRadio] = buildLeadCartItems(project([fenetre({ voletLie: { manoeuvre: 'RADIO' }, extraLines: ['volet-box-domotique'] })]));
  assert.equal(boxRadio.productVariantId, 'box_domotique_cherubini_metahome');
});

run('velux : la ligne libre pre-remplie du configurateur Velux, avec sa reference et sa thermique', () => {
  const [item] = buildLeadCartItems(
    project([{ familleId: 'velux', quantity: 1, title: 'Fenêtre de toit, rotation, MK04', productId: 'velux-configurateur', horsCatalogue: false, velux: { opening: 'rotation', finish: 'bois-vernis', sizeCode: 'MK04', range: 'standard', flashing: 'edw', accessory: 'aucun' }, notes: [], photoCount: 1 }])
  );
  assert.equal(item.productId, 'custom-product');
  assert.match(item.productLabel, /^Velux GGL MK04 \(78x98\)/);
  assert.match(item.customDescription, /Type d'ouverture : Rotation/);
  assert.equal(item.widthMm, 780);
  assert.equal(item.veluxRange, 'standard');
  assert.equal(item.customPrice, 0);
  assert.ok(item.leadNotes.includes('Prix HT à saisir'));
  // Taille inconnue : ligne libre à compléter, rien d'inventé.
  const [flou] = buildLeadCartItems(project([{ familleId: 'velux', quantity: 1, title: 'Fenêtre de toit', productId: 'velux-configurateur', velux: { opening: 'rotation', sizeCode: '?' }, notes: [] }]));
  assert.match(flou.productLabel, /à compléter/);
});

run('garage, veranda, reparation : lignes libres a 0, la designation sur le PDF, la phrase et les notes pour le bureau', () => {
  const items = buildLeadCartItems(
    project([
      { familleId: 'porte-garage', quantity: 1, title: 'Porte de garage, sectionnelle plafond, blanc, 240 × 200 cm', productId: 'custom-product', horsCatalogue: true, designation: 'Porte de garage · Sectionnelle plafond · Oui, avec télécommande · Rainuré', widthMm: 2400, heightMm: 2000, notes: ['Porte de garage : chiffrage sur devis, hors grille'] },
      { familleId: 'reparation', quantity: 1, title: 'Réparation, volet roulant, lames ou tablier', productId: 'piece-tabliers-lames', horsCatalogue: false, designation: 'Dépannage · Volet roulant · Lames ou tablier · lame cassée', notes: [] },
    ])
  );
  assert.equal(items[0].productId, 'custom-product');
  assert.equal(items[0].customDescription, 'Porte de garage · Sectionnelle plafond · Oui, avec télécommande · Rainuré');
  assert.equal(items[0].customHasDimensions, true);
  assert.equal(items[0].widthMm, 2400);
  assert.equal(items[0].unitPrice, 0);
  assert.equal(items[0].includePose, false);
  assert.ok(items[0].leadNotes.includes('Prix HT à saisir'));
  assert.equal(items[1].productId, 'custom-product');
  assert.ok(items[1].leadNotes.some((n) => /Pièce détachée/.test(n)));
  assert.equal(calculateItemPrice(items[0]).totalLine, 0);
});

run('la demande complete fait un devis brouillon valide pour l app, avec son titre et ses totaux', () => {
  const p = project([fenetre(), { familleId: 'volet-roulant', quantity: 1, title: 'Volet roulant, radio', productId: 'volet-radio', colorOptionId: 'blanc', widthMm: 1000, heightMm: 1400, notes: [], extraLines: ['volet-box-domotique'] }], 'Fourniture seule');
  assert.equal(leadIncludesPose(p), false);
  const cartItems = buildLeadCartItems(p);
  assert.equal(cartItems[0].includePose, false);
  const clientData = { nom: 'Martin', prenom: 'Marie', email: 'marie@exemple.fr', telephone: '0612345678', adresse: '4 rue des Pins', codePostal: '77550', ville: 'Moissy-Cramayel' };
  const record = buildQuoteDraftRecord({ title: buildLeadQuoteTitle(clientData), clientData: { ...clientData, savedClientId: 'client-1' }, cartItems, tvaRate: 10, currentStep: 2, status: 'draft' });
  assert.equal(record.title, 'Site · Marie Martin');
  assert.equal(record.status, 'draft');
  assert.equal(record.productCount, 3);
  assert.equal(record.clientId, 'client-1');
  assert.equal(record.payload.cartItems.length, 3);
  assert.equal(record.totalHT, computeQuoteTotals(cartItems, 10).totalHT);
  assert.ok(record.totalHT > 0);
  // Les notes du site survivent à la normalisation du devis.
  assert.deepEqual(record.payload.cartItems[0].leadNotes, []);
  assert.equal(record.payload.cartItems[0].leadTitle, 'Fenêtre, 2 vantaux, pvc, blanc, 120 × 125 cm');
  assert.equal(leadPhotoCount(project([fenetre({ photoCount: 2 }), fenetre({ photoCount: 1 })])), 3);
});

run('photos : identifiant du projet sur chaque ligne, rattachement par ligne ou toutes sur la premiere', () => {
  const lp = (n) => `lp_${String(n).repeat(32)}`;
  const items = buildLeadCartItems(
    project([
      fenetre({ photoCount: 2, photos: [{ uploadId: lp('a'), name: 'salon.jpg' }, { uploadId: 'pas-un-id' }] }),
      fenetre({ photoCount: 0 }),
      { familleId: 'volet-roulant', quantity: 1, title: 'Volet', productId: 'volet-radio', colorOptionId: 'blanc', widthMm: 1000, heightMm: 1400, notes: [], extraLines: ['volet-box-domotique'] },
    ]),
    { leadId: 'f60ad61c-1154-47a5-a887-fb4397f14ea4' }
  );
  assert.ok(items.every((item) => item.leadId === 'f60ad61c-1154-47a5-a887-fb4397f14ea4'));
  assert.deepEqual(items[0].leadPhotos, [lp('a')]);
  assert.ok(items[0].leadNotes.some((n) => /1 photo\(s\) non transmise/.test(n)));
  assert.deepEqual(items[1].leadPhotos, []);
  assert.deepEqual(items[3].leadPhotos, [], 'la box aussi porte le leadId et une liste vide');
  // Storage connait a, b et c : a reste sur sa ligne, b et c (orphelines) s'affichent sur la premiere ligne.
  const stored = [{ uploadId: lp('a') }, { uploadId: lp('b') }, { uploadId: lp('c') }];
  assert.deepEqual(attachLeadPhotos(items, stored), { known: 1, orphans: 2 });
  assert.equal(items[0].leadShowAllPhotos, true);
  assert.equal(items[1].leadShowAllPhotos, undefined);
  // Une photo annoncee par le site mais absente de Storage disparait de la ligne.
  const absent = buildLeadCartItems(project([fenetre({ photoCount: 1, photos: [{ uploadId: lp('d') }] })]), { leadId: 'abc12345' });
  assert.deepEqual(attachLeadPhotos(absent, []), { known: 0, orphans: 0 });
  assert.deepEqual(absent[0].leadPhotos, []);
  assert.equal(absent[0].leadShowAllPhotos, undefined);
  // Sans correspondance du tout, la premiere ligne montre tout et le dit.
  const none = buildLeadCartItems(project([fenetre({ photoCount: 2 })]), { leadId: 'abc12345' });
  attachLeadPhotos(none, stored);
  assert.equal(none[0].leadShowAllPhotos, true);
  assert.ok(none[0].leadNotes.some((n) => /3 photo\(s\) de la demande/.test(n)));
  // La ligne survit a la normalisation du devis avec ses champs photo.
  const record = buildQuoteDraftRecord({ title: 'x', clientData: { nom: 'a' }, cartItems: items, tvaRate: 10, currentStep: 2 });
  assert.equal(record.payload.cartItems[0].leadId, 'f60ad61c-1154-47a5-a887-fb4397f14ea4');
  assert.deepEqual(record.payload.cartItems[0].leadPhotos, [lp('a')]);
});

run('vantail principal, etat de couleur et empreinte stable', () => {
  assert.equal(principalSashIndex('Fenêtre 1V', 800, 1000), 0);
  assert.equal(principalSashIndex('Fenêtre 2V', 1200, 1250), 1);
  assert.equal(principalSashIndex('Fenêtre 2V+1F', 1800, 1250), 2);
  assert.equal(principalSashIndex('Porte Entrée RENO', 900, 2150), 0);
  assert.equal(colorStateFromLead('bicoloration', 'Blanc 9016 int / Chêne doré ext').bicoType, 'standard_chene');
  assert.equal(colorStateFromLead('coloration-2f', 'Noir 2100 sablé').customColor2fText, 'Noir 2100 sablé');
  assert.equal(colorStateFromLead('coloration-2f', 'autre : bleu canard').customColor2fText, 'bleu canard');
  assert.equal(colorStateFromLead('blanc', 'Blanc 9016').color2fType, 'standard_7016');
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

console.log('\nTous les tests lead-quote-import passent.');
