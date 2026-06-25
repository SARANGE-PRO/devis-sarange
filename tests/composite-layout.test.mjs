import assert from 'node:assert/strict';
import {
  makeLeaf,
  makeSplit,
  computeCompositeLayout,
  collapseSingleChild,
  rowsToTree,
  collectLeaves,
  firstLeafId,
  findNode,
  replaceNodeById,
  removeNodeById,
  treeToRows,
  isLeaf,
} from '../lib/composite-layout.mjs';

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
const L = (id, w, h) => makeLeaf(id, { productId: 'x', widthMm: w, heightMm: h });

run("cas utilisateur : fixe haut a cote d'une colonne fenetre+fixe", () => {
  const tree = makeSplit('r', 'h', [
    L('a', 200, 1105),
    makeSplit('c', 'v', [L('b', 400, 705), L('d', 400, 400)]),
  ]);
  const lay = computeCompositeLayout(tree);
  assert.equal(lay.widthMm, 600);
  assert.equal(lay.heightMm, 1105);
  const by = Object.fromEntries(lay.leaves.map((l) => [l.id, l]));
  assert.deepEqual([by.a.xMm, by.a.yMm, by.a.widthMm, by.a.heightMm], [0, 0, 200, 1105]);
  assert.deepEqual([by.b.xMm, by.b.yMm, by.b.widthMm, by.b.heightMm], [200, 0, 400, 705]);
  assert.deepEqual([by.d.xMm, by.d.yMm, by.d.widthMm, by.d.heightMm], [200, 705, 400, 400]);
});

run('division mono-enfant fusionnee (collapse)', () => {
  const collapsed = collapseSingleChild(
    makeSplit('z', 'v', [makeSplit('z2', 'h', [L('e', 100, 100)])])
  );
  assert.ok(isLeaf(collapsed));
  assert.equal(collapsed.id, 'e');
});

run('equivalence anciennes rangees (rowsToTree)', () => {
  const rows = [
    {
      id: 'row-1',
      modules: [
        { id: 'm1', productId: 'a', widthMm: 800, heightMm: 1250 },
        { id: 'm2', productId: 'b', widthMm: 600, heightMm: 1250 },
      ],
    },
    { id: 'row-2', modules: [{ id: 'm3', productId: 'c', widthMm: 1400, heightMm: 400 }] },
  ];
  const tree = rowsToTree(rows);
  const lay = computeCompositeLayout(tree);
  // ancien modele : largeur = max(somme par rangee) = 1400 ; hauteur = somme(max par rangee) = 1650
  assert.equal(lay.widthMm, 1400);
  assert.equal(lay.heightMm, 1650);
  assert.deepEqual(
    collectLeaves(tree).map((l) => l.id),
    ['m1', 'm2', 'm3']
  );
});

run('diviser puis supprimer -> fusion (replace/remove)', () => {
  let tree = L('root', 1000, 1000);
  const split = makeSplit('s1', 'h', [
    makeLeaf('root', { productId: 'x', widthMm: 500, heightMm: 1000 }),
    L('new', 500, 1000),
  ]);
  tree = replaceNodeById(tree, 'root', () => split);
  assert.equal(collectLeaves(tree).length, 2);
  tree = removeNodeById(tree, 'new');
  assert.ok(isLeaf(tree));
  assert.equal(tree.id, 'root');
});

run('firstLeafId / findNode', () => {
  const tree = makeSplit('r', 'h', [
    L('a', 1, 1),
    makeSplit('c', 'v', [L('b', 1, 1), L('d', 1, 1)]),
  ]);
  assert.equal(firstLeafId(tree), 'a');
  assert.equal(findNode(tree, 'd').node.id, 'd');
  assert.equal(findNode(tree, 'd').parent.id, 'c');
});

run('treeToRows : v-de-h exact', () => {
  const vOfH = makeSplit('v', 'v', [
    makeSplit('h1', 'h', [L('a', 1, 1), L('b', 1, 1)]),
    L('c', 1, 1),
  ]);
  const rows = treeToRows(vOfH);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].modules.length, 2);
  assert.equal(rows[1].modules.length, 1);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
