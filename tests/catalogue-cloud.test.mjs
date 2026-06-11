import assert from 'node:assert/strict';

import {
  CATALOGUE_SCHEMA_VERSION,
  buildCatalogueRecord,
  normalizeCataloguePayload,
} from '../lib/catalogue-cloud.js';

const payload = normalizeCataloguePayload({
  coefficients: {
    'fenetre-1v': '1.125',
    'fenetre-2v': '0',
  },
  pricing: {
    baseGlassPricePerM2: '42.5',
    posePrices: {
      menuiserie: '300',
    },
    glazingPrices: {
      vitrage_perso: '88.4',
    },
  },
  customGlazingOptions: [
    {
      id: 'custom-glazing-acoustique',
      label: 'Vitrage acoustique',
      shortLabel: 'Acoustique',
      purchasePricePerM2: '91.4',
      ug: '1.0',
      g: '0.52',
      thicknessMm: '44',
    },
    {
      id: 'dv_4_20_4_argon_we',
      label: 'Doit etre ignore car conflit avec un vitrage natif',
      shortLabel: 'Ignore',
    },
    {
      id: 'custom-glazing-acoustique',
      label: 'Doublon ignore',
      shortLabel: 'Ignore aussi',
    },
  ],
});

assert.deepEqual(payload.coefficients, {
  'fenetre-1v': 1.125,
});

assert.equal(payload.pricing.baseGlassPricePerM2, 42.5);
assert.equal(payload.pricing.posePrices.menuiserie, 300);
assert.equal(payload.pricing.posePrices.volet, 150);
assert.equal(payload.pricing.glazingPrices.vitrage_perso, 88.4);

assert.equal(payload.customGlazingOptions.length, 1);
assert.equal(payload.customGlazingOptions[0].id, 'custom-glazing-acoustique');
assert.equal(payload.customGlazingOptions[0].purchasePricePerM2, 91.4);
assert.equal(payload.customGlazingOptions[0].ug, 1);
assert.equal(payload.customGlazingOptions[0].g, 0.52);
assert.equal(payload.customGlazingOptions[0].thicknessMm, 44);

const record = buildCatalogueRecord(payload);
assert.equal(record.schemaVersion, CATALOGUE_SCHEMA_VERSION);

console.log('catalogue-cloud ok');
