import assert from 'node:assert/strict';

import {
  DEFAULT_COMPTA_SETTINGS,
  addCalendarDays,
  buildSageCsv,
  buildSageExportFilename,
  buildSageExportModel,
  compressSageDesignation,
  encodeSageCsv,
  findDuplicateSageExport,
  flattenSageDesignation,
  formatSageDate,
  formatSageDecimal,
  formatSageNumber,
  getCp1252UnsupportedChars,
  hashSageContent,
  normalizeComptaSettings,
  normalizeForCp1252,
  parseSageDate,
  resolveSageArticle,
  resolveVatRegimeId,
  simplifySageDesignation,
  truncateSageDesignation,
} from '../lib/sage-export.mjs';

/* ─── Dépendances simulées (mêmes règles que le vrai moteur) ─────────────── */
const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateItemPrice = (item) => {
  if (item.productId === 'text-only') {
    return { unitPriceAfterDiscount: 0, posePrice: 0, totalLine: 0 };
  }
  if (item.productId === 'remise-commerciale') {
    const amount = roundCurrency(Math.abs(Number(item.customPrice) || 0));
    return { unitPriceAfterDiscount: -amount, posePrice: 0, totalLine: -amount };
  }
  const base = Number(item.unitPrice || 0);
  const afterDiscount = item.remise > 0 ? base * (1 - item.remise / 100) : base;
  const unit = roundCurrency(afterDiscount + (Number(item.commissionUnitHT) || 0));
  return {
    unitPriceAfterDiscount: unit,
    posePrice: Number(item.posePrice || 0),
    totalLine: roundCurrency(unit * (item.quantity || 1)),
  };
};

const getItemTvaRate = (item, defaultRate) => {
  const rate = Number(item?.tvaRate ?? defaultRate);
  return [0, 5.5, 10, 20].includes(rate) ? rate : 10;
};

const computeQuoteTotals = (items, defaultRate) => {
  let totalHT = 0;
  const buckets = new Map();
  const addToBucket = (rate, amount) => {
    buckets.set(rate, roundCurrency((buckets.get(rate) || 0) + amount));
  };

  (items || []).forEach((item) => {
    const calc = calculateItemPrice(item);
    const rate = getItemTvaRate(item, defaultRate);
    totalHT += calc.totalLine;
    if (calc.totalLine !== 0) addToBucket(rate, calc.totalLine);
    if (item.includePose) {
      const poseLine = roundCurrency(calc.posePrice * (item.quantity || 0));
      totalHT += poseLine;
      if (poseLine > 0) addToBucket(rate, poseLine);
    }
  });

  const tva = roundCurrency(
    Array.from(buckets.entries()).reduce(
      (sum, [rate, ht]) => sum + roundCurrency(ht * (rate / 100)),
      0
    )
  );
  const totalHTRounded = roundCurrency(totalHT);
  return { totalHT: totalHTRounded, tva, totalTTC: roundCurrency(totalHTRounded + tva) };
};

const deps = {
  applyCommissionToCartItems: (items) => items,
  calculateItemPrice,
  getItemPricingSummary: () => ({}),
  computeQuoteTotals,
  getItemTvaRate,
  generateDesignation: (item) => item.designationText || item.productLabel || null,
  getPoseLabel: (item) => item.poseLabel || `Pose ${item.productLabel || ''}`.trim(),
};

const buildModel = (overrides = {}, extraDeps = {}) =>
  buildSageExportModel(
    {
      quoteId: 'q1',
      quoteNumber: 'DV-262021715',
      referenceDevis: 'Chantier Dupont',
      clientName: 'Jean Dupont',
      issueDate: new Date(2026, 6, 21),
      exportDate: new Date(2026, 6, 22),
      tvaRate: 10,
      settings: {},
      ...overrides,
    },
    { ...deps, ...extraDeps }
  );

/* ─── Paramètres : normalisation et valeurs par défaut ────────────────────── */
{
  const settings = normalizeComptaSettings({});
  assert.equal(settings.placeholderClientCode, 'ZZZIMPORT', 'client provisoire par défaut');
  assert.equal(settings.pieceType, 'COMMANDE', 'type de pièce par défaut');
  assert.equal(settings.vatArticles['tva-5.5'], 'IMP055');
  assert.equal(settings.vatArticles['tva-10'], 'IMP100');
  assert.equal(settings.vatArticles['tva-20'], 'IMP200');
  assert.equal(settings.vatArticles.autoliquidation, 'IMPAUTO');
  assert.equal(settings.zeroRateRegime, 'autoliquidation', 'taux 0 = autoliquidation par défaut');
  assert.equal(settings.duplicateBehavior, 'block');
}

{
  const settings = normalizeComptaSettings({
    placeholderClientCode: '  ZZDIVERS  ',
    columnSeparator: '|',
    decimalSeparator: ';',
    encoding: 'latin-9',
    maxDesignationLength: 5,
    natureArticles: { pose: { 'tva-10': ' POSE100 ' }, livraison: {} },
  });
  assert.equal(settings.placeholderClientCode, 'ZZDIVERS', 'code client trimé');
  assert.equal(settings.columnSeparator, ';', 'séparateur invalide → défaut');
  assert.equal(settings.decimalSeparator, ',', 'décimal invalide → défaut');
  assert.equal(settings.encoding, 'windows-1252', 'encodage invalide → défaut');
  assert.equal(settings.maxDesignationLength, 5, 'limite positive volontaire appliquée telle quelle');
  assert.equal(settings.natureArticles.pose['tva-10'], 'POSE100', 'surcharge pose conservée');
  assert.equal(settings.natureArticles.livraison, undefined, 'surcharge vide ignorée');
}

