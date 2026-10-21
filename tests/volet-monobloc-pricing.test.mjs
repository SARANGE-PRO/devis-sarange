// Prix du volet roulant monobloc intégré, dans le moteur de prix réel.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/volet-monobloc-pricing.test.mjs
//
// Le volet est chiffré sur la grille « Volet Filaire » + manœuvre, sauf prix
// saisi sur la ligne (aluminium sans grille). Avec « prix séparé », la ligne
// se répartit entre menuiserie et volet SANS changer son total : totaux du
// devis identiques, désignation de la menuiserie sans les lignes du volet.
import assert from 'node:assert/strict';

const { calculateItemPrice, getItemPricingSummary, getPriceForMm, getVoletMonoblocPricing } =
  await import('../lib/products.js');
const { computeQuoteTotals } = await import('../lib/quote-totals.mjs');
const { generateDesignation } = await import('../lib/designation-generator.js');
const { splitVoletMonoblocPricing } = await import('../lib/volet-monobloc.mjs');

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const near = (actual, expected, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `attendu ${expected} ± ${tolerance}, obtenu ${actual}`);

const round = (value) => Math.round(value * 100) / 100;

const window1v = {
  id: 'f1',
  productId: 'fenetre-1v',
  sheetName: 'Fenêtre 1V',
  productLabel: 'Fenêtre 1 vantail',
  widthMm: 1200,
  heightMm: 1250,
  unitPrice: 500,
  quantity: 1,
  includePose: true,
  remise: 0,
};
const monobloc = { ...window1v, voletMonobloc: true, voletMonoblocManoeuvre: 'radio' };

run('prix automatique : grille « Volet Filaire » aux dimensions de la menuiserie + manœuvre', () => {
  const grid = Number(getPriceForMm('Volet Filaire', 1250, 1200)?.price || 0);
  assert.ok(grid > 0, 'la grille couvre 120 × 125');
  const pricing = getVoletMonoblocPricing(monobloc);
  assert.equal(pricing.gridPrice, grid);
  assert.equal(pricing.hasGridPrice, true);
  assert.equal(pricing.autoPrice, round(grid + 62.5), 'manœuvre radio : + 50 × 1,25');
  assert.equal(pricing.override, null);
  assert.equal(pricing.unitPrice, pricing.autoPrice);

  const calc = calculateItemPrice(monobloc);
  assert.equal(calc.voletMonoblocUnitPrice, pricing.unitPrice);
  near(calc.totalLine - calculateItemPrice(window1v).totalLine, pricing.unitPrice, 0.011);
  assert.equal(calculateItemPrice(window1v).voletMonoblocUnitPrice, 0, 'sans volet : part nulle');
  assert.equal(getVoletMonoblocPricing(window1v).unitPrice, 0);
});

run('prix saisi : remplace la grille dans la ligne ; 0 = volet offert ; vide = grille', () => {
  const custom = { ...monobloc, voletMonoblocPriceOverride: 350 };
  assert.equal(getVoletMonoblocPricing(custom).unitPrice, 350);
  assert.equal(calculateItemPrice(custom).voletMonoblocUnitPrice, 350);
  near(calculateItemPrice(custom).totalLine - calculateItemPrice(window1v).totalLine, 350);
  assert.equal(calculateItemPrice({ ...monobloc, voletMonoblocPriceOverride: 0 }).voletMonoblocUnitPrice, 0);
  near(calculateItemPrice({ ...monobloc, voletMonoblocPriceOverride: 0 }).totalLine, calculateItemPrice(window1v).totalLine);
  assert.equal(
    calculateItemPrice({ ...monobloc, voletMonoblocPriceOverride: '' }).voletMonoblocUnitPrice,
    getVoletMonoblocPricing(monobloc).autoPrice
  );
});

run('prix séparé : total de la ligne et totaux du devis inchangés, parts exactes, remise au prorata', () => {
  const separate = { ...monobloc, voletMonoblocSeparate: true, remise: 10, quantity: 2 };
  const merged = { ...separate, voletMonoblocSeparate: false };
  const calc = calculateItemPrice(separate);
  assert.equal(calc.totalLine, calculateItemPrice(merged).totalLine);
  assert.equal(calc.posePrice, calculateItemPrice(merged).posePrice, 'une seule pose, inchangée');
  assert.deepEqual(computeQuoteTotals([separate], 20), computeQuoteTotals([merged], 20));

  const pricing = getItemPricingSummary(separate, calc);
  const split = splitVoletMonoblocPricing(separate, calc, pricing);
  assert.ok(split, 'répartition disponible');
  assert.equal(split.volet.unitPriceAfterDiscount, round(calc.voletMonoblocUnitPrice * 0.9));
  assert.equal(split.volet.originalUnitHT, calc.voletMonoblocUnitPrice);
  assert.equal(split.menuiserie.totalLine + split.volet.totalLine, calc.totalLine);
  assert.equal(split.menuiserie.originalLineHT + split.volet.originalLineHT, pricing.originalLineHT);
  assert.equal(splitVoletMonoblocPricing(merged, calculateItemPrice(merged), pricing), null);
});

run('aluminium sans grille : la menuiserie passe par la marge nette, le volet par son prix saisi', () => {
  const alu = {
    ...monobloc,
    productId: 'fenetre-1v-alu',
    sheetName: 'Fenêtre 1V ALU',
    material: 'alu',
    unitPrice: 0,
    netMarginWanted: 1500,
    voletMonoblocSeparate: true,
    voletMonoblocPriceOverride: 420,
  };
  const calc = calculateItemPrice(alu);
  const split = splitVoletMonoblocPricing(alu, calc, getItemPricingSummary(alu, calc));
  assert.equal(split.volet.unitPriceAfterDiscount, 420);
  assert.equal(split.menuiserie.unitPriceAfterDiscount, round(calc.unitPriceAfterDiscount - 420));
  assert.ok(split.menuiserie.unitPriceAfterDiscount >= 1500, 'la marge nette reste entièrement sur la menuiserie');
  // Même menuiserie sans prix saisi : le volet compte pour la grille (jamais pour la marge).
  const auto = calculateItemPrice({ ...alu, voletMonoblocPriceOverride: null });
  assert.equal(auto.voletMonoblocUnitPrice, getVoletMonoblocPricing(monobloc).autoPrice);
});

run('désignation : les lignes du volet quittent la menuiserie quand son prix est séparé', () => {
  const calc = calculateItemPrice(monobloc);
  const withVolet = generateDesignation(monobloc, calc, getItemPricingSummary(monobloc, calc));
  assert.ok(withVolet.includes('Volet roulant monobloc intégré'));
  const separate = { ...monobloc, voletMonoblocSeparate: true };
  const without = generateDesignation(separate, calc, getItemPricingSummary(separate, calc));
  assert.ok(!without.includes('Volet roulant monobloc'), 'portées par la sous-ligne « volet »');
});

run('châssis composé : un seul volet sur les dimensions de l’ensemble', () => {
  const composite = {
    id: 'c1',
    isComposite: true,
    productLabel: 'Châssis composé',
    widthMm: 2400,
    heightMm: 1250,
    quantity: 1,
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'solaire',
    composition: [],
    modules: [],
  };
  const grid = Number(getPriceForMm('Volet Filaire', 1250, 2400)?.price || 0);
  assert.ok(grid > 0);
  assert.equal(getVoletMonoblocPricing(composite).unitPrice, round(grid + 300));
  assert.equal(getVoletMonoblocPricing({ ...composite, voletMonoblocPriceOverride: 999 }).unitPrice, 999);
});

console.log('Tous les tests de prix du volet monobloc ont reussi.');
