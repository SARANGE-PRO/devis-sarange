// Commission commerciale et remise de ligne : cohérence des prix affichés.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/commission-discount.test.mjs
//
// Bug constaté le 24/09/2026 : la commission était ajoutée au prix barré mais
// le montant de la remise restait celui calculé AVANT commission, d'où
// « -20 % » affiché pour une remise réelle de 19,4 % (546,79 / 2 816,52).
// Règle attendue : barré - remise = net, remise / barré = pourcentage de la
// ligne, et la commission reste intégralement dans le net (le vendeur encaisse
// bien le montant saisi).
import assert from 'node:assert/strict';

const { applyCommissionToCartItems, calculateItemPrice, getItemPricingSummary } = await import(
  '../lib/products.js'
);
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

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} : ${actual} vs ${expected}`);

const items = [
  {
    id: 'a',
    productId: 'fenetre-1v',
    sheetName: 'Fenêtre 1V',
    productLabel: 'Fenêtre 1 vantail',
    widthMm: 1200,
    heightMm: 1250,
    unitPrice: 2816.52,
    quantity: 1,
    includePose: true,
    remise: 20,
  },
  {
    id: 'b',
    productId: 'fenetre-2v',
    sheetName: 'Fenêtre 2V',
    productLabel: 'Fenêtre 2 vantaux',
    widthMm: 1400,
    heightMm: 1350,
    unitPrice: 900,
    quantity: 2,
    includePose: false,
    remise: 10,
  },
  {
    id: 'c',
    productId: 'fenetre-1v',
    sheetName: 'Fenêtre 1V',
    productLabel: 'Fenêtre 1 vantail',
    widthMm: 800,
    heightMm: 1000,
    unitPrice: 400,
    quantity: 1,
    includePose: false,
    remise: 0,
  },
];

const lineFigures = (item) => {
  const calc = calculateItemPrice(item);
  const pricing = getItemPricingSummary(item, calc);
  return { calc, pricing };
};

run('sans commission : la remise affichée correspond exactement au pourcentage', () => {
  const { calc, pricing } = lineFigures(items[0]);
  near(pricing.discountLineHT / pricing.originalLineHT, 0.2, 0.0001, 'pourcentage réel');
  near(pricing.originalLineHT - pricing.discountLineHT, calc.totalLine, 0.011, 'barré - remise = net');
});

run('avec commission en € : barré - remise = net et remise / barré = pourcentage', () => {
  const commissioned = applyCommissionToCartItems(items, { mode: 'amount', amount: 300 });

  commissioned.forEach((item, index) => {
    const { calc, pricing } = lineFigures(item);
    const rate = (items[index].remise || 0) / 100;
    assert.ok(item.commissionUnitHT > 0, `ligne ${item.id} : commission répartie`);

    if (rate > 0) {
      near(pricing.discountLineHT / pricing.originalLineHT, rate, 0.0005, `ligne ${item.id} : pourcentage réel`);
      near(pricing.originalLineHT - pricing.discountLineHT, calc.totalLine, 0.011, `ligne ${item.id} : barré - remise = net`);
      near(pricing.originalUnitHT * (1 - rate), calc.unitPriceAfterDiscount, 0.011, `ligne ${item.id} : barré remisé = net`);
    } else {
      assert.equal(pricing.hasDiscount, false, `ligne ${item.id} : aucun prix barré sans remise`);
      assert.equal(pricing.originalUnitHT, calc.unitPriceAfterDiscount);
    }
  });
});

run('la commission reste intégralement dans le net (le vendeur encaisse le montant saisi)', () => {
  const commissioned = applyCommissionToCartItems(items, { mode: 'amount', amount: 300 });
  const uplift = commissioned.reduce(
    (sum, item, index) => sum + (calculateItemPrice(item).totalLine - calculateItemPrice(items[index]).totalLine),
    0
  );
  near(uplift, 300, 0.011, 'majoration nette totale');

  const before = computeQuoteTotals(items, 20);
  const after = computeQuoteTotals(commissioned, 20);
  near(after.totalHT - before.totalHT, 300, 0.011, 'total HT');
  near(after.originalTotalHT - after.discountTotal, after.totalHT, 0.011, 'synthèse : avant remise - remise = total');
});

run('commission en % : même cohérence, montant = pourcentage du total après remise', () => {
  const before = computeQuoteTotals(items, 20);
  const commissioned = applyCommissionToCartItems(items, { mode: 'percent', percent: 5 });
  const after = computeQuoteTotals(commissioned, 20);
  near(after.totalHT - before.totalHT, before.totalHT * 0.05, 0.03, 'montant de commission');

  const { calc, pricing } = lineFigures(commissioned[0]);
  near(pricing.discountLineHT / pricing.originalLineHT, 0.2, 0.0005, 'pourcentage réel');
  near(pricing.originalLineHT - pricing.discountLineHT, calc.totalLine, 0.011, 'barré - remise = net');
});

run('exemple constaté : net 2 269,73 € à -20 % doit afficher un barré de 2 837,16 € et un gain de 567,43 €', () => {
  // Une ligne dont le net commission comprise vaut 2 269,73 € pour -20 % :
  // barré = net / 0,8, gain = barré - net.
  const [item] = applyCommissionToCartItems([items[0]], { mode: 'amount', amount: 16.51 });
  const { calc, pricing } = lineFigures(item);
  assert.equal(calc.unitPriceAfterDiscount, 2269.73);
  assert.equal(pricing.originalUnitHT, 2837.16);
  assert.equal(pricing.discountLineHT, 567.43);
});

console.log('Tous les tests commission + remise ont reussi.');
