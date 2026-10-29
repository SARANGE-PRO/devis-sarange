// Prix modifiés dans le récapitulatif : le prix tapé retombe au centime sur le
// prix affiché, quel que soit le levier (ajustement net, prix saisi, pose,
// volet), remise et commission comprises.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/recap-price-edit.test.mjs
import assert from 'node:assert/strict';

const {
  applyRecapPosePrice,
  applyRecapUnitPrice,
  applyRecapVoletPrice,
  getRecapPriceMode,
  getRecapShownPrices,
  parseRecapPriceInput,
  resetRecapPosePrice,
  resetRecapUnitPrice,
} = await import('../lib/recap-price-edit.mjs');
const { calculateItemPrice, getItemPricingSummary } = await import('../lib/products.js');

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.log(`KO - ${name}`);
    throw error;
  }
};

const NO_COMMISSION = { mode: 'percent', percent: 0, amount: 0 };

const window1 = {
  id: 'f1',
  productId: 'fenetre-pvc-1v',
  sheetName: 'Fenetre 1 Vantail',
  unitPrice: 300,
  widthMm: 800,
  heightMm: 1000,
  quantity: 2,
  remise: 20,
  includePose: true,
  netMarginWanted: 0,
  netDiscountWanted: 0,
};
const window2 = { ...window1, id: 'f2', unitPrice: 500, quantity: 1, remise: 0 };

const replace = (items, next) => items.map((item) => (item.id === next.id ? next : item));

run('saisie : virgule, espaces, refus du négatif', () => {
  assert.equal(parseRecapPriceInput('1 234,5'), 1234.5);
  assert.equal(parseRecapPriceInput('  '), null);
  assert.equal(parseRecapPriceInput('-3'), null);
  assert.equal(parseRecapPriceInput('abc'), null);
});

run('levier selon la ligne', () => {
  assert.equal(getRecapPriceMode(window1), 'adjustment');
  assert.equal(getRecapPriceMode({ productId: 'custom-product' }), 'customPrice');
  assert.equal(getRecapPriceMode({ productId: 'livraison' }), 'unitPrice');
  assert.equal(getRecapPriceMode({ productId: 'remise-commerciale' }), 'discountAmount');
  assert.equal(getRecapPriceMode({ productId: 'gestion-dechets' }), 'waste');
  assert.equal(getRecapPriceMode({ productId: 'text-only' }), null);
});

run('menuiserie remisée : prix plus haut = marge nette, plus bas = remise nette, remise % gardée', () => {
  const items = [window1, window2];
  const before = getRecapShownPrices(items, 'f1', NO_COMMISSION).main;

  const up = applyRecapUnitPrice({ items, itemId: 'f1', target: before + 57.31, commission: NO_COMMISSION });
  assert.ok(up.netMarginWanted > 0 && up.netDiscountWanted === 0);
  assert.equal(up.remise, 20);
  assert.equal(getRecapShownPrices(replace(items, up), 'f1', NO_COMMISSION).main, roundCents(before + 57.31));

  const down = applyRecapUnitPrice({ items, itemId: 'f1', target: '199,99', commission: NO_COMMISSION });
  assert.ok(down.netDiscountWanted > 0 && down.netMarginWanted === 0);
  const calc = calculateItemPrice(down);
  assert.equal(calc.unitPriceAfterDiscount, 199.99);
  // Le barré suit : -20 % sur le barré redonne le net.
  const pricing = getItemPricingSummary(down, calc);
  assert.ok(Math.abs(pricing.originalUnitHT * 0.8 - 199.99) <= 0.01);

  assert.deepEqual(
    [resetRecapUnitPrice(down).netMarginWanted, resetRecapUnitPrice(down).netDiscountWanted],
    [0, 0]
  );
  assert.equal(resetRecapUnitPrice(window1), null, 'rien à rétablir');
});

run('commission en % et en € : le prix affiché commission comprise tombe juste (au centime près)', () => {
  const items = [window1, window2];
  for (const commission of [
    { mode: 'percent', percent: 8, amount: 0 },
    { mode: 'amount', percent: 0, amount: 350 },
  ]) {
    for (const target of [412.37, 250, 1000]) {
      const next = applyRecapUnitPrice({ items, itemId: 'f1', target, commission });
      // La part de commission de la ligne bouge avec son prix : certains
      // centimes sont inatteignables, on retient alors le plus proche.
      const shown = getRecapShownPrices(replace(items, next), 'f1', commission).main;
      assert.ok(Math.abs(shown - target) <= 0.011, `${commission.mode} ${target} -> ${shown}`);
      assert.equal(next.commissionUnitHT, undefined, 'jamais de commission figée dans le panier');
    }
  }
});

run('prix saisis : produit hors catalogue, service, remise commerciale, déchets', () => {
  const custom = { id: 'c', productId: 'custom-product', customPrice: 80, quantity: 2, remise: 20 };
  const nextCustom = applyRecapUnitPrice({ items: [custom], itemId: 'c', target: 95, commission: NO_COMMISSION });
  assert.equal(calculateItemPrice(nextCustom).unitPriceAfterDiscount, 95);

  const discount = { id: 'r', productId: 'remise-commerciale', customPrice: 50, quantity: 1 };
  const nextDiscount = applyRecapUnitPrice({ items: [discount], itemId: 'r', target: '120', commission: NO_COMMISSION });
  assert.equal(calculateItemPrice(nextDiscount).totalLine, -120);

  const waste = { id: 'd', productId: 'gestion-dechets', totalWastePrice: 42.5, totalWeight: 120, quantity: 1 };
  const nextWaste = applyRecapUnitPrice({ items: [waste], itemId: 'd', target: 60, commission: NO_COMMISSION });
  assert.equal(calculateItemPrice(nextWaste).totalLine, 60);
  assert.equal(calculateItemPrice(resetRecapUnitPrice(nextWaste)).totalLine, 42.5);
});

run('pose : tarif spécifique, retour au catalogue', () => {
  const next = applyRecapPosePrice(window1, '145');
  assert.equal(calculateItemPrice(next).posePrice, 145);
  assert.equal(calculateItemPrice(resetRecapPosePrice(next)).posePrice, calculateItemPrice(window1).posePrice);
  assert.equal(applyRecapPosePrice({ ...window1, includePose: false }, 100), null);
  const custom = { id: 'c', productId: 'custom-product', customPrice: 80, includePose: true, customPoseHt: 50 };
  assert.equal(calculateItemPrice(applyRecapPosePrice(custom, 70)).posePrice, 70);
});

run('volet monobloc séparé : prix net du volet, part menuiserie inchangée, composé synchronisé', () => {
  const withVolet = { ...window1, voletMonobloc: true, voletMonoblocSeparate: true, voletMonoblocPriceOverride: 400 };
  const items = [withVolet];
  const before = getRecapShownPrices(items, 'f1', NO_COMMISSION);
  const next = applyRecapVoletPrice({ items, itemId: 'f1', target: 333.33, commission: NO_COMMISSION });
  const after = getRecapShownPrices([next], 'f1', NO_COMMISSION);
  assert.equal(after.volet, 333.33);
  assert.equal(after.main, before.main);

  const composite = { ...withVolet, isComposite: true, compositeFrame: { voletMonoblocPriceOverride: 400 } };
  const nextComposite = applyRecapVoletPrice({ items: [composite], itemId: 'f1', target: 300, commission: NO_COMMISSION });
  assert.equal(nextComposite.compositeFrame.voletMonoblocPriceOverride, nextComposite.voletMonoblocPriceOverride);
});

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

console.log('Tous les tests des prix modifiés dans le récapitulatif ont reussi.');