{
  // Longueur max. des désignations : 250 par défaut (limite constatée du champ
  // Sage 50) ; 0 / vide / négatif = choix explicite d'illimité.
  assert.equal(normalizeComptaSettings({}).maxDesignationLength, 250, 'défaut : limite Sage 250');
  assert.equal(normalizeComptaSettings({ maxDesignationLength: 'abc' }).maxDesignationLength, 250, 'invalide → défaut');
  assert.equal(normalizeComptaSettings({ maxDesignationLength: 0 }).maxDesignationLength, 0, '0 explicite = illimité');
  assert.equal(normalizeComptaSettings({ maxDesignationLength: '' }).maxDesignationLength, 0, 'vide = illimité');
  assert.equal(normalizeComptaSettings({ maxDesignationLength: -3 }).maxDesignationLength, 0);
  assert.equal(normalizeComptaSettings({ maxDesignationLength: 120 }).maxDesignationLength, 120);
}

/* ─── Régimes de TVA ──────────────────────────────────────────────────────── */
{
  const settings = normalizeComptaSettings({});
  assert.equal(resolveVatRegimeId(5.5, settings), 'tva-5.5');
  assert.equal(resolveVatRegimeId(10, settings), 'tva-10');
  assert.equal(resolveVatRegimeId(20, settings), 'tva-20');
  assert.equal(resolveVatRegimeId(0, settings), 'autoliquidation', '0 → autoliquidation');
  assert.equal(resolveVatRegimeId(7, settings), null, 'taux inconnu → null');

  const exoSettings = normalizeComptaSettings({ zeroRateRegime: 'exoneration' });
  assert.equal(
    resolveVatRegimeId(0, exoSettings),
    'exoneration',
    '0 → exonération quand configuré (jamais confondu avec l’autoliquidation)'
  );
}

{
  const settings = normalizeComptaSettings({
    natureArticles: { pose: { 'tva-10': 'POSE100' } },
  });
  assert.equal(resolveSageArticle('tva-10', 'fourniture', settings), 'IMP100', 'repli commun');
  assert.equal(resolveSageArticle('tva-10', 'pose', settings), 'POSE100', 'surcharge par nature');
  assert.equal(resolveSageArticle('exoneration', 'fourniture', settings), '', 'exo sans article');
  assert.equal(resolveSageArticle(null, 'fourniture', settings), '', 'régime null → vide');
}

/* ─── Modèle : un devis multi-taux complet ────────────────────────────────── */
{
  const model = buildModel({
    cartItems: [
      // TVA 5,5 % — quantité > 1, prix à décimales
      { id: 'a', productLabel: 'Fenêtre PVC', unitPrice: 910.14, quantity: 2, tvaRate: 5.5 },
      // TVA 10 % (défaut devis) — avec pose
      {
        id: 'b',
        productLabel: 'Porte-fenêtre',
        unitPrice: 500,
        quantity: 1,
        includePose: true,
        posePrice: 250,
      },
      // TVA 20 %
      { id: 'c', productLabel: 'Volet roulant', unitPrice: 300, quantity: 1, tvaRate: 20 },
      // Autoliquidation (taux 0 de l'application)
      { id: 'd', productLabel: 'Châssis fixe', unitPrice: 100, quantity: 1, tvaRate: 0 },
      // Ligne gratuite / offerte
      { id: 'e', productLabel: 'Moustiquaire offerte', unitPrice: 0, quantity: 1 },
    ],
  });

  assert.equal(model.isValid, true, 'devis multi-taux valide');
  assert.equal(model.lines.length, 6, '5 articles + 1 ligne de pose');

  const [fenetre, porteFenetre, pose, volet, chassis, offert] = model.lines;
  assert.equal(fenetre.sageArticle, 'IMP055', 'TVA 5,5 → IMP055');
  assert.equal(fenetre.lineHT, 1820.28, 'quantité 2 × 910,14');
  assert.equal(porteFenetre.sageArticle, 'IMP100', 'TVA 10 → IMP100');
  assert.equal(pose.nature, 'pose', 'sous-ligne de pose séparée');
  assert.equal(pose.designation, 'Pose Porte-fenêtre', 'libellé de pose');
  assert.equal(pose.lineHT, 250, 'pose 250 × 1');
  assert.equal(pose.sageArticle, 'IMP100', 'pose au taux de la fourniture');
  assert.equal(volet.sageArticle, 'IMP200', 'TVA 20 → IMP200');
  assert.equal(chassis.sageArticle, 'IMPAUTO', 'autoliquidation → IMPAUTO');
  assert.equal(chassis.regimeId, 'autoliquidation');
  assert.equal(offert.lineHT, 0, 'ligne gratuite exportable');

  // Ventilation et totaux : mêmes montants que le moteur du devis.
  const expected = computeQuoteTotals(
    [
      { unitPrice: 910.14, quantity: 2, tvaRate: 5.5 },
      { unitPrice: 500, quantity: 1, includePose: true, posePrice: 250 },
      { unitPrice: 300, quantity: 1, tvaRate: 20 },
      { unitPrice: 100, quantity: 1, tvaRate: 0 },
      { unitPrice: 0, quantity: 1 },
    ],
    10
  );
  assert.equal(model.totals.exportedHT, expected.totalHT, 'HT exporté = HT devis');
  assert.equal(model.totals.totalTTC, expected.totalTTC, 'TTC identique');
  assert.equal(model.vatBreakdown.length, 4, '4 régimes actifs');
  const bucket55 = model.vatBreakdown.find((b) => b.regimeId === 'tva-5.5');
  assert.equal(bucket55.totalHT, 1820.28);
  assert.equal(bucket55.tva, roundCurrency(1820.28 * 0.055));
}

