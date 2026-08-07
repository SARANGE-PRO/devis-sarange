import assert from 'node:assert/strict';
import {
  SPARE_PARTS,
  SPARE_PART_CATEGORIES,
  SPARE_PART_PRICING_MODES,
  calculateTablierPrice,
  getSparePart,
  getSparePartPurchasePrice,
  getSparePartSalePrice,
  getSparePartsByCategory,
  getSparePartsMarkupCoefficient,
  getTablierLameOptions,
} from '../lib/spare-parts.js';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

/* ─── Intégrité du catalogue ──────────────────────────────────────────────*/

run('chaque pièce a un id unique, une catégorie connue et un prix positif', () => {
  const categoryIds = new Set(SPARE_PART_CATEGORIES.map((category) => category.id));
  const seenIds = new Set();

  SPARE_PARTS.forEach((part) => {
    assert.ok(!seenIds.has(part.id), `id en double : ${part.id}`);
    seenIds.add(part.id);
    assert.ok(categoryIds.has(part.categoryId), `catégorie inconnue pour ${part.id}`);
    assert.ok(part.purchasePrice > 0, `prix d'achat invalide pour ${part.id}`);
    assert.ok(
      part.pricingMode === SPARE_PART_PRICING_MODES.UNIT ||
        part.pricingMode === SPARE_PART_PRICING_MODES.LENGTH,
      `pricingMode invalide pour ${part.id}`
    );
  });
});

run('les lames de tablier (tabliers-lames) portent toutes une hauteur de profil', () => {
  getTablierLameOptions().forEach((lame) => {
    assert.ok(
      lame.profileHeightMm === 42 || lame.profileHeightMm === 55,
      `hauteur de profil inattendue pour ${lame.id}`
    );
  });
});

run('getSparePartsByCategory filtre correctement', () => {
  const moteurs = getSparePartsByCategory('moteurs-emetteurs');
  assert.ok(moteurs.length > 0);
  assert.ok(moteurs.every((part) => part.categoryId === 'moteurs-emetteurs'));
});

/* ─── Prix de vente : achat × coefficient (x2 par défaut) ────────────────*/

run('coefficient par défaut = x2 (aucune valeur enregistrée en environnement Node)', () => {
  assert.equal(getSparePartsMarkupCoefficient(), 2);
});

run('getSparePartSalePrice = achat × coefficient, arrondi au centime', () => {
  const part = getSparePart('cmm45101705c');
  assert.equal(part.purchasePrice, 24.34);
  assert.equal(getSparePartPurchasePrice('cmm45101705c'), 24.34);
  assert.equal(getSparePartSalePrice('cmm45101705c'), 48.68);
});

run('getSparePartSalePrice renvoie 0 pour une référence inconnue', () => {
  assert.equal(getSparePartSalePrice('reference-inexistante'), 0);
});

/* ─── Tablier de volet roulant, prix au m² ────────────────────────────────*/

run('calculateTablierPrice : BP42R Blanc Belge 1200x1000 -> 46,86 EUR', () => {
  const pricing = calculateTablierPrice({
    widthMm: 1200,
    heightMm: 1000,
    lameId: 'bp42r-blanc-belge',
  });
  assert.ok(pricing);
  assert.equal(pricing.areaM2, 1.2);
  // 0,82 / 0,042 = 19,52 EUR/m² d'achat -> x2 = 39,05 EUR/m² de vente.
  assert.equal(pricing.purchasePricePerM2, 19.52);
  assert.equal(pricing.salePricePerM2, 39.05);
  assert.equal(pricing.unitPrice, 46.86);
});

run('calculateTablierPrice : le profil 55 mm donne un prix au m² différent du 42 mm', () => {
  const p42 = calculateTablierPrice({ widthMm: 1000, heightMm: 1000, lameId: 'bp42r-blanc-belge' });
  const p55 = calculateTablierPrice({ widthMm: 1000, heightMm: 1000, lameId: 'bp55r-blanc-belge' });
  assert.ok(p42.salePricePerM2 !== p55.salePricePerM2);
});

run('calculateTablierPrice : dimensions nulles ou négatives -> null', () => {
  assert.equal(
    calculateTablierPrice({ widthMm: 0, heightMm: 1000, lameId: 'bp42r-blanc-belge' }),
    null
  );
  assert.equal(
    calculateTablierPrice({ widthMm: 1000, heightMm: -5, lameId: 'bp42r-blanc-belge' }),
    null
  );
});

run('calculateTablierPrice : référence hors catégorie tabliers-lames -> null', () => {
  assert.equal(
    calculateTablierPrice({ widthMm: 1000, heightMm: 1000, lameId: 'cmm45101705c' }),
    null
  );
});

run('calculateTablierPrice : référence inconnue -> null', () => {
  assert.equal(
    calculateTablierPrice({ widthMm: 1000, heightMm: 1000, lameId: 'inconnue' }),
    null
  );
});
