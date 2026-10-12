import assert from 'node:assert/strict';

import {
  LEGACY_GLAZING_OPTIONS,
  MIN_BILLED_GLASS_AREA_M2,
  RIOU_COMPOSITIONS,
  buildRiouGlazingOptions,
  filterGlazingOptionsForMaterial,
  formatComposition,
  getGlazingGroupLabel,
} from '../lib/glazing-tariff.mjs';
import {
  ALU_DEFAULT_GLAZING_ID,
  DEFAULT_GLAZING_OPTIONS,
  MARKUP_COEFFICIENT,
  PANEL_SANDWICH_GLAZING_ID,
  PANEL_SANDWICH_PRICE_PER_M2,
  PVC_DEFAULT_GLAZING_ID,
  calculateGlassAreas,
  calculateGlazingAndPanelExtras,
  calculateGlazingExtra,
  getDefaultGlazingId,
  getFrameSystemForProduct,
  getGlazingExtraBasePricePerM2,
  getSelectedGlazing,
  sanitizeCustomGlazingOptions,
} from '../lib/glazing.js';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const roundToCents = (value) => Math.round(value * 100) / 100;
const byId = (id) => DEFAULT_GLAZING_OPTIONS.find((glazing) => glazing.id === id);

/* ─── Déclinaison du tarif Riou par matériau ─────────────────────────────── */

run('21 compositions Riou : 21 options PVC, 17 options alu (4 réservées au PVC 28)', () => {
  const options = buildRiouGlazingOptions();
  assert.equal(RIOU_COMPOSITIONS.length, 21);
  assert.equal(options.filter((glazing) => glazing.material === 'pvc').length, 21);
  assert.equal(options.filter((glazing) => glazing.material === 'alu').length, 17);
  assert.equal(new Set(options.map((glazing) => glazing.id)).size, options.length, 'identifiants uniques');
  assert.ok(options.every((glazing) => glazing.legacy === false && glazing.isThermalDataAvailable));
});

run('vitrage inclus : clair FE 4/20/4 en PVC, 4/16/4 en alu, 29 € + warm-edge + argon = 32 €/m²', () => {
  const pvc = byId(PVC_DEFAULT_GLAZING_ID);
  const alu = byId(ALU_DEFAULT_GLAZING_ID);
  assert.equal(PVC_DEFAULT_GLAZING_ID, 'rg-vi01-pvc');
  assert.equal(ALU_DEFAULT_GLAZING_ID, 'rg-vi01-alu');
  assert.equal(getDefaultGlazingId('pvc'), PVC_DEFAULT_GLAZING_ID);
  assert.equal(getDefaultGlazingId('alu'), ALU_DEFAULT_GLAZING_ID);
  assert.equal(pvc.label, 'Double vitrage isolant 4/20/4 FE ITR Argon WE (28 mm)');
  assert.equal(alu.label, 'Double vitrage isolant 4/16/4 FE ITR Argon WE (24 mm)');
  assert.equal(pvc.purchasePricePerM2, 32);
  assert.equal(alu.purchasePricePerM2, 32);
  assert.equal(pvc.riouPricePerM2, 29);
  assert.equal(pvc.thicknessMm, 28);
  assert.equal(alu.thicknessMm, 24);
  assert.equal(pvc.ug, 1.1);
  assert.equal(pvc.g, 0.65);
  assert.equal(pvc.rwDb, 30);
  assert.ok(pvc.isBaseIncluded && alu.isBaseIncluded);
});

run('libellés, épaisseurs et Ug par matériau', () => {
  const feuillete = byId('rg-vi11-pvc');
  assert.equal(feuillete.shortLabel, 'Feuilleté 44.2 (4 FE/15/44.2)');
  assert.equal(feuillete.label, 'Double vitrage isolant feuilleté 4 FE/15/44.2 ITR Argon WE (28 mm)');
  assert.equal(feuillete.purchasePricePerM2, 54);
  assert.equal(byId('rg-vi11-alu').ug, 1.3, 'lame de 11 mm en alu');
  assert.equal(byId('rg-vi10-pvc').thicknessMm, 28, '4 + 17,5 + 6,4 = 27,9 → 28');
  assert.equal(byId('rg-vi19-alu').ug, 2.0);
  assert.equal(byId('rg-vi19-alu').thicknessMm, 24, '8,8 + 6 + 8,8 = 23,6 → 24');
  assert.equal(formatComposition(RIOU_COMPOSITIONS.find((c) => c.code === 'VI-21'), 'pvc'), '10/14/4 FE');
  assert.equal(formatComposition(RIOU_COMPOSITIONS.find((c) => c.code === 'VI-21'), 'alu'), '10/10/4 FE');
});