/* ─── Remise transformée en prix unitaire net ─────────────────────────────── */
{
  const model = buildModel({
    cartItems: [
      {
        id: 'a',
        productLabel: 'Fenêtre PVC sur mesure',
        unitPrice: 910.14,
        remise: 20,
        quantity: 2,
        designationText: 'Fenêtre PVC sur mesure\nRemise : -20%\nAvant remise 910,14 €',
      },
    ],
  });

  const [line] = model.lines;
  assert.equal(line.unitPriceHT, 728.11, 'PU net après remise 20 % sur 910,14');
  assert.equal(line.lineHT, 1456.22, 'montant = PU net × quantité');
  assert.ok(!line.designation.includes('Remise'), 'mentions de remise retirées de la désignation');
  assert.equal(model.isValid, true);
}

/* ─── Ligne remise commerciale négative ───────────────────────────────────── */
{
  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'Fenêtre', unitPrice: 1000, quantity: 1 },
      {
        id: 'r',
        productId: 'remise-commerciale',
        productLabel: 'Remise exceptionnelle',
        customPrice: 150,
        quantity: 4, // ignorée : une remise est toujours quantité 1
      },
    ],
  });

  const remise = model.lines[1];
  assert.equal(remise.nature, 'remise');
  assert.equal(remise.quantity, 1, 'remise toujours en quantité 1');
  assert.equal(remise.unitPriceHT, -150, 'montant négatif');
  assert.equal(model.totals.exportedHT, 850, 'total net de la remise');
  assert.equal(model.isValid, true, 'ligne négative acceptée');
}

/* ─── Lignes texte : incluses ou exclues selon les paramètres ─────────────── */
{
  const cartItems = [
    { id: 'a', productLabel: 'Fenêtre', unitPrice: 100, quantity: 1 },
    {
      id: 't',
      productId: 'text-only',
      customDescription: 'Dépose et évacuation des anciennes menuiseries incluses',
    },
  ];

  const withText = buildModel({ cartItems });
  assert.equal(withText.lines.length, 2, 'ligne texte incluse par défaut');
  assert.equal(withText.lines[1].lineHT, 0);
  assert.equal(withText.lines[1].quantity, 1);

  const withoutText = buildModel({ cartItems, settings: { includeTextOnlyLines: false } });
  assert.equal(withoutText.lines.length, 1, 'ligne texte exclue sur demande');
  assert.equal(withoutText.isValid, true);
}

/* ─── Natures de ligne dérivées du produit ────────────────────────────────── */
{
  const model = buildModel({
    cartItems: [
      { id: 'a', productId: 'gestion-dechets', productLabel: 'Gestion des déchets', unitPrice: 80 },
      { id: 'b', productId: 'forfait-deplacement', productLabel: 'Forfait déplacement', unitPrice: 60 },
      { id: 'c', productId: 'metrage-technique-validation', productLabel: 'Métrage technique', unitPrice: 0 },
    ],
  });
  assert.deepEqual(
    model.lines.map((line) => line.nature),
    ['recyclage', 'livraison', 'metrage'],
    'natures dérivées des produits services'
  );
}

/* ─── Erreurs de validation ───────────────────────────────────────────────── */
{
  const model = buildModel({ cartItems: [] });
  assert.equal(model.isValid, false, 'devis vide invalide');
  assert.ok(model.errors.some((issue) => issue.code === 'no-lines'));
}

{
  // Désignation absente
  const model = buildModel({
    cartItems: [{ id: 'a', unitPrice: 100, quantity: 1 }],
  });
  assert.ok(
    model.errors.some((issue) => issue.code === 'missing-designation'),
    'désignation manquante détectée'
  );
}

{
  // Quantité invalide
  const model = buildModel({
    cartItems: [{ id: 'a', productLabel: 'Fenêtre', unitPrice: 100, quantity: -2 }],
  });
  assert.ok(model.errors.some((issue) => issue.code === 'invalid-quantity'));
}

{
  // Code article Sage manquant pour un régime utilisé
  const model = buildModel({
    cartItems: [{ id: 'a', productLabel: 'Volet', unitPrice: 100, quantity: 1, tvaRate: 20 }],
    settings: { vatArticles: { 'tva-20': '' } },
  });
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((issue) => issue.code === 'missing-article'));
}

{
  // Taux non reconnu (dépendance renvoyant le taux brut)
  const model = buildModel(
    {
      cartItems: [{ id: 'a', productLabel: 'Fenêtre', unitPrice: 100, quantity: 1, tvaRate: 7 }],
    },
    { getItemTvaRate: (item, def) => Number(item?.tvaRate ?? def) }
  );
  assert.ok(model.errors.some((issue) => issue.code === 'unknown-vat'));
}

{
  // Total incohérent entre les lignes et le moteur du devis
  const model = buildModel(
    {
      cartItems: [{ id: 'a', productLabel: 'Fenêtre', unitPrice: 100, quantity: 1 }],
    },
    { computeQuoteTotals: () => ({ totalHT: 999, tva: 0, totalTTC: 999 }) }
  );
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((issue) => issue.code === 'totals-mismatch'));
}

{
  // Identifiant externe : repli sur l'id du devis, erreur si rien
  const withFallback = buildModel({ quoteNumber: '', cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }] });
  assert.equal(withFallback.document.externalId, 'Q-q1', 'repli Q-{quoteId}');

  const withoutAnything = buildModel({
    quoteId: null,
    quoteNumber: '',
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }],
  });
  assert.ok(withoutAnything.errors.some((issue) => issue.code === 'external-id-missing'));
}

