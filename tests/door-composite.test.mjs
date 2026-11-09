// Portes d'entrée avec tierce et/ou imposte (lib/door-composite.mjs).
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/door-composite.test.mjs
//
// Les produits préconfigurés de l'onglet Portes deviennent un châssis composé
// construit automatiquement : la porte sur la grille porte, la tierce et
// l'imposte sur la grille « Fenêtre Fixe », prix = somme des parties comme pour
// un composé, pose porte, règle TVA de la porte, désignation de porte avec ses
// parties. La porte « neuf » a disparu : une seule grille porte, avec alias
// pour les devis enregistrés.
import assert from 'node:assert/strict';

const {
  DOOR_COMPOSITE_DEFAULTS,
  buildDoorCompositeCartItem,
  buildDoorCompositeFrame,
  describeDoorCompositeFrame,
  describeDoorCompositeParts,
  doorCompositeSuffix,
  getDoorCompositePreset,
  getDoorCompositePresetId,
} = await import('../lib/door-composite.mjs');
const {
  CATEGORIES,
  calculateItemPrice,
  getCompositeFramePricing,
  getItemDecoDoors,
  getPriceForMm,
  getProductById,
  normalizeCompositeFrame,
  normalizeSheetName,
  resolveLegacyProductId,
} = await import('../lib/products.js');
const { computeOpenings } = await import('../lib/composite-frame.mjs');
const { generateDesignation } = await import('../lib/designation-generator.js');
const { buildPoseLabel, resolvePoseKind } = await import('../lib/pose-designation.mjs');
const { classifyVatLine, VAT_LINE_CATEGORIES } = await import('../lib/vat-window-eligibility.mjs');
const { buildPanelSelections } = await import('../lib/panel-selections.mjs');

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

const DOOR = getPriceForMm('Porte Entrée RENO', 2150, 900).price; // 1027
const TIERCE = getPriceForMm('Fenêtre Fixe', 2150, 400).price; // 259
const IMPOSTE = getPriceForMm('Fenêtre Fixe', 300, 1300).price; // 201 (facturée 35 x 130)

run('catalogue : une seule porte et trois portes avec parties fixes, en PVC et en alu', () => {
  const portes = CATEGORIES.find((category) => category.id === 'portes').products.map((product) => product.id);
  assert.deepEqual(portes, [
    'porte-reno', 'porte-tierce', 'porte-imposte', 'porte-tierce-imposte',
    'porte-reno-alu', 'porte-tierce-alu', 'porte-imposte-alu', 'porte-tierce-imposte-alu',
  ]);
  assert.equal(getProductById('porte-reno').label, "Porte d'entrée");
  assert.deepEqual(getDoorCompositePreset('porte-tierce-imposte-alu'), { tierce: true, imposte: true });
  assert.equal(getDoorCompositePreset('porte-reno'), null);
  // Adossées à la porte : même feuille, même coefficient, jamais dans un composé.
  const preset = getProductById('porte-tierce');
  assert.equal(preset.sheet, 'Porte Entrée RENO');
  assert.equal(preset.coefficientSource, 'porte-reno');
  assert.equal(preset.compositeEligible, false);
  assert.equal(getProductById('porte-tierce-alu').coefficientSource, 'porte-reno-alu');
  assert.equal(getDoorCompositePresetId({ tierce: true, imposte: false, material: 'alu' }), 'porte-tierce-alu');
  assert.equal(getDoorCompositePresetId({ tierce: false, imposte: true }), 'porte-imposte');
  assert.equal(getDoorCompositePresetId({ tierce: false, imposte: false }), null);
});

run('porte « neuf » retirée : les anciens devis se relisent sur la porte unique et sa grille', () => {
  assert.equal(getProductById('porte-neuf').id, 'porte-reno');
  assert.equal(getProductById('porte-neuf-alu').id, 'porte-reno-alu');
  assert.equal(getProductById('porte-neuf-cintre').id, 'porte-reno-cintre');
  assert.equal(resolveLegacyProductId('fenetre-1v'), 'fenetre-1v');
  assert.equal(normalizeSheetName('Porte Entrée NEUF'), 'Porte Entrée RENO');
  assert.equal(normalizeSheetName('Porte Entrée NEUF ALU'), 'Porte Entrée RENO ALU');
  assert.equal(getPriceForMm('Porte Entrée NEUF', 2150, 900).price, DOOR);
  assert.equal(CATEGORIES.some((category) => category.products.some((product) => /porte-neuf/.test(product.id))), false);
});