run('triple vitrage : PVC seulement, warm-edge et argon comptés sur les deux lames', () => {
  const triple = byId('rg-tv01-pvc');
  assert.ok(triple);
  assert.equal(byId('rg-tv01-alu'), undefined);
  assert.equal(triple.lames, 2);
  assert.equal(triple.purchasePricePerM2, roundToCents(104.73 + 2 * 3));
  assert.equal(triple.label, 'Triple vitrage isolant 4 FE/8/4/8/4 FE ITR Argon WE (28 mm)');
  assert.equal(byId('rg-vi25-alu'), undefined, 'acoustique Silence 10/44.2 réservé au PVC');
});

/* ─── Anciens vitrages : résolus, inchangés, jamais proposés ─────────────── */

run('les anciens identifiants se résolvent toujours, à l’identique', () => {
  assert.equal(LEGACY_GLAZING_OPTIONS.length, 11);
  const ancien = getSelectedGlazing('dv_33_2_18_4');
  assert.equal(ancien.id, 'dv_33_2_18_4');
  assert.equal(ancien.legacy, true);
  assert.equal(ancien.label, 'Double vitrage isolant feuillete 33.2/18/4 ITR Argon WE (28 mm)');
  assert.equal(ancien.purchasePricePerM2, 67);
  assert.equal(ancien.ug, 1.1);
  assert.equal(getSelectedGlazing('dv_4_20_4_argon_we').isBaseIncluded, true);
  assert.equal(getGlazingGroupLabel(ancien), 'Anciens vitrages (devis antérieurs)');
});

run('filtre par matériau : jamais un ancien vitrage, sauf celui déjà retenu par l’article', () => {
  const pvc = filterGlazingOptionsForMaterial(DEFAULT_GLAZING_OPTIONS, { material: 'pvc' });
  assert.ok(pvc.every((glazing) => !glazing.legacy));
  assert.ok(pvc.every((glazing) => !glazing.material || glazing.material === 'pvc'));
  assert.ok(pvc.some((glazing) => glazing.id === PVC_DEFAULT_GLAZING_ID));
  assert.ok(!pvc.some((glazing) => glazing.id === ALU_DEFAULT_GLAZING_ID));

  const withLegacy = filterGlazingOptionsForMaterial(DEFAULT_GLAZING_OPTIONS, {
    material: 'pvc',
    selectedId: 'dv_33_2_18_4',
  });
  assert.equal(withLegacy.filter((glazing) => glazing.legacy).length, 1);
  assert.equal(withLegacy.find((glazing) => glazing.legacy).id, 'dv_33_2_18_4');

  const custom = { id: 'custom-glazing-x', label: 'Perso', shortLabel: 'Perso', purchasePricePerM2: 90 };
  assert.ok(filterGlazingOptionsForMaterial([custom], { material: 'alu' }).length === 1, 'vitrage perso : tous matériaux');
});

run('un vitrage personnalisé ne peut pas reprendre un identifiant natif, nouveau ou ancien', () => {
  const sanitized = sanitizeCustomGlazingOptions([
    { id: PVC_DEFAULT_GLAZING_ID, label: 'Conflit', shortLabel: 'Conflit' },
    { id: 'dv_4_20_4_argon_we', label: 'Conflit ancien', shortLabel: 'Conflit' },
    { id: 'custom-glazing-ok', label: 'OK', shortLabel: 'OK', purchasePricePerM2: 80 },
  ]);
  assert.deepEqual(sanitized.map((glazing) => glazing.id), ['custom-glazing-ok']);
});

/* ─── Surcoûts : base = vitrage inclus du matériau, minimum 0,45 m² ──────── */

const areasFor = (sheet, w, h) => calculateGlassAreas(w, h, getFrameSystemForProduct(sheet), sheet);

run('base des surcoûts : 32 €/m² pour le tarif courant, 37 €/m² pour les anciens vitrages et le panneau PVC', () => {
  assert.equal(getGlazingExtraBasePricePerM2('rg-vi11-pvc', 'pvc'), 32);
  assert.equal(getGlazingExtraBasePricePerM2('rg-vi11-alu', 'alu'), 32);
  assert.equal(getGlazingExtraBasePricePerM2('dv_33_2_18_4', 'pvc'), 37);
  assert.equal(getGlazingExtraBasePricePerM2(PANEL_SANDWICH_GLAZING_ID, 'pvc'), 37);
});