/* ─── Désignation simplifiée ──────────────────────────────────────────────── */
{
  const long = [
    'Fenêtre PVC 2 vantaux 1200x1350 mm',
    'Profile 70 mm PVC Schuco - 5 chambres - renforts acier - double joint',
    'Remise : -20%',
    'Avant remise 910,14 €',
    'Finition : Gris anthracite',
  ].join('\n');

  const simplified = simplifySageDesignation(long, 90);
  assert.ok(!simplified.includes('Remise'), 'lignes de remise exclues');
  assert.ok(!simplified.includes('\n'), 'mono-ligne');
  assert.ok(simplified.length <= 90, 'longueur bornée');
  assert.ok(simplified.startsWith('Fenêtre PVC 2 vantaux 1200x1350 mm'), 'contenu conservé');
  assert.ok(simplified.endsWith('…'), 'troncature signalée');

  assert.equal(simplifySageDesignation('  Pose  fenêtre  ', 50), 'Pose fenêtre', 'espaces normalisés');
}

/* ─── Compression intelligente : le cas réel Sage (limite 250 par défaut) ─── */
{
  // Désignation réelle de 303 caractères aplatis : Sage la tronquait en plein
  // mot à 250 (« …(mi-hauteu ») en perdant grille de ventilation et Uw/Sw.
  const realText = [
    'Fenêtre PVC 2 Vantaux – OB 1790 x 1010 L*H mm',
    'Profilé 70 mm PVC Schüco – 5 chambres – renforts acier – double joint',
    'Finition : Blanc',
    'Double vitrage isolant faible émissif phonique 10/14/4 ITR Argon WE (28 mm)',
    'Poignée Schüco Euro – à 600 mm (mi-hauteur)',
    'Grille de ventilation',
    'Uw = 1.24 W/m²K – Sw = 0.4',
  ].join('\n');

  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 910.14, quantity: 1, designationText: realText },
    ],
  });
  const [line] = model.lines;

  assert.ok(line.designationFull.length > 250, 'désignation complète au-delà de la limite Sage');
  assert.ok(line.designation.length <= 250, 'la valeur CSV tient dans la limite Sage de 250');
  assert.ok(!line.designation.endsWith('…'), 'aucune troncature : la compression a suffi');

  // Les infos utiles à la facture sont TOUTES conservées, jusqu'au bout.
  [
    'Fenêtre PVC 2 Vantaux – OB 1790 x 1010 L*H mm',
    'Profilé 70 mm PVC Schüco',
    'Finition : Blanc',
    'Double vitrage isolant faible émissif phonique 10/14/4 ITR Argon WE (28 mm)',
    'Poignée Schüco Euro',
    'Grille de ventilation',
    'Uw = 1.24 W/m²K – Sw = 0.4',
  ].forEach((fragment) => {
    assert.ok(line.designation.includes(fragment), `info facture conservée : ${fragment}`);
  });
  assert.ok(line.designation.endsWith('Uw = 1.24 W/m²K – Sw = 0.4'), 'les performances ferment la désignation');

  // Seuls les détails sans valeur facture ont été retirés.
  assert.ok(!line.designation.includes('à 600 mm'), 'hauteur de poignée retirée');
  assert.ok(!line.designation.includes('mi-hauteur'), 'précision (mi-hauteur) retirée');
  assert.ok(!line.designation.includes('5 chambres'), 'marketing profilé retiré');
  assert.ok(!line.designation.includes('renforts acier'), 'marketing profilé retiré');
  assert.ok(!line.designation.includes('double joint'), 'marketing profilé retiré');

  // La complète reste intacte dans le modèle/l'historique, et le CSV reçoit
  // exactement la version compressée.
  assert.ok(line.designationFull.includes('à 600 mm (mi-hauteur)'));
  assert.ok(buildSageCsv(model).includes(line.designation));

  // Avertissement « compacté » visible, pas d'avertissement de troncature.
  assert.ok(
    model.warnings.some((issue) => issue.code === 'designation-compressed'),
    'compression signalée'
  );
  assert.equal(
    model.warnings.find((issue) => issue.code === 'designation-truncated'),
    undefined,
    'pas de troncature signalée'
  );

  // Une désignation qui tient dans la limite reste INTACTE (hauteur de
  // poignée comprise : on ne retire que si nécessaire).
  const shortText = 'Fenêtre PVC 1 vantail 600 x 800 mm\nPoignée Schüco Euro – à 400 mm (mi-hauteur)';
  const untouched = buildModel({
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: shortText }],
  });
  assert.ok(untouched.lines[0].designation.includes('à 400 mm (mi-hauteur)'), 'rien retiré quand ça tient');

  // Fonction pure : neutre sous la limite, compression sans ellipse au-delà.
  assert.equal(compressSageDesignation('Pose fenêtre', 250), 'Pose fenêtre');
  const compressed = compressSageDesignation(line.designationFull, 250);
  assert.equal(compressed, line.designation, 'même résultat via la fonction exportée');
}

/* ─── Formats ─────────────────────────────────────────────────────────────── */
{
  const date = new Date(2026, 6, 21);
  assert.equal(formatSageDate(date, 'DD/MM/YYYY'), '21/07/2026');
  assert.equal(formatSageDate(date, 'YYYYMMDD'), '20260721');
  assert.equal(formatSageDate(date, 'DD-MM-YY'), '21-07-26');
  assert.equal(formatSageDate('2026-07-21T10:00:00.000Z', 'DD/MM/YYYY'), '21/07/2026');

  assert.equal(formatSageDecimal(728.11, ','), '728,11');
  assert.equal(formatSageDecimal(728.1, '.'), '728.10');
  assert.equal(formatSageDecimal(-150, ','), '-150,00');
  assert.equal(formatSageNumber(2, ','), '2', 'quantité entière sans décimales');
  assert.equal(formatSageNumber(5.5, ','), '5,5', 'taux 5,5 avec virgule');
}

