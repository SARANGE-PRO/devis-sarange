import assert from 'node:assert/strict';

import {
  DEFAULT_PETITS_BOIS_MARKUP_COEFFICIENT,
  DEFAULT_PETITS_BOIS_TYPE_ID,
  PETITS_BOIS_TYPES,
  calculatePetitsBoisPrice,
  formatPetitsBoisTypeLabel,
  getPetitsBoisPricePerMl,
  getPetitsBoisSupplementPerVolume,
  normalizePetitsBoisTypeId,
} from '../lib/petits-bois.mjs';

const roundToCents = (value) => Math.round(value * 100) / 100;

// Types : identifiants uniques, 26×8 blanc par défaut, prix d'achat Riou.
assert.equal(new Set(PETITS_BOIS_TYPES.map((type) => type.id)).size, PETITS_BOIS_TYPES.length);
assert.equal(DEFAULT_PETITS_BOIS_TYPE_ID, '26x8-blanc');
assert.equal(PETITS_BOIS_TYPES.find((type) => type.id === '26x8-blanc').purchasePricePerMl, 16.64);
assert.equal(PETITS_BOIS_TYPES.find((type) => type.id === '26x8-chene-dore').purchasePricePerMl, 28.87);
assert.equal(normalizePetitsBoisTypeId('26x8-marron'), '26x8-marron');
assert.equal(normalizePetitsBoisTypeId('inconnu'), '26x8-blanc', 'type inconnu : blanc');
assert.equal(normalizePetitsBoisTypeId(undefined), '26x8-blanc', 'articles antérieurs : blanc');

// Prix de vente au ml = achat × coefficient (2,25 par défaut : le blanc reste
// au niveau de l'ancien prix unique de 37,50 €/ml).
assert.equal(DEFAULT_PETITS_BOIS_MARKUP_COEFFICIENT, 2.25);
assert.equal(getPetitsBoisPricePerMl('26x8-blanc'), 37.44);
assert.equal(getPetitsBoisPricePerMl('26x8-chene-dore'), roundToCents(28.87 * 2.25));
assert.equal(getPetitsBoisPricePerMl('26x8-blanc', { petitsBoisMarkupCoefficient: 2 }), 33.28);
assert.equal(getPetitsBoisPricePerMl('26x8-blanc', { petitsBoisMarkupCoefficient: 0 }), 37.44, 'coefficient nul : défaut');
assert.equal(getPetitsBoisSupplementPerVolume('26x8-blanc'), 0);
assert.equal(getPetitsBoisSupplementPerVolume('26x8-teinte-hors-standard'), roundToCents(80.08 * 2.25));

// Barres : horizontales × largeur + verticales × hauteur (1000 × 1200, 2 H / 1 V = 3,2 ml).
const base = { widthMm: 1000, heightMm: 1200, petitsBoisH: 2, petitsBoisV: 1 };
assert.equal(calculatePetitsBoisPrice(base), roundToCents(3.2 * 37.44));
assert.equal(calculatePetitsBoisPrice({ ...base, petitsBoisType: '26x8-chene-dore' }), roundToCents(3.2 * roundToCents(28.87 * 2.25)));
assert.equal(
  calculatePetitsBoisPrice({ ...base, petitsBoisType: '26x8-teinte-hors-standard' }),
  roundToCents(3.2 * 37.44 + roundToCents(80.08 * 2.25)),
  'teinte hors standard : forfait par volume en plus'
);
assert.equal(calculatePetitsBoisPrice({ ...base, petitsBoisH: 0, petitsBoisV: 0 }), 0, 'sans barre : 0, même en teinte spéciale');
assert.equal(calculatePetitsBoisPrice({ ...base, petitsBoisH: '2', petitsBoisV: '1' }), roundToCents(3.2 * 37.44), 'valeurs texte tolérées');
assert.equal(calculatePetitsBoisPrice({ ...base, petitsBoisType: 'inconnu' }), roundToCents(3.2 * 37.44));
assert.equal(calculatePetitsBoisPrice({ ...base, pricing: { petitsBoisMarkupCoefficient: 2 } }), roundToCents(3.2 * 33.28));

// Libellés : rien pour le blanc standard, le profil sinon.
assert.equal(formatPetitsBoisTypeLabel('26x8-blanc'), '');
assert.equal(formatPetitsBoisTypeLabel(undefined), '');
assert.equal(formatPetitsBoisTypeLabel('26x8-chene-dore'), '26×8 chêne doré');

console.log('petits-bois ok');