run('feuilleté 44.2 PVC sur une fenêtre 1V 1000×1200 : (54 − 32) × Ag × 2,88', () => {
  const sheet = 'Fenêtre 1V';
  const glassAreas = areasFor(sheet, 1000, 1200);
  const result = calculateGlazingAndPanelExtras({
    selectedGlazing: 'rg-vi11-pvc',
    glassAreas,
    widthMm: 1000,
    sheetName: sheet,
  });
  assert.ok(glassAreas.Ag > MIN_BILLED_GLASS_AREA_M2);
  assert.equal(result.glazingExtra, roundToCents((54 - 32) * glassAreas.Ag * MARKUP_COEFFICIENT));
  assert.equal(result.totalExtra, result.glazingExtra);
});

run('vitrage inclus : aucun surcoût, en PVC comme en alu', () => {
  const sheet = 'Fenêtre 1V ALU';
  const glassAreas = areasFor(sheet, 1000, 1200);
  const result = calculateGlazingAndPanelExtras({
    selectedGlazing: ALU_DEFAULT_GLAZING_ID,
    glassAreas,
    widthMm: 1000,
    isAlu: true,
    sheetName: sheet,
  });
  assert.equal(result.glazingExtra, 0);
});

run('petit châssis : minimum de facturation 0,45 m² par volume sur le tarif courant, pas sur un ancien vitrage', () => {
  const sheet = 'Fenêtre 1V';
  const glassAreas = areasFor(sheet, 500, 600);
  assert.ok(glassAreas.Ag < MIN_BILLED_GLASS_AREA_M2, 'surface vitrée sous le minimum');

  const nouveau = calculateGlazingAndPanelExtras({ selectedGlazing: 'rg-vi11-pvc', glassAreas, widthMm: 500, sheetName: sheet });
  assert.equal(nouveau.glazingExtra, roundToCents((54 - 32) * MIN_BILLED_GLASS_AREA_M2 * MARKUP_COEFFICIENT));

  const ancien = calculateGlazingAndPanelExtras({ selectedGlazing: 'dv_33_2_18_4', glassAreas, widthMm: 500, sheetName: sheet });
  assert.equal(ancien.glazingExtra, roundToCents((67 - 37) * glassAreas.Ag * MARKUP_COEFFICIENT), 'formule historique inchangée');

  // Deux vantaux : le minimum s'applique par volume.
  const deuxVantaux = calculateGlazingAndPanelExtras({ selectedGlazing: 'rg-vi11-pvc', glassAreas, widthMm: 500, sheetName: 'Fenêtre 2V' });
  assert.equal(deuxVantaux.glazingExtra, roundToCents((54 - 32) * 2 * MIN_BILLED_GLASS_AREA_M2 * MARKUP_COEFFICIENT));
});

run('panneau sandwich PVC et soubassement : prix inchangés par le nouveau tarif', () => {
  const sheet = 'Fenêtre 1V';
  const glassAreas = areasFor(sheet, 1000, 1200);
  const panel = calculateGlazingAndPanelExtras({ selectedGlazing: PANEL_SANDWICH_GLAZING_ID, glassAreas, widthMm: 1000, sheetName: sheet });
  assert.equal(panel.glazingExtra, roundToCents((PANEL_SANDWICH_PRICE_PER_M2 - 37) * glassAreas.Ag * MARKUP_COEFFICIENT));

  const soubassement = calculateGlazingAndPanelExtras({
    selectedGlazing: PVC_DEFAULT_GLAZING_ID,
    glassAreas,
    widthMm: 1000,
    hasSousBassement: true,
    sousBassementHeightMm: 400,
    sheetName: sheet,
  });
  assert.equal(
    soubassement.sousBassementPanelExtra,
    roundToCents((PANEL_SANDWICH_PRICE_PER_M2 - 37) * soubassement.sousBassementPanelAreaM2 * MARKUP_COEFFICIENT)
  );
});

run('calculateGlazingExtra sans base explicite : repli sur l’ancien réglage (37 €/m²)', () => {
  assert.equal(calculateGlazingExtra({ selectedGlassPricePerM2: 50, Ag: 1 }), roundToCents(13 * MARKUP_COEFFICIENT));
  assert.equal(calculateGlazingExtra({ selectedGlassPricePerM2: 50, Ag: 1, baseGlassPricePerM2: 32 }), roundToCents(18 * MARKUP_COEFFICIENT));
  assert.equal(calculateGlazingExtra({ selectedGlassPricePerM2: 50, Ag: 0.2, baseGlassPricePerM2: 32, billedAreaM2: 0.45 }), roundToCents(18 * 0.45 * MARKUP_COEFFICIENT));
  assert.equal(calculateGlazingExtra({ selectedGlassPricePerM2: 20, Ag: 1, baseGlassPricePerM2: 32 }), 0, 'jamais négatif');
});
