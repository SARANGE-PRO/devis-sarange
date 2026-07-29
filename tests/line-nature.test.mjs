import assert from 'node:assert/strict';
import {
  CONTRACT_TYPES,
  computeContractBreakdown,
  detectContractType,
  isChantierNature,
  normalizeNatureOverride,
  resolveContractType,
  resolveLineNature,
} from '../lib/line-nature.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('derive la nature des lignes depuis productId', () => {
  assert.equal(resolveLineNature({ productId: 'fenetre-1v' }), 'fourniture');
  assert.equal(resolveLineNature({ productId: 'gestion-dechets' }), 'recyclage');
  assert.equal(resolveLineNature({ productId: 'forfait-deplacement' }), 'livraison');
  assert.equal(resolveLineNature({ productId: 'metrage-technique-validation' }), 'metrage');
  assert.equal(resolveLineNature({ productId: 'remise-commerciale' }), 'remise');
  assert.equal(resolveLineNature({ productId: 'text-only' }), 'autre');
  assert.equal(resolveLineNature(null), 'fourniture');
});

run("l'override manuel exceptionnel prime sur la derivation", () => {
  assert.equal(
    resolveLineNature({ productId: 'custom-product', natureOverride: 'pose' }),
    'pose'
  );
  // Override invalide -> ignore.
  assert.equal(
    resolveLineNature({ productId: 'custom-product', natureOverride: 'nimporte' }),
    'fourniture'
  );
  assert.equal(normalizeNatureOverride('livraison'), 'livraison');
  assert.equal(normalizeNatureOverride('selon avancement'), '');
});

run('classe pose, livraison et recyclage en prestations chantier', () => {
  assert.equal(isChantierNature('pose'), true);
  assert.equal(isChantierNature('livraison'), true);
  assert.equal(isChantierNature('recyclage'), true);
  assert.equal(isChantierNature('fourniture'), false);
  assert.equal(isChantierNature('metrage'), false);
  assert.equal(isChantierNature('remise'), false);
});

run('detecte AVEC_POSE uniquement via includePose (ou nature pose forcee)', () => {
  assert.equal(detectContractType([]), CONTRACT_TYPES.FOURNITURE_SEULE);
  assert.equal(
    detectContractType([{ productId: 'fenetre-1v', includePose: false }]),
    CONTRACT_TYPES.FOURNITURE_SEULE
  );
  // La livraison / l'evacuation seules ne qualifient PAS le contrat avec pose.
  assert.equal(
    detectContractType([
      { productId: 'forfait-deplacement' },
      { productId: 'gestion-dechets' },
    ]),
    CONTRACT_TYPES.FOURNITURE_SEULE
  );
  assert.equal(
    detectContractType([{ productId: 'fenetre-1v', includePose: true }]),
    CONTRACT_TYPES.AVEC_POSE
  );
  assert.equal(
    detectContractType([{ productId: 'custom-product', natureOverride: 'pose' }]),
    CONTRACT_TYPES.AVEC_POSE
  );
});

run("respecte l'override administrateur du type de contrat", () => {
  const items = [{ productId: 'fenetre-1v', includePose: true }];
  assert.equal(resolveContractType(items, 'auto'), CONTRACT_TYPES.AVEC_POSE);
  assert.equal(
    resolveContractType(items, 'FOURNITURE_SEULE'),
    CONTRACT_TYPES.FOURNITURE_SEULE
  );
  assert.equal(resolveContractType([], 'AVEC_POSE'), CONTRACT_TYPES.AVEC_POSE);
  // Valeur inconnue -> auto.
  assert.equal(resolveContractType(items, 'peut-etre'), CONTRACT_TYPES.AVEC_POSE);
});

run('ventile fabrication + chantier = totaux du devis, au centime pres', () => {
  const breakdown = computeContractBreakdown({
    totalHT: 1000,
    totalTva: 100,
    totalTTC: 1100,
    chantierByRate: [{ rate: 10, totalHT: 100.005 }],
  });

  assert.equal(breakdown.chantier.totalHT, 100.01);
  assert.equal(breakdown.chantier.tva, 10);
  assert.equal(breakdown.chantier.totalTTC, 110.01);
  assert.equal(breakdown.fabrication.totalHT, 899.99);
  assert.equal(breakdown.fabrication.tva, 90);
  assert.equal(breakdown.fabrication.totalTTC, 989.99);
  // Invariant : la somme des deux categories redonne exactement les totaux.
  assert.equal(breakdown.fabrication.totalHT + breakdown.chantier.totalHT, 1000);
  assert.equal(
    Math.round((breakdown.fabrication.totalTTC + breakdown.chantier.totalTTC) * 100) / 100,
    1100
  );
  assert.equal(breakdown.hasChantier, true);
});

run('ventile en multi-TVA et signale un devis sans chantier', () => {
  const multi = computeContractBreakdown({
    totalHT: 2000,
    totalTva: 300,
    totalTTC: 2300,
    chantierByRate: [
      { rate: 10, totalHT: 250 },
      { rate: 20, totalHT: 100 },
    ],
  });
  assert.equal(multi.chantier.totalHT, 350);
  assert.equal(multi.chantier.tva, 45);
  assert.equal(multi.chantier.totalTTC, 395);
  assert.equal(multi.fabrication.totalTTC, 1905);

  const empty = computeContractBreakdown({
    totalHT: 500,
    totalTva: 50,
    totalTTC: 550,
    chantierByRate: [],
  });
  assert.equal(empty.hasChantier, false);
  assert.equal(empty.fabrication.totalTTC, 550);
  assert.equal(empty.chantier.totalTTC, 0);
});

console.log('Tous les tests de natures de ligne et ventilation ont reussi.');