/* ─── Rendu CSV ───────────────────────────────────────────────────────────── */
{
  const model = buildModel({
    cartItems: [
      {
        id: 'a',
        productLabel: 'Fenêtre PVC sur mesure',
        unitPrice: 910.14,
        remise: 20,
        quantity: 2,
        designationText: 'Fenêtre PVC sur mesure; oscillo-battante "confort"',
      },
    ],
  });

  const csv = buildSageCsv(model);
  const rows = csv.split('\r\n');
  assert.equal(rows.at(-1), '', 'fichier terminé par CRLF');
  assert.equal(
    rows[0],
    'Type;TypePiece;Date;Client;Reference;RefChantier;Article;Designation;Quantite;PrixUnitaireHT;MontantHT;TauxTVA;DateLivraisonLigne',
    'ligne d’en-tête par défaut (13 colonnes, DateLivraisonLigne en fin)'
  );
  assert.equal(
    rows[1],
    'E;COMMANDE;21/07/2026;ZZZIMPORT;DV-262021715;Chantier Dupont;;;;;;;',
    'ligne E : pièce, date du devis, client provisoire, références — DateLivraisonLigne VIDE'
  );
  assert.equal(
    rows[2],
    'L;;;;;;IMP100;"Fenêtre PVC sur mesure; oscillo-battante ""confort""";2;728,11;1456,22;10;04/08/2026',
    'ligne L : désignation échappée, PU net, montant, taux, date de livraison ligne'
  );

  // Sans en-tête + séparateur virgule + décimal point
  const altCsv = buildSageCsv(model, {
    includeHeaderRow: false,
    columnSeparator: ',',
    decimalSeparator: '.',
  });
  const altRows = altCsv.split('\r\n');
  assert.ok(altRows[0].startsWith('E,COMMANDE'), 'pas d’en-tête, séparateur virgule');
  assert.ok(altRows[1].includes('728.11'), 'décimal point');
}

/* ─── Dates de livraison ──────────────────────────────────────────────────── */
{
  // Ajout de jours calendaires : cas de référence du cahier des charges.
  assert.equal(
    formatSageDate(addCalendarDays(new Date(2026, 6, 22), 14), 'DD/MM/YYYY'),
    '05/08/2026',
    '22/07/2026 + 14 jours = 05/08/2026'
  );
  // Passage de fin de mois.
  assert.equal(
    formatSageDate(addCalendarDays(new Date(2026, 0, 25), 14), 'DD/MM/YYYY'),
    '08/02/2026',
    'passage janvier → février'
  );
  // Passage de fin d'année.
  assert.equal(
    formatSageDate(addCalendarDays(new Date(2026, 11, 24), 14), 'DD/MM/YYYY'),
    '07/01/2027',
    'passage décembre → janvier (année suivante)'
  );
  // Année bissextile (2028) vs non bissextile (2027).
  assert.equal(
    formatSageDate(addCalendarDays(new Date(2028, 1, 20), 14), 'DD/MM/YYYY'),
    '05/03/2028',
    'février bissextile : 29 jours pris en compte'
  );
  assert.equal(
    formatSageDate(addCalendarDays(new Date(2027, 1, 20), 14), 'DD/MM/YYYY'),
    '06/03/2027',
    'février non bissextile : 28 jours'
  );
}

{
  // Normalisation du délai configurable.
  assert.equal(normalizeComptaSettings({}).deliveryDelayDays, 14, '14 jours par défaut');
  assert.equal(normalizeComptaSettings({ deliveryDelayDays: 30 }).deliveryDelayDays, 30);
  assert.equal(normalizeComptaSettings({ deliveryDelayDays: 0 }).deliveryDelayDays, 0, 'zéro accepté');
  assert.equal(normalizeComptaSettings({ deliveryDelayDays: -5 }).deliveryDelayDays, 14, 'négatif → défaut');
  assert.equal(normalizeComptaSettings({ deliveryDelayDays: 'abc' }).deliveryDelayDays, 14, 'invalide → défaut');
}

{
  // Pièce du 22/07/2026 : la date 05/08/2026 est EXACTEMENT sur chaque ligne L
  // (pose, métrage offert, recyclage, ligne gratuite, remise comprises) et la
  // cellule DateLivraisonLigne de la ligne E est VIDE.
  const model = buildModel({
    issueDate: new Date(2026, 6, 22),
    cartItems: [
      { id: 'a', productLabel: 'Fenêtre', unitPrice: 500, quantity: 1, includePose: true, posePrice: 250 },
      { id: 'b', productId: 'metrage-technique-validation', productLabel: 'Métrage offert', unitPrice: 0 },
      { id: 'c', productId: 'gestion-dechets', productLabel: 'Recyclage', unitPrice: 80 },
      { id: 'd', productLabel: 'Moustiquaire offerte', unitPrice: 0, quantity: 1 },
      { id: 'r', productId: 'remise-commerciale', productLabel: 'Remise', customPrice: 50 },
    ],
  });

  assert.equal(model.document.deliveryDateLabel, '05/08/2026', 'date visible dans le modèle (prévisualisation)');
  assert.equal(model.document.deliveryDelayDays, 14);

  const rows = buildSageCsv(model).split('\r\n').filter(Boolean);
  const eRows = rows.filter((row) => row.startsWith('E;'));
  const lRows = rows.filter((row) => row.startsWith('L;'));
  assert.equal(eRows.length, 1);
  assert.equal(lRows.length, 6, '5 articles + 1 pose');

  const eFields = eRows[0].split(';');
  assert.equal(eFields.length, 13, 'layout à 13 colonnes');
  assert.equal(eFields[12], '', 'ligne E : DateLivraisonLigne vide');

  lRows.forEach((row) => {
    const fields = row.split(';');
    assert.equal(fields.length, 13, 'layout à 13 colonnes');
    assert.equal(fields[12], '05/08/2026', 'ligne L : DateLivraisonLigne = exactement 05/08/2026');
    assert.match(
      fields[12],
      /^\d{2}\/\d{2}\/\d{4}$/,
      'chaîne stricte JJ/MM/AAAA (jamais ISO, heure, Date sérialisée, null ou Invalid Date)'
    );
  });

  // Le format strict JJ/MM/AAAA est verrouillé, même si le format de date
  // configurable de la pièce est différent.
  const isoFormatted = buildModel({
    issueDate: new Date(2026, 6, 22),
    settings: { dateFormat: 'YYYY-MM-DD' },
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }],
  });
  const isoRows = buildSageCsv(isoFormatted).split('\r\n').filter(Boolean);
  assert.ok(isoRows[1].includes(';2026-07-22;'), 'date de pièce au format configuré');
  assert.equal(
    isoRows[2].split(';')[12],
    '05/08/2026',
    'DateLivraisonLigne reste en JJ/MM/AAAA strict'
  );

  // Délai personnalisé : 30 jours.
  const custom = buildModel({
    issueDate: new Date(2026, 6, 22),
    settings: { deliveryDelayDays: 30 },
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }],
  });
  assert.equal(custom.document.deliveryDateLabel, '21/08/2026', '22/07/2026 + 30 jours');
  assert.equal(
    buildSageCsv(custom).split('\r\n').filter(Boolean)[2].split(';')[12],
    '21/08/2026',
    'délai personnalisé répercuté dans le CSV'
  );
}