run('ossature : porte en bas, tierce à côté sur la hauteur de la porte, imposte au-dessus sur toute la largeur', () => {
  const frame = buildDoorCompositeFrame({
    doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, imposteHeightMm: 300, tierceSide: 'right',
  });
  assert.equal(frame.overallWidthMm, 1300);
  assert.equal(frame.overallHeightMm, 2450);
  assert.deepEqual(frame.columns.map((band) => band.value), [900, 400]);
  assert.deepEqual(frame.rows.map((band) => band.value), [300, 2150]);
  const { openings } = computeOpenings(frame);
  assert.equal(openings.length, 3, 'trois ouvertures : imposte, porte, tierce');
  const top = openings.find((opening) => opening.rMin === 0);
  assert.equal(top.wMm, 1300, 'l imposte traverse les deux colonnes');
  const placed = Object.values(frame.placements).map((placement) => placement.productId).sort();
  assert.deepEqual(placed, ['fenetre-fixe', 'fenetre-fixe', 'porte-reno']);
  // Relecture : la même structure, le même produit préconfiguré.
  const structure = describeDoorCompositeFrame(frame);
  assert.equal(structure.doorWidthMm, 900);
  assert.equal(structure.doorHeightMm, 2150);
  assert.equal(structure.tierceWidthMm, 400);
  assert.equal(structure.imposteHeightMm, 300);
  assert.equal(structure.tierceSide, 'right');
  assert.equal(structure.presetId, 'porte-tierce-imposte');
  // Tierce à gauche, en aluminium.
  const left = buildDoorCompositeFrame({ doorWidthMm: 1000, doorHeightMm: 2100, tierceWidthMm: 500, tierceSide: 'left', material: 'alu' });
  assert.deepEqual(left.columns.map((band) => band.value), [500, 1000]);
  const leftStructure = describeDoorCompositeFrame(left);
  assert.equal(leftStructure.tierceSide, 'left');
  assert.equal(leftStructure.material, 'alu');
  assert.equal(leftStructure.presetId, 'porte-tierce-alu');
  assert.equal(leftStructure.imposte, null);
  // Sans cotes de porte : rien à construire.
  assert.equal(buildDoorCompositeFrame({ doorWidthMm: 0, doorHeightMm: 2150, tierceWidthMm: 400 }), null);
});

run('relecture : un composé ordinaire n est jamais pris pour une porte avec parties fixes', () => {
  const twoWindows = normalizeCompositeFrame({
    modules: [{ productId: 'fenetre-1v', widthMm: 800, heightMm: 1200 }, { productId: 'fenetre-fixe', widthMm: 400, heightMm: 1200 }],
  });
  assert.equal(describeDoorCompositeFrame(twoWindows), null);
  const twoDoors = normalizeCompositeFrame({
    modules: [{ productId: 'porte-reno', widthMm: 900, heightMm: 2150 }, { productId: 'porte-reno', widthMm: 900, heightMm: 2150 }],
  });
  assert.equal(describeDoorCompositeFrame(twoDoors), null);
  const doorAndWindow = normalizeCompositeFrame({
    modules: [{ productId: 'porte-reno', widthMm: 900, heightMm: 2150 }, { productId: 'fenetre-1v', widthMm: 600, heightMm: 2150 }],
  });
  assert.equal(describeDoorCompositeFrame(doorAndWindow), null, 'un ouvrant à côté n est pas une tierce');
  // Une porte seule dans une ossature : pas de partie fixe, pas un produit préconfiguré.
  const doorOnly = normalizeCompositeFrame({ modules: [{ productId: 'porte-reno', widthMm: 900, heightMm: 2150 }] });
  const structure = describeDoorCompositeFrame(doorOnly);
  assert.equal(structure.presetId, null);
  assert.equal(doorCompositeSuffix(structure), '');
  assert.equal(describeDoorCompositeFrame(null), null);
});

