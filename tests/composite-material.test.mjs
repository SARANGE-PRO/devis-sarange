// Changement de matériau d'un châssis composé (PVC <-> aluminium).
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/composite-material.test.mjs
//
// Le bouton PVC / Aluminium du constructeur s'applique à l'ensemble : chaque
// châssis déjà placé doit passer sur sa déclinaison du matériau et repartir
// sur le vitrage standard du matériau. Avant, seul le catalogue changeait et
// un composé alu repassé en PVC restait chiffré et désigné en aluminium.
import assert from 'node:assert/strict';

const { createDefaultFrame, computeOpenings, placeChassis } = await import(
  '../lib/composite-frame.mjs'
);
const { applyCompositeFrameMaterial, getCompositeFrameModules, getProductById } = await import(
  '../lib/products.js'
);
const { getDefaultGlazingId } = await import('../lib/glazing.js');

let passed = 0;
let failed = 0;
const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL - ${name}\n`, error.message);
    failed += 1;
  }
};

const buildAluFrame = () => {
  const frame = createDefaultFrame(2000, 1500, 1, 0);
  const [a, b] = computeOpenings(frame).openings;
  let alu = placeChassis(frame, a.id, a, {
    productId: 'fenetre-1v-alu',
    options: {
      glazingId: getDefaultGlazingId('alu'),
      colorOptionId: 'coloration-2f',
      sashOptions: { 0: { oscilloBattant: true } },
    },
  });
  alu = placeChassis(alu, b.id, b, {
    productId: 'fenetre-fixe-alu',
    options: { glazingId: getDefaultGlazingId('alu') },
  });
  return { alu, a, b };
};

run('alu -> PVC : chaque chassis place passe sur sa declinaison PVC', () => {
  const { alu, a, b } = buildAluFrame();
  const pvc = applyCompositeFrameMaterial(alu, 'pvc');
  assert.equal(pvc.placements[a.id].productId, 'fenetre-1v');
  assert.equal(pvc.placements[b.id].productId, 'fenetre-fixe');
  // Vitrage standard du nouveau materiau, le reste de la configuration conserve.
  assert.equal(pvc.placements[a.id].options.glazingId, getDefaultGlazingId('pvc'));
  assert.equal(pvc.placements[a.id].options.colorOptionId, 'coloration-2f');
  assert.deepEqual(pvc.placements[a.id].options.sashOptions, { 0: { oscilloBattant: true } });
  // Les modules tarifes et designes suivent : plus aucun produit aluminium.
  const modules = getCompositeFrameModules(pvc);
  assert.equal(modules.length, 2);
  modules.forEach((module) => {
    assert.equal(getProductById(module.productId)?.material, 'pvc');
  });
  // L'ossature d'origine n'est pas modifiee.
  assert.equal(alu.placements[a.id].productId, 'fenetre-1v-alu');
});

run('PVC -> alu : retour sur les jumeaux alu et le vitrage alu', () => {
  const { alu, a, b } = buildAluFrame();
  const pvc = applyCompositeFrameMaterial(alu, 'pvc');
  const back = applyCompositeFrameMaterial(pvc, 'alu');
  assert.equal(back.placements[a.id].productId, 'fenetre-1v-alu');
  assert.equal(back.placements[b.id].productId, 'fenetre-fixe-alu');
  assert.equal(back.placements[a.id].options.glazingId, getDefaultGlazingId('alu'));
  getCompositeFrameModules(back).forEach((module) => {
    assert.equal(getProductById(module.productId)?.material, 'alu');
  });
});

run('meme materiau : rien ne casse, ouverture sans chassis ignoree', () => {
  const { alu, a } = buildAluFrame();
  const same = applyCompositeFrameMaterial(alu, 'alu');
  assert.equal(same.placements[a.id].productId, 'fenetre-1v-alu');
  const empty = applyCompositeFrameMaterial(createDefaultFrame(1000, 1000, 0, 0), 'pvc');
  assert.deepEqual(empty.placements, {});
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