/* ─── Date de pièce absente/invalide : export BLOQUÉ, aucun CSV ───────────── */
{
  const validLine = [{ id: 'a', productLabel: 'Fenêtre', unitPrice: 100, quantity: 1 }];

  [
    { label: 'date absente', issueDate: null },
    { label: 'Invalid Date', issueDate: new Date('n’importe quoi') },
    { label: 'chaîne illisible', issueDate: 'pas-une-date' },
  ].forEach(({ label, issueDate }) => {
    const model = buildModel({ issueDate, exportDate: null, cartItems: validLine });

    assert.equal(model.isValid, false, `${label} → export bloqué`);
    assert.ok(
      model.errors.some(
        (issue) =>
          issue.code === 'invalid-piece-date' &&
          issue.message === 'Date de pièce absente ou invalide.'
      ),
      `${label} → erreur bloquante « Date de pièce absente ou invalide »`
    );
    assert.equal(model.document.date, null, `${label} → pas de date de pièce`);
    assert.equal(model.document.dateLabel, '', `${label} → pas de libellé de date`);
    assert.equal(
      model.document.deliveryDateLabel,
      '',
      `${label} → aucune date de livraison calculée sans date de pièce valide`
    );
    assert.throws(
      () => buildSageCsv(model),
      /Date de pièce absente ou invalide/,
      `${label} → aucun CSV produit`
    );
  });

  // Jamais de repli silencieux sur la date du jour.
  assert.equal(parseSageDate(undefined), null);
  assert.equal(parseSageDate('pas-une-date'), null);
  assert.equal(parseSageDate(new Date('invalide')), null);
  assert.equal(addCalendarDays(null, 14), null, 'pas de livraison depuis une date nulle');
  assert.equal(formatSageDate(null, 'DD/MM/YYYY'), '', 'date absente → chaîne vide');
  assert.equal(formatSageDate('pas-une-date', 'DD/MM/YYYY'), '', 'date illisible → chaîne vide');
}

/* ─── Nom de fichier ──────────────────────────────────────────────────────── */
{
  const model = buildModel({
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }],
  });
  assert.equal(
    buildSageExportFilename(model, 1),
    'SAGE_DV-262021715_v1.csv',
    'pattern par défaut {prefix}{numero}_v{version}'
  );

  const custom = buildModel({
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 1, quantity: 1 }],
    settings: { filePrefix: 'CPT-', fileNamePattern: '{prefix}{numero}_{date}_v{version}' },
  });
  assert.equal(
    buildSageExportFilename(custom, 3),
    'CPT-DV-262021715_20260721_v3.csv',
    'tokens {date} et {version}'
  );
}

/* ─── Anti-doublon : empreinte + recherche d'export actif identique ───────── */
{
  const contentA = 'E;COMMANDE;...';
  const contentB = 'E;FACTURE;...';
  const hashA = hashSageContent(contentA);
  assert.equal(hashA, hashSageContent(contentA), 'empreinte stable');
  assert.notEqual(hashA, hashSageContent(contentB), 'empreintes distinctes');

  const exportsList = [
    { id: 'e1', contentHash: hashA, status: 'cancelled' },
    { id: 'e2', contentHash: hashA, status: 'replaced' },
    { id: 'e3', contentHash: hashA, status: 'generated' },
  ];
  assert.equal(
    findDuplicateSageExport(exportsList, hashA)?.id,
    'e3',
    'seul un export ACTIF identique bloque un double clic'
  );
  assert.equal(findDuplicateSageExport(exportsList, hashSageContent(contentB)), null);
  assert.equal(
    findDuplicateSageExport(
      [{ id: 'e4', contentHash: hashA, status: 'imported' }],
      hashA
    )?.id,
    'e4',
    'un export déjà importé bloque aussi'
  );
}

/* ─── Encodage ────────────────────────────────────────────────────────────── */
{
  const bytes = encodeSageCsv('é€œA✓', 'windows-1252');
  assert.deepEqual(
    Array.from(bytes),
    [0xe9, 0x80, 0x9c, 0x41, 0x3f],
    'CP1252 : é/€/œ mappés, caractère hors table → « ? »'
  );

  const utf8Bom = encodeSageCsv('A', 'utf8-bom');
  assert.deepEqual(Array.from(utf8Bom.slice(0, 3)), [0xef, 0xbb, 0xbf], 'BOM UTF-8');
  assert.equal(utf8Bom[3], 0x41);

  const utf8 = encodeSageCsv('é', 'utf8');
  assert.deepEqual(Array.from(utf8), [0xc3, 0xa9], 'UTF-8 sans BOM');
}

