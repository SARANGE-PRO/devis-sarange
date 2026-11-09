// Sens d'ouverture en mots de fabricant, déduit du schéma (vue intérieure).
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/opening-direction.test.mjs
//
// « Ouverture inversée » ne disait pas de quel côté la menuiserie ouvre. Le
// devis parle maintenant comme les fabricants : tirant droit / gauche, vantail
// principal, vantail de service, refoulement ; et le texte vient des vantaux
// tels qu'ils sont dessinés, donc jamais en contradiction avec le schéma.
import assert from 'node:assert/strict';

const { describeOpeningDirection, buildMenuiserieConfig } = await import('../lib/menuiserie.js');
const { describeSashesOpening } = await import('../lib/opening-direction.mjs');
const { generateDesignation } = await import('../lib/designation-generator.js');
const { CATEGORIES, getCompositeFrameModules } = await import('../lib/products.js');
const { createDefaultFrame, computeOpenings, placeChassis } = await import(
  '../lib/composite-frame.mjs'
);

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

const describe = (sheetName, openingDirection = 'standard') =>
  describeOpeningDirection({ sheetName, openingDirection });

const porte = CATEGORIES.flatMap((category) => category.products).find(
  (product) => product.sheet?.startsWith('Porte Entrée') && product.material !== 'alu'
);

run('fenêtre 1 vantail : tirant droit en standard (poignée à gauche), tirant gauche inversé', () => {
  assert.equal(describe('Fenêtre 1V').short, 'tirant droit');
  assert.equal(describe('Fenêtre 1V').line, "Sens d'ouverture : tirant droit, vue intérieure");
  assert.equal(describe('Fenêtre 1V', 'inverse').short, 'tirant gauche');
  // La déclinaison aluminium partage la géométrie.
  assert.equal(describe('Fenêtre 1V ALU', 'inverse').short, 'tirant gauche');
  assert.equal(describe('Porte-Fenêtre 1V').short, 'tirant droit');
});

run('2 vantaux et plus : le vantail principal (poignée) donne le sens', () => {
  assert.equal(describe('Fenêtre 2V').short, 'tirant droit, vantail principal à droite');
  assert.equal(
    describe('Fenêtre 2V', 'inverse').line,
    "Sens d'ouverture : tirant gauche, vantail principal à gauche, vue intérieure"
  );
  assert.equal(describe('Porte-Fenêtre 2V+1F').short, 'tirant droit, vantail principal à droite');
  assert.equal(describe('Fenêtre 3V', 'inverse').short, 'tirant gauche, vantail principal à gauche');
});

run("porte d'entrée : tirant vue intérieure et poussant vue extérieure", () => {
  assert.ok(porte, 'un produit porte d entrée PVC existe');
  const standard = describe(porte.sheet);
  assert.equal(standard.short, 'tirant gauche');
  assert.equal(
    standard.line,
    "Sens d'ouverture : tirant gauche vue intérieure (poussant droit vue extérieure)"
  );
  assert.equal(describe(porte.sheet, 'inverse').short, 'tirant droit');
});

run('sans sens d ouverture : fixe, soufflet, volet', () => {
  assert.equal(describe('Fenêtre Fixe'), null);
  assert.equal(describe('Fenêtre Fixe', 'inverse'), null);
  assert.equal(describe('Fenêtre Soufflet'), null);
  assert.equal(describe('Volet Filaire'), null);
  assert.equal(describeSashesOpening([], {}), null);
});

run('coulissants : vantail de service, ou ouverture centrale quand tout est symétrique', () => {
  assert.equal(describe('Coulissant 2 vantaux 2 rails').short, 'vantail de service à droite');
  assert.equal(
    describe('Coulissant 2 vantaux 2 rails', 'inverse').line,
    "Sens d'ouverture : vantail de service à gauche, vue intérieure"
  );
  assert.equal(describe('Coulissant 3 vantaux').short, 'vantail de service à droite');
  assert.equal(describe('Coulissant 3 vantaux', 'inverse').short, 'vantail de service à gauche');
  const four = describe('Coulissant 4 vantaux');
  assert.equal(four.short, 'ouverture centrale');
  assert.equal(four.symmetric, true);
  assert.equal(describe('Coulissant 4 vantaux', 'inverse').short, 'ouverture centrale');
});

