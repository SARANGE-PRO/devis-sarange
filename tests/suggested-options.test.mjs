// Options suggérées OB / grille de ventilation sous les fenêtres.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/suggested-options.test.mjs
import assert from 'node:assert/strict';

const {
  OB_MAX_HEIGHT_MM,
  buildSuggestedOptionsLine,
  getSuggestedSashOptions,
  isSuggestedOptionsLine,
} = await import('../lib/suggested-options.mjs');
const { calculateItemPrice, getItemSuggestedSashOptions } = await import('../lib/products.js');
const { getDefaultQuoteSettings, normalizeQuoteSettings } = await import(
  '../lib/quote-settings.mjs'
);

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const PRICES = { obPrice: 30, grillePrice: 10 };
const fmt = (value) => `${value.toFixed(2)} €`;
const window2v = (overrides = {}) => ({
  productId: 'fenetre-2v',
  sheetName: 'Fenêtre 2V',
  widthMm: 1200,
  heightMm: 1250,
  unitPrice: 500,
  quantity: 1,
  sashOptions: {},
  ...overrides,
});

run('fenêtre sans option : OB et grille proposés au prix catalogue × 1,25', () => {
  assert.deepEqual(getSuggestedSashOptions(window2v(), PRICES), { ob: 37.5, vent: 12.5 });
});

run('la remise de la ligne est appliquée au prix suggéré', () => {
  assert.deepEqual(getSuggestedSashOptions(window2v({ remise: 10 }), PRICES), {
    ob: 33.75,
    vent: 11.25,
  });
});

run('le prix suggéré = écart réel de prix si on coche l’option (remise incluse)', () => {
  const item = window2v({ remise: 15 });
  const suggested = getItemSuggestedSashOptions(item);
  const withOb = { ...item, sashOptions: { 0: { ob: true, vent: false } } };
  const withVent = { ...item, sashOptions: { 0: { ob: false, vent: true } } };
  const base = calculateItemPrice(item).unitPriceAfterDiscount;
  assert.equal(
    Math.round((calculateItemPrice(withOb).unitPriceAfterDiscount - base) * 100) / 100,
    suggested.ob
  );
  assert.equal(
    Math.round((calculateItemPrice(withVent).unitPriceAfterDiscount - base) * 100) / 100,
    suggested.vent
  );
});

run('option déjà retenue sur un vantail : plus proposée', () => {
  const item = window2v({ sashOptions: { 1: { ob: true, vent: false } } });
  assert.deepEqual(getSuggestedSashOptions(item, PRICES), { ob: null, vent: 12.5 });
  const both = window2v({ sashOptions: { 0: { ob: true, vent: true } } });
  assert.deepEqual(getSuggestedSashOptions(both, PRICES), { ob: null, vent: null });
});

run(`OB limité à ${OB_MAX_HEIGHT_MM} mm de haut`, () => {
  assert.equal(getSuggestedSashOptions(window2v({ heightMm: 2000 }), PRICES).ob, 37.5);
  const tall = getSuggestedSashOptions(
    window2v({ sheetName: 'Porte-Fenêtre 2V', heightMm: 2150 }),
    PRICES
  );
  assert.deepEqual(tall, { ob: null, vent: 12.5 });
});

run('produits non concernés', () => {
  const cases = [
    { sheetName: 'Fenêtre Fixe' },
    { sheetName: 'Coulissant 2 vantaux 2 rails' },
    { sheetName: 'Porte Entrée Réno' },
    { isComposite: true },
  ];
  cases.forEach((overrides) =>
    assert.deepEqual(getSuggestedSashOptions(window2v(overrides), PRICES), { ob: null, vent: null })
  );
  assert.deepEqual(
    getSuggestedSashOptions(window2v(), { ...PRICES, isManualPrice: true }),
    { ob: null, vent: null }
  );
});

run('soufflet : grille seulement ; ALU traité comme PVC', () => {
  assert.deepEqual(
    getSuggestedSashOptions(window2v({ sheetName: 'Fenêtre Soufflet' }), PRICES),
    { ob: null, vent: 12.5 }
  );
  assert.deepEqual(
    getSuggestedSashOptions(window2v({ sheetName: 'Fenêtre 1V ALU' }), PRICES),
    { ob: 37.5, vent: 12.5 }
  );
});

run('formulation de la ligne', () => {
  assert.equal(
    buildSuggestedOptionsLine({ ob: 33.75, vent: 11.25 }, fmt),
    'En option (non inclus) : oscillo-battant +33.75 € HT, grille de ventilation +11.25 € HT'
  );
  assert.equal(
    buildSuggestedOptionsLine({ ob: null, vent: 12.5 }, fmt, 3),
    'En option (non inclus) : grille de ventilation +12.50 € HT par menuiserie'
  );
  assert.equal(buildSuggestedOptionsLine({ ob: null, vent: null }, fmt), '');
  assert.ok(isSuggestedOptionsLine('  En option (non inclus) : x'));
  assert.ok(!/—/.test(buildSuggestedOptionsLine({ ob: 1, vent: 1 }, fmt)));
});

run('réglage : actif sur un nouveau devis, inactif sur un devis enregistré avant', () => {
  assert.equal(normalizeQuoteSettings(getDefaultQuoteSettings()).showSuggestedOptions, true);
  assert.equal(normalizeQuoteSettings({ validityMonths: 2 }).showSuggestedOptions, false);
  assert.equal(normalizeQuoteSettings(null).showSuggestedOptions, false);
  assert.equal(
    normalizeQuoteSettings({ showSuggestedOptions: false }).showSuggestedOptions,
    false
  );
});