/* ─── Échappement CSV : séparateur, guillemets, retours à la ligne ────────── */
{
  // Point-virgule (séparateur actif) dans la désignation → champ entre guillemets.
  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: 'Fenêtre; 2 vantaux' },
    ],
  });
  const rows = buildSageCsv(model).split('\r\n');
  assert.equal(rows.length, 4, 'en-tête + E + L + CRLF final : un enregistrement par ligne');
  assert.ok(rows[2].includes('"Fenêtre; 2 vantaux"'), 'champ contenant le séparateur entre guillemets');
}

{
  // Guillemets dans la désignation → doublés à l'intérieur d'un champ quoté.
  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: 'Vitrage "clair" 4/16/4' },
    ],
  });
  const rows = buildSageCsv(model).split('\r\n');
  assert.ok(rows[2].includes('"Vitrage ""clair"" 4/16/4"'), 'guillemets internes doublés');
}

{
  // Retour à la ligne dans une désignation source : aplati AVANT le CSV —
  // l'enregistrement L tient toujours sur une seule ligne physique.
  const model = buildModel({
    cartItems: [
      {
        id: 'a',
        productLabel: 'F',
        unitPrice: 100,
        quantity: 1,
        designationText: 'Fenêtre PVC\n2 vantaux\nGris anthracite',
      },
    ],
    referenceDevis: 'Chantier\nDupont',
  });
  assert.ok(!model.lines[0].designation.includes('\n'), 'désignation CSV sans retour à la ligne');
  assert.equal(model.document.referenceDevis, 'Chantier Dupont', 'référence chantier aplatie');
  const rows = buildSageCsv(model).split('\r\n');
  assert.equal(rows.length, 4, 'aucun enregistrement cassé par un retour à la ligne');
  assert.ok(
    rows[2].includes('Fenêtre PVC 2 vantaux Gris anthracite'),
    'retours à la ligne remplacés par des espaces simples'
  );
}

{
  // Le séparateur configuré est bien celui qui déclenche le quoting.
  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: 'Dormant 60, ouvrant 70' },
    ],
  });
  const csvSemicolon = buildSageCsv(model); // séparateur ';' : la virgule ne force pas les guillemets
  assert.ok(csvSemicolon.includes(';Dormant 60, ouvrant 70;'), 'virgule non quotée avec séparateur ;');
  const csvComma = buildSageCsv(model, { columnSeparator: ',', decimalSeparator: '.' });
  assert.ok(csvComma.includes(',"Dormant 60, ouvrant 70",'), 'virgule quotée avec séparateur ,');
}

/* ─── Limite 0 explicite : désignation intégrale, aucune troncature ───────── */
{
  const longText = Array.from({ length: 12 }, (_, i) => `Caractéristique numéro ${i + 1} du produit`).join('\n');
  const model = buildModel({
    settings: { maxDesignationLength: 0 },
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: longText },
    ],
  });

  const [line] = model.lines;
  assert.ok(line.designationFull.length > 120, 'la désignation dépasse largement 120 caractères');
  assert.equal(
    line.designation,
    line.designationFull,
    'limite 0 : la valeur CSV EST la désignation complète'
  );
  const csv = buildSageCsv(model);
  assert.ok(csv.includes(line.designationFull), 'le CSV contient la désignation intégrale');
  assert.ok(!csv.includes('…'), 'aucune ellipse ajoutée automatiquement');
  assert.ok(!line.designation.includes('\n'), 'mono-ligne : retours à la ligne → espaces');
  assert.ok(
    line.designation.includes('Caractéristique numéro 1 du produit Caractéristique numéro 2'),
    'retours à la ligne remplacés par des espaces simples, contenu intégral'
  );

  // truncateSageDesignation : neutre sans limite ou sous la limite.
  assert.equal(truncateSageDesignation('Pose fenêtre', 0), 'Pose fenêtre', '0 = aucune troncature');
  assert.equal(truncateSageDesignation('Pose fenêtre'), 'Pose fenêtre', 'défaut = aucune troncature');
  assert.equal(truncateSageDesignation('Pose fenêtre', 120), 'Pose fenêtre');
}

/* ─── Limite manuelle volontaire : appliquée + avertissement visible ──────── */
{
  const longText = Array.from({ length: 12 }, (_, i) => `Caractéristique numéro ${i + 1} du produit`).join('\n');
  const model = buildModel({
    settings: { maxDesignationLength: 120 },
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: longText },
      { id: 'b', productLabel: 'Courte', unitPrice: 50, quantity: 1 },
    ],
  });

  const [long, short] = model.lines;
  assert.ok(long.designation.length <= 120, 'limite volontaire appliquée à la valeur CSV');
  assert.ok(long.designation.endsWith('…'), 'troncature volontaire signalée');
  assert.equal(long.designationFull, flattenSageDesignation(longText), 'la complète reste dans le modèle/historique');
  assert.equal(short.designation, short.designationFull, 'ligne courte non touchée');
  assert.ok(buildSageCsv(model).includes(long.designation), 'le CSV utilise la valeur limitée');

  const warning = model.warnings.find((issue) => issue.code === 'designation-truncated');
  assert.ok(warning, 'avertissement visible quand la limite raccourcit des lignes');
  assert.ok(warning.message.includes('120'), 'la limite active est citée');
  assert.ok(warning.message.includes('1 ligne'), 'le nombre de lignes raccourcies est cité');
  assert.equal(model.isValid, true, 'avertissement non bloquant');

  // Limite haute sans effet → aucun avertissement.
  const untouched = buildModel({
    settings: { maxDesignationLength: 1000 },
    cartItems: [{ id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: longText }],
  });
  assert.equal(
    untouched.warnings.find((issue) => issue.code === 'designation-truncated'),
    undefined,
    'pas d’avertissement si rien n’est raccourci'
  );
}

