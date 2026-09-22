// Tarif de pose spécifique à une ligne de devis.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/pose-price-override.test.mjs
//
// Le tarif de pose d'une ligne est celui du catalogue (par type de produit),
// sauf si un tarif spécifique a été saisi en place dans le configurateur
// (`posePriceOverride`). Le calcul du devis, le récapitulatif, le PDF et
// l'export comptable lisent tous `calc.posePrice` : c'est donc ce calcul qui
// est vérifié ici, plus la normalisation des saisies.
import assert from 'node:assert/strict';

const {
  calculateItemPrice,
  getCataloguePosePrice,
  getItemPosePrice,
  normalizePosePriceOverride,
} = await import('../lib/products.js');
const { computeQuoteTotals } = await import('../lib/quote-totals.mjs');

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const window1v = {
  id: 'f1',
  productId: 'fenetre-1v',
  sheetName: 'Fenêtre 1V',
  productLabel: 'Fenêtre 1 vantail',
  widthMm: 1200,
  heightMm: 1250,
  unitPrice: 500,
  quantity: 2,
  includePose: true,
  remise: 0,
};

run('normalisation d’un tarif spécifique saisi', () => {
  assert.equal(normalizePosePriceOverride(''), null);
  assert.equal(normalizePosePriceOverride(null), null);
  assert.equal(normalizePosePriceOverride(undefined), null);
  assert.equal(normalizePosePriceOverride('abc'), null);
  assert.equal(normalizePosePriceOverride(-5), null, 'jamais de pose négative');
  assert.equal(normalizePosePriceOverride(0), 0, 'pose offerte possible');
  assert.equal(normalizePosePriceOverride('275.5'), 275.5);
  assert.equal(normalizePosePriceOverride(199.999), 200, 'arrondi au centime');
});

run('sans tarif spécifique : tarif catalogue du type de produit', () => {
  const catalogue = getCataloguePosePrice(window1v);
  assert.ok(catalogue > 0);
  assert.equal(getItemPosePrice(window1v), catalogue);
  assert.equal(calculateItemPrice(window1v).posePrice, catalogue);
  // Valeur vide ou invalide : même résultat.
  assert.equal(calculateItemPrice({ ...window1v, posePriceOverride: '' }).posePrice, catalogue);
  assert.equal(calculateItemPrice({ ...window1v, posePriceOverride: -10 }).posePrice, catalogue);
});

run('tarif spécifique : appliqué par unité, repris dans les totaux', () => {
  const item = { ...window1v, posePriceOverride: 300 };
  const calc = calculateItemPrice(item);
  assert.equal(calc.posePrice, 300);
  // Le prix de la menuiserie ne bouge pas.
  assert.equal(calc.totalLine, calculateItemPrice(window1v).totalLine);

  // Totaux du devis : 2 × 300 € de pose en plus des menuiseries.
  const reference = computeQuoteTotals([window1v], 20);
  const withOverride = computeQuoteTotals([item], 20);
  const delta = withOverride.totalHT - reference.totalHT;
  assert.equal(Math.round(delta * 100) / 100, 2 * (300 - getCataloguePosePrice(window1v)));

  // Pose offerte : 0 € explicite, la ligne « Pose » existe toujours.
  assert.equal(calculateItemPrice({ ...window1v, posePriceOverride: 0 }).posePrice, 0);
});

run('pose non incluse : aucun tarif, même avec un tarif spécifique saisi', () => {
  const calc = calculateItemPrice({ ...window1v, includePose: false, posePriceOverride: 300 });
  assert.equal(calc.posePrice, 0);
});

run('volet solaire : forfait catalogue, tarif spécifique prioritaire', () => {
  const solar = {
    id: 'v1',
    productId: 'volet-solaire',
    sheetName: 'Volet Roulant Solaire',
    unitPrice: 400,
    quantity: 1,
    includePose: true,
    remise: 0,
  };
  assert.equal(getCataloguePosePrice(solar), 100);
  assert.equal(calculateItemPrice(solar).posePrice, 100);
  assert.equal(calculateItemPrice({ ...solar, posePriceOverride: 80 }).posePrice, 80);
});

console.log('Tous les tests du tarif de pose spécifique ont reussi.');
