import assert from 'node:assert/strict';
import { rowsToTree, collectLeaves } from '../lib/composite-layout.mjs';

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

// La migration ancien->nouveau (lib/products.js) convertit les rangees en arbre
// via rowsToTree puis applique createCompositeModule par feuille — exactement
// comme l'ancien chemin appliquait createCompositeModule puis buildModulePricingData
// par module. La PARITE DE PRIX repose donc sur un seul fait : la migration
// produit la MEME liste de modules, dans le MEME ordre. On le prouve ici.
run('parite prix : feuilles migrees identiques a l aplatissement ancien', () => {
  const rows = [
    {
      id: 'row-1',
      modules: [
        { id: 'm1', productId: 'fenetre-1v', widthMm: 800, heightMm: 1250, options: { a: 1 } },
        { id: 'm2', productId: 'fenetre-fixe', widthMm: 600, heightMm: 1250, options: {} },
      ],
    },
    {
      id: 'row-2',
      modules: [{ id: 'm3', productId: 'fenetre-soufflet', widthMm: 1400, heightMm: 400, options: {} }],
    },
  ];

  const oldFlat = rows.flatMap((row) => row.modules); // ancien aplatissement
  const newLeaves = collectLeaves(rowsToTree(rows)).map((leaf) => leaf.module);

  assert.equal(newLeaves.length, oldFlat.length);
  newLeaves.forEach((module, index) => {
    assert.equal(module.productId, oldFlat[index].productId);
    assert.equal(module.widthMm, oldFlat[index].widthMm);
    assert.equal(module.heightMm, oldFlat[index].heightMm);
  });
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