run('article : prix = porte + tierce + imposte comme un composé, pose porte, dimensions hors tout', () => {
  const built = buildDoorCompositeCartItem({
    id: 'item-1',
    productId: 'porte-tierce-imposte',
    doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, imposteHeightMm: 300,
    includePose: true,
  });
  const { item, pricing } = built;
  assert.equal(item.isComposite, true);
  assert.equal(item.productId, 'porte-tierce-imposte');
  assert.equal(item.productLabel, "Porte d'entrée + tierce et imposte");
  assert.equal(item.widthMm, 1300);
  assert.equal(item.heightMm, 2450);
  assert.equal(pricing.hasOutOfGrid, false);
  assert.equal(item.unitPrice, DOOR + TIERCE + IMPOSTE);
  assert.deepEqual(
    pricing.modules.map((module) => `${module.productId} ${module.widthMm}x${module.heightMm}`).sort(),
    ['fenetre-fixe 1300x300', 'fenetre-fixe 400x2150', 'porte-reno 900x2150']
  );
  assert.deepEqual(item.doorComposite, {
    doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, imposteHeightMm: 300, tierceSide: 'right',
  });
  // Même calcul que le constructeur de composés.
  assert.equal(getCompositeFramePricing(item.compositeFrame).totalPrice, item.unitPrice);
  const calc = calculateItemPrice(item);
  assert.equal(calc.unitPriceWithOptions, DOOR + TIERCE + IMPOSTE);
  assert.equal(calc.posePrice, 400, 'pose porte, pas pose menuiserie');
  assert.equal(item.modules.length, 3);
  assert.ok(item.modules.every((module) => module.productLabel && module.marketingFinition));
  // Thermique : les parties vitrées (porte vitrée + fixes) donnent un Uw.
  assert.ok(Number.isFinite(item.thermalUw));
});

run('article : cotes des parties par défaut (celles du site), vitrage des fixes, panneau décoratif, coloration', () => {
  const built = buildDoorCompositeCartItem({
    id: 'item-2',
    productId: 'porte-tierce',
    doorWidthMm: 900, doorHeightMm: 2150,
    doorOptions: { panneauDecoratif: true, openingDirection: 'inverse' },
    colorOptionId: 'coloration-2f',
    rawColorState: { color2fType: 'standard_7016' },
    panelChoice: { panelName: 'REVA 62', couleur: 'Gris Anthracite (RAL 7016) - 2 faces', plusValueTotaleHT: 10 },
    manualUd: 1.4,
  });
  const { item, frame } = built;
  assert.equal(item.doorComposite.tierceWidthMm, DOOR_COMPOSITE_DEFAULTS.tierceWidthMm);
  assert.equal(item.doorComposite.imposteHeightMm, 0);
  assert.equal(item.widthMm, 1300);
  // Chaque châssis porte la coloration de l'ensemble (prix et finition).
  const placements = Object.values(frame.placements);
  assert.ok(placements.every((placement) => placement.options.colorOptionId === 'coloration-2f'));
  assert.equal(item.marketingFinition, 'Finition : Gris 7016 2 faces');
  assert.equal(item.colorOption.id, 'coloration-2f');
  // Porte à panneau décoratif : les fixes prennent le vitrage standard, la
  // porte garde son panneau, le sens d'ouverture et le panneau choisi.
  const door = placements.find((placement) => placement.productId === 'porte-reno');
  const fixe = placements.find((placement) => placement.productId === 'fenetre-fixe');
  assert.equal(door.options.panneauDecoratif, true);
  assert.equal(door.options.openingDirection, 'inverse');
  assert.equal(door.options.panelChoice.panelName, 'REVA 62');
  assert.equal(fixe.options.glazingId, 'rg-vi01-pvc');
  assert.equal(item.panneauDecoratif, true);
  assert.equal(item.manualUd, 1.4);
  // Prix : panneau décoratif compté une fois, sur la porte.
  const unitDoorAlone = buildDoorCompositeCartItem({
    id: 'x', productId: 'porte-tierce', doorWidthMm: 900, doorHeightMm: 2150, colorOptionId: 'coloration-2f',
  }).item.unitPrice;
  assert.ok(item.unitPrice > unitDoorAlone);
  // Signature : la porte du composé est une porte à panneau, avec le panneau du site déjà choisi.
  const [selection] = buildPanelSelections([item]);
  assert.equal(selection.lineId, `item-2:${door.id}`);
  assert.equal(selection.preset.panelName, 'REVA 62');
  assert.equal(getItemDecoDoors(item).length, 1);
  // Vitrage des fixes choisi : repris tel quel.
  const opaque = buildDoorCompositeCartItem({
    id: 'item-3', productId: 'porte-imposte', doorWidthMm: 900, doorHeightMm: 2150, imposteHeightMm: 350, fixesGlazingId: 'rg-vi01-pvc',
  });
  assert.equal(Object.values(opaque.frame.placements).find((p) => p.productId === 'fenetre-fixe').options.glazingId, 'rg-vi01-pvc');
  assert.equal(opaque.item.doorComposite.tierceSide, null);
});