/* ─── Mentions de remise retirées, technique intégralement conservé ───────── */
{
  const technicalText = [
    'Repère A1 - Fenêtre PVC 2 vantaux oscillo-battante',
    'Dimensions : 1200x1350 mm',
    'Profilé 70 mm PVC Schuco - 5 chambres - renforts acier - double joint',
    'Finition : Gris anthracite RAL 7016',
    'Double vitrage 4/16/4 faible émissivité gaz argon',
    'Poignée Sécustik havane',
    'Grille de ventilation hygroréglable',
    'Uw = 1,3 W/m²K – Sw = 0,42',
    'Volet roulant monobloc intégré, manœuvre radio',
    'Pose en rénovation sur dormant existant',
    'Remise : -20% (gain -182,03 €)',
    'Avant remise 910,14 €',
    'Gain -182,03 €',
  ].join('\n');

  const model = buildModel({
    settings: { maxDesignationLength: 0 },
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 728.11, quantity: 1, designationText: technicalText },
    ],
  });
  const exported = model.lines[0].designation;

  // Toutes les caractéristiques techniques sont présentes…
  [
    'Repère A1',
    'oscillo-battante',
    '1200x1350 mm',
    'Profilé 70 mm PVC Schuco',
    'Gris anthracite RAL 7016',
    '4/16/4',
    'Poignée Sécustik',
    'ventilation hygroréglable',
    'Uw = 1,3 W/m²K',
    'Volet roulant monobloc',
    'Pose en rénovation',
  ].forEach((fragment) => {
    assert.ok(exported.includes(fragment), `caractéristique conservée : ${fragment}`);
  });

  // …et seules les mentions commerciales de remise ont disparu.
  assert.ok(!exported.includes('Remise'), 'mention « Remise : -20% » retirée');
  assert.ok(!exported.includes('gain'), 'mention « gain -182,03 € » retirée');
  assert.ok(!exported.includes('Avant remise'), 'prix initial barré retiré');
  assert.ok(!exported.includes('Gain'), 'ligne « Gain » isolée retirée');
  assert.ok(buildSageCsv(model).includes(exported), 'le CSV reçoit exactement cette désignation');
}

/* ─── Encodage : accents et typographiques natifs CP1252 ─────────────────── */
{
  assert.deepEqual(
    Array.from(encodeSageCsv('éàçÉ', 'windows-1252')),
    [0xe9, 0xe0, 0xe7, 0xc9],
    'accents français en Latin-1'
  );
  assert.deepEqual(
    Array.from(encodeSageCsv('’–…×°', 'windows-1252')),
    [0x92, 0x96, 0x85, 0xd7, 0xb0],
    'apostrophe typographique ’, tiret –, points de suspension …, × et ° couverts sans perte'
  );
  assert.deepEqual(
    getCp1252UnsupportedChars('Fenêtre équipée d’un œil-de-bœuf – 90° × 1,2 m…'),
    [],
    'le français typographique usuel est 100 % compatible'
  );
}

/* ─── Encodage : normalisation contrôlée + rien de silencieux ─────────────── */
{
  // Équivalents contrôlés : trait d'union insécable, prime, ligature fi.
  assert.equal(normalizeForCp1252('a‑b'), 'a-b', 'trait d’union insécable → -');
  assert.equal(normalizeForCp1252('1′'), "1'", 'prime → apostrophe');
  assert.equal(normalizeForCp1252('ﬁn'), 'fin', 'ligature fi → fi');
  assert.deepEqual(
    Array.from(encodeSageCsv('a‑b', 'windows-1252')),
    [0x61, 0x2d, 0x62],
    'fallback appliqué à l’encodage'
  );

  // Caractère réellement incompatible : détecté, jamais avalé sans signalement.
  assert.deepEqual(getCp1252UnsupportedChars('OK ✓ fait'), ['✓']);
  assert.deepEqual(getCp1252UnsupportedChars('a‑b'), [], 'les fallbacks ne sont pas signalés');

  // Le modèle émet un AVERTISSEMENT avant génération (pas de perte silencieuse).
  const model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: 'Fenêtre ✓ conforme' },
    ],
  });
  const encodingWarning = model.warnings.find((issue) => issue.code === 'encoding-incompatible');
  assert.ok(encodingWarning, 'avertissement encodage présent');
  assert.ok(encodingWarning.message.includes('✓'), 'le caractère fautif est cité');
  assert.equal(model.isValid, true, 'avertissement non bloquant');

  // En UTF-8, aucun avertissement : tout est encodable.
  const utf8Model = buildModel({
    cartItems: [
      { id: 'a', productLabel: 'F', unitPrice: 100, quantity: 1, designationText: 'Fenêtre ✓ conforme' },
    ],
    settings: { encoding: 'utf8' },
  });
  assert.equal(
    utf8Model.warnings.find((issue) => issue.code === 'encoding-incompatible'),
    undefined,
    'pas d’avertissement en UTF-8'
  );
}

/* ─── Immutabilité des valeurs par défaut ─────────────────────────────────── */
{
  const settings = normalizeComptaSettings({ vatArticles: { 'tva-10': 'AUTRE' } });
  assert.equal(settings.vatArticles['tva-10'], 'AUTRE');
  assert.equal(
    DEFAULT_COMPTA_SETTINGS.vatArticles['tva-10'],
    'IMP100',
    'les défauts ne sont jamais mutés'
  );
}

console.log('sage-export.test.mjs : OK');