run('galandages : sens de refoulement dans la cloison', () => {
  assert.equal(describe('Galandage 1 vantail').short, 'refoulement à droite');
  assert.equal(describe('Galandage 1 vantail', 'inverse').short, 'refoulement à gauche');
  const two = describe('Galandage 2 vantaux');
  assert.equal(two.short, "refoulement de part et d'autre");
  assert.equal(two.symmetric, true);
  assert.equal(describe('Galandage 3 vantaux').short, 'refoulement 1 vantail à gauche, 2 à droite');
  assert.equal(
    describe('Galandage 3 vantaux', 'inverse').short,
    'refoulement 2 vantaux à gauche, 1 à droite'
  );
});

run('inversion du dessin : les quatre flèches des coulissants sont retournées', () => {
  const config = buildMenuiserieConfig({
    sheetName: 'Coulissant 3 vantaux',
    width: 3000,
    height: 2150,
    options: { openingDirection: 'inverse' },
  });
  assert.deepEqual(
    config.sashes.map((sash) => sash.symbols),
    [['arrow-right'], ['arrow-left'], ['arrow-left-outline']]
  );
  assert.deepEqual(config.sashes.map((sash) => sash.handle), ['left', 'right', 'right']);
});

run('désignation simple : la ligne « Sens d ouverture » suit les dimensions, plus d « inversée »', () => {
  const item = {
    productId: 'fenetre-1v',
    sheetName: 'Fenêtre 1V',
    material: 'pvc',
    widthMm: 1200,
    heightMm: 1350,
    openingDirection: 'inverse',
  };
  const lines = generateDesignation(item).split('\n');
  assert.equal(lines[1], '1200 x 1350 L*H mm');
  assert.equal(lines[2], "Sens d'ouverture : tirant gauche, vue intérieure");
  assert.ok(!/invers/i.test(lines.join('\n')));
  const standard = generateDesignation({ ...item, openingDirection: 'standard' });
  assert.ok(standard.includes("Sens d'ouverture : tirant droit, vue intérieure"));
  // Produit sans sens : aucune ligne.
  const fixe = generateDesignation({ ...item, productId: 'fenetre-fixe', sheetName: 'Fenêtre Fixe' });
  assert.ok(!fixe.includes("Sens d'ouverture"));
});

run('désignation porte d entrée : tirant et poussant', () => {
  const designation = generateDesignation({
    productId: porte.id,
    sheetName: porte.sheet,
    material: 'pvc',
    widthMm: 900,
    heightMm: 2150,
    openingDirection: 'standard',
  });
  assert.ok(
    designation.includes("Sens d'ouverture : tirant gauche vue intérieure (poussant droit vue extérieure)"),
    designation
  );
});

run('châssis composé : forme courte par châssis, rien sur un fixe', () => {
  const frame = createDefaultFrame(2000, 1500, 1, 0);
  const [a, b] = computeOpenings(frame).openings;
  let next = placeChassis(frame, a.id, a, {
    productId: 'fenetre-1v',
    options: { openingDirection: 'inverse' },
  });
  next = placeChassis(next, b.id, b, { productId: 'fenetre-fixe' });
  const item = {
    isComposite: true,
    productId: 'composite-builder',
    material: 'pvc',
    widthMm: 2000,
    heightMm: 1500,
    compositeFrame: next,
    modules: getCompositeFrameModules(next),
  };
  const designation = generateDesignation(item);
  const lines = designation.split('\n');
  const window = lines.find((line) => line.includes('Fenêtre 1 vantail'));
  const fixe = lines.find((line) => line.includes('Fenêtre fixe'));
  assert.ok(window && window.endsWith(' - tirant gauche'), window);
  assert.ok(fixe && !/tirant/.test(fixe), fixe);
  assert.ok(!/invers/i.test(designation));
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