run('article : hors grille (porte de 1200 de large) signalé comme pour un composé, tarif de repli forçable', () => {
  const built = buildDoorCompositeCartItem({
    id: 'item-4', productId: 'porte-tierce', doorWidthMm: 1200, doorHeightMm: 2150, tierceWidthMm: 400,
  });
  assert.equal(built.pricing.totalPrice, null);
  assert.equal(built.pricing.hasOutOfGrid, true);
  assert.equal(built.pricing.isGeometryValid, true);
  assert.ok(built.pricing.forcedTotalPrice > TIERCE);
  assert.equal(built.item.unitPrice, 0, 'sans validation, pas de prix');
  const forced = buildDoorCompositeCartItem({
    id: 'item-4', productId: 'porte-tierce', doorWidthMm: 1200, doorHeightMm: 2150, tierceWidthMm: 400, forceOutOfGrid: true,
  });
  assert.equal(forced.item.unitPrice, built.pricing.forcedTotalPrice);
  assert.equal(forced.item.outOfGridPricing, true);
  // Produit inconnu ou sans parties fixes : rien.
  assert.equal(buildDoorCompositeCartItem({ id: 'x', productId: 'porte-reno', doorWidthMm: 900, doorHeightMm: 2150 }), null);
});

run('désignation : une porte « avec tierce et imposte », les cotes de chaque partie, une ligne par partie fixe', () => {
  const { item } = buildDoorCompositeCartItem({
    id: 'item-5', productId: 'porte-tierce-imposte', doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, imposteHeightMm: 300,
    doorOptions: { panneauDecoratif: true }, panelChoice: { panelName: 'ELA 01' },
  });
  const lines = generateDesignation(item, calculateItemPrice(item), {}).split('\n');
  assert.equal(lines[0], "Porte d'entrée Hybride Premium (Aluminium / PVC) avec tierce et imposte");
  assert.equal(lines[1], '1300 x 2450 L*H mm hors tout');
  assert.equal(lines[2], 'Composition : porte 900 x 2150 mm, tierce de 400 mm à droite, imposte de 300 mm');
  assert.ok(lines.some((line) => /^Sens d'ouverture : tirant/.test(line)));
  assert.ok(lines.some((line) => /^Conception : Panneau décoratif/.test(line)));
  assert.ok(lines.some((line) => /Panneau ELA 01/.test(line)));
  assert.ok(lines.some((line) => /^Tierce fixe à droite 400 x 2150 mm : Double vitrage/.test(line)), lines.join('|'));
  assert.ok(lines.some((line) => /^Imposte fixe 1300 x 300 mm : Double vitrage/.test(line)));
  assert.ok(lines.some((line) => /^Parties fixes : profilé 70 mm PVC/.test(line)));
  assert.ok(!lines.some((line) => /Chassis compose/.test(line)));
  // Alu, tierce à gauche, porte vitrée.
  const alu = buildDoorCompositeCartItem({
    id: 'item-6', productId: 'porte-tierce-alu', doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, tierceSide: 'left',
  }).item;
  const aluLines = generateDesignation(alu, calculateItemPrice(alu), {}).split('\n');
  assert.equal(aluLines[0], "Porte d'entrée aluminium Schüco avec tierce");
  assert.equal(aluLines[2], 'Composition : porte 900 x 2150 mm, tierce de 400 mm à gauche');
  assert.ok(aluLines.some((line) => /^Tierce fixe à gauche 400 x 2150 mm/.test(line)));
  assert.ok(aluLines.some((line) => /^Profilé aluminium Schüco/.test(line)));
  assert.equal(describeDoorCompositeParts({ tierceWidthMm: 0, imposteHeightMm: 300 }), 'imposte de 300 mm');
});

run('pose et TVA : posée et taxée comme une porte d entrée', () => {
  const { item } = buildDoorCompositeCartItem({
    id: 'item-7', productId: 'porte-tierce-imposte', doorWidthMm: 900, doorHeightMm: 2150, tierceWidthMm: 400, imposteHeightMm: 300,
  });
  assert.equal(resolvePoseKind(item), 'porte');
  assert.equal(buildPoseLabel(item), "Pose porte d'entrée avec tierce et imposte");
  assert.equal(buildPoseLabel({ isComposite: true, doorComposite: { tierceWidthMm: 400, imposteHeightMm: 0 } }), "Pose porte d'entrée avec tierce");
  assert.equal(buildPoseLabel({ isComposite: true }), 'Pose châssis composé');
  assert.equal(classifyVatLine(item), VAT_LINE_CATEGORIES.ENTRY_DOOR);
  assert.equal(classifyVatLine({ isComposite: true, sheetName: 'Châssis composé' }), VAT_LINE_CATEGORIES.WINDOW);
});

console.log(`\n${passed} OK, ${failed} KO`);
if (failed > 0) process.exit(1);
