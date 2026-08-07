import assert from 'node:assert/strict';
import {
  DOOR_RULE,
  FALLBACK_VAT_RATE,
  REDUCED_VAT_RATE,
  ROOF_WINDOW_RULE,
  VAT_ELIGIBILITY_STATUS,
  VAT_LINE_CATEGORIES,
  VELUX_GLAZING_THERMAL,
  WINDOW_RULE,
  classifyVatLine,
  evaluateReducedVatEligibility,
  isDoorUdCompliant,
  isRoofWindowUwSwCompliant,
  isWindowUwSwCompliant,
  resolveEffectiveTvaRate,
} from '../lib/vat-window-eligibility.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

/* ─── Classification ──────────────────────────────────────────────────── */

run('classifie une fenêtre catalogue standard en WINDOW', () => {
  assert.equal(
    classifyVatLine({ sheetName: 'Fenêtre PVC 1 vantail', thermalUw: 1.2, thermalSw: 0.4 }),
    VAT_LINE_CATEGORIES.WINDOW
  );
});

run('classifie une porte d\'entrée en ENTRY_DOOR, même si un Uw a été calculé', () => {
  assert.equal(
    classifyVatLine({ sheetName: 'Porte Entrée RENO', thermalUw: 1.3, thermalSw: 0.4 }),
    VAT_LINE_CATEGORIES.ENTRY_DOOR
  );
});

run('classifie un volet en NOT_APPLICABLE', () => {
  assert.equal(classifyVatLine({ sheetName: 'Volet Battant PVC' }), VAT_LINE_CATEGORIES.NOT_APPLICABLE);
});

run('classifie une ligne Velux (veluxRange) en ROOF_WINDOW_VELUX, même sans sheetName', () => {
  assert.equal(
    classifyVatLine({ productId: 'custom-product', veluxRange: 'confort' }),
    VAT_LINE_CATEGORIES.ROOF_WINDOW_VELUX
  );
});

run('classifie un produit personnalisé libre (sans marqueur) en NOT_APPLICABLE', () => {
  assert.equal(
    classifyVatLine({ productId: 'custom-product', customDescription: 'Grille de ventilation' }),
    VAT_LINE_CATEGORIES.NOT_APPLICABLE
  );
});

run('classifie une gestion de déchets en NOT_APPLICABLE', () => {
  assert.equal(classifyVatLine({ sheetName: 'Gestion Dechets' }), VAT_LINE_CATEGORIES.NOT_APPLICABLE);
});

run('classifie un châssis composé en WINDOW (sheetName générique "Châssis composé")', () => {
  assert.equal(
    classifyVatLine({ sheetName: 'Châssis composé', isComposite: true, thermalUw: 1.1, thermalSw: 0.35 }),
    VAT_LINE_CATEGORIES.WINDOW
  );
});

/* ─── Seuils fenêtre (art. 30-0 D bis) ────────────────────────────────── */

run('fenêtre conforme via le premier couple (Uw=1.3, Sw=0.3 pile)', () => {
  assert.equal(isWindowUwSwCompliant(1.3, 0.3), true);
});

run('fenêtre conforme via le second couple (Uw=1.7, Sw=0.36 pile)', () => {
  assert.equal(isWindowUwSwCompliant(1.7, 0.36), true);
});

run('fenêtre non conforme : Uw trop élevé pour les deux couples', () => {
  assert.equal(isWindowUwSwCompliant(1.71, 0.5), false);
});

run('fenêtre non conforme : Uw=1.3 mais Sw insuffisant pour aucun des deux couples', () => {
  // Sw=0.29 échoue le couple 1 (besoin >=0.3) ; Uw=1.3 passe bien le couple 2
  // (<=1.7) mais Sw=0.29 échoue aussi le couple 2 (besoin >=0.36).
  assert.equal(isWindowUwSwCompliant(1.3, 0.29), false);
});

run('fenêtre conforme : Uw bas et Sw élevé passent largement', () => {
  assert.equal(isWindowUwSwCompliant(0.9, 0.5), true);
});

run("evaluateReducedVatEligibility renvoie ELIGIBLE avec le détail Uw/Sw pour une fenêtre conforme", () => {
  const result = evaluateReducedVatEligibility({
    sheetName: 'Fenêtre PVC 1 vantail',
    thermalUw: 1.24,
    thermalSw: 0.4,
  });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
  assert.equal(result.category, VAT_LINE_CATEGORIES.WINDOW);
  assert.equal(result.uw, 1.24);
  assert.equal(result.sw, 0.4);
  assert.equal(result.rule, WINDOW_RULE);
});

run('evaluateReducedVatEligibility renvoie NOT_ELIGIBLE pour une fenêtre hors seuils', () => {
  const result = evaluateReducedVatEligibility({
    sheetName: 'Fenêtre ALU 2 vantaux',
    thermalUw: 2.1,
    thermalSw: 0.5,
  });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE);
});

run('evaluateReducedVatEligibility renvoie NOT_VERIFIABLE quand Uw/Sw sont absents (ex. remplissage opaque sans données thermiques)', () => {
  const result = evaluateReducedVatEligibility({
    sheetName: 'Fenêtre PVC 1 vantail',
    thermalUw: null,
    thermalSw: null,
  });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE);
});

/* ─── Fenêtres de toit Velux ───────────────────────────────────────────── */

run('fenêtre de toit conforme : plafond de Sw (contrairement à la fenêtre verticale)', () => {
  assert.equal(isRoofWindowUwSwCompliant(1.4, 0.3), true);
  assert.equal(isRoofWindowUwSwCompliant(1.4, 0.37), false, 'Sw au-dessus du plafond 0,36 doit échouer');
});

run('Velux gamme Confort et Tout Confort sont éligibles au 5,5%', () => {
  const confort = evaluateReducedVatEligibility({ productId: 'custom-product', veluxRange: 'confort' });
  const toutConfort = evaluateReducedVatEligibility({
    productId: 'custom-product',
    veluxRange: 'tout-confort',
  });
  assert.equal(confort.status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
  assert.equal(toutConfort.status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
});

run('Velux gamme Standard n\'est PAS éligible (Sw trop élevé)', () => {
  const result = evaluateReducedVatEligibility({ productId: 'custom-product', veluxRange: 'standard' });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE);
  assert.equal(result.sw > ROOF_WINDOW_RULE.maxSw, true);
});

run('Velux avec une gamme inconnue est NOT_VERIFIABLE (jamais éligible par défaut)', () => {
  const result = evaluateReducedVatEligibility({ productId: 'custom-product', veluxRange: 'inexistante' });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE);
});

run('toutes les gammes Velux modélisées ont un Uw/Sw numérique fini', () => {
  Object.values(VELUX_GLAZING_THERMAL).forEach((thermal) => {
    assert.equal(Number.isFinite(thermal.uw), true);
    assert.equal(Number.isFinite(thermal.sw), true);
  });
});

/* ─── Portes d'entrée (Ud) ─────────────────────────────────────────────── */

run('porte conforme (Ud=1.7 pile)', () => {
  assert.equal(isDoorUdCompliant(1.7), true);
});

run('porte non conforme (Ud > 1.7)', () => {
  assert.equal(isDoorUdCompliant(1.71), false);
});

run('porte sans Ud manuel renseigné : NOT_VERIFIABLE, jamais éligible par défaut', () => {
  const result = evaluateReducedVatEligibility({ sheetName: 'Porte Entrée RENO', manualUd: null });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE);
  assert.equal(result.rule, DOOR_RULE);
});

run('porte avec Ud manuel conforme : ELIGIBLE', () => {
  const result = evaluateReducedVatEligibility({ sheetName: 'Porte Entrée NEUF', manualUd: 1.4 });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
  assert.equal(result.ud, 1.4);
});

run('porte avec Ud manuel non conforme : NOT_ELIGIBLE', () => {
  const result = evaluateReducedVatEligibility({ sheetName: 'Porte Entrée NEUF', manualUd: 2.2 });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE);
});

/* ─── Lignes hors périmètre ────────────────────────────────────────────── */

run('une ligne NOT_APPLICABLE (volet) reste NOT_APPLICABLE quel que soit son Uw', () => {
  const result = evaluateReducedVatEligibility({ sheetName: 'Volet Roulant PVC' });
  assert.equal(result.status, VAT_ELIGIBILITY_STATUS.NOT_APPLICABLE);
});

/* ─── Correction automatique du taux (resolveEffectiveTvaRate) ────────── */

run('un taux demandé différent de 5,5% n\'est jamais retouché, même sur une ligne non conforme', () => {
  const nonCompliantWindow = { sheetName: 'Fenêtre PVC', thermalUw: 3, thermalSw: 0.6 };
  [0, 10, 20].forEach((rate) => {
    const resolved = resolveEffectiveTvaRate(nonCompliantWindow, rate);
    assert.equal(resolved.rate, rate);
    assert.equal(resolved.wasCorrected, false);
    assert.equal(resolved.evaluation, null);
  });
});

run('5,5% demandé sur une fenêtre conforme reste à 5,5%', () => {
  const compliantWindow = { sheetName: 'Fenêtre PVC', thermalUw: 1.2, thermalSw: 0.4 };
  const resolved = resolveEffectiveTvaRate(compliantWindow, REDUCED_VAT_RATE);
  assert.equal(resolved.rate, REDUCED_VAT_RATE);
  assert.equal(resolved.wasCorrected, false);
});

run('5,5% demandé sur une fenêtre NON conforme est ramené à 10% avec wasCorrected=true', () => {
  const nonCompliantWindow = { sheetName: 'Fenêtre ALU', thermalUw: 2.5, thermalSw: 0.2 };
  const resolved = resolveEffectiveTvaRate(nonCompliantWindow, REDUCED_VAT_RATE);
  assert.equal(resolved.rate, FALLBACK_VAT_RATE);
  assert.equal(resolved.requestedRate, REDUCED_VAT_RATE);
  assert.equal(resolved.wasCorrected, true);
  assert.equal(resolved.evaluation.status, VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE);
});

run('5,5% demandé sur une porte sans Ud renseigné est ramené à 10% (non vérifiable = non éligible)', () => {
  const resolved = resolveEffectiveTvaRate({ sheetName: 'Porte Entrée RENO' }, REDUCED_VAT_RATE);
  assert.equal(resolved.rate, FALLBACK_VAT_RATE);
  assert.equal(resolved.wasCorrected, true);
  assert.equal(resolved.evaluation.status, VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE);
});

run('5,5% demandé sur une ligne hors périmètre (déchets, remise, texte...) n\'est jamais retouché', () => {
  const wasteLine = { sheetName: 'Gestion Dechets' };
  const resolved = resolveEffectiveTvaRate(wasteLine, REDUCED_VAT_RATE);
  assert.equal(resolved.rate, REDUCED_VAT_RATE);
  assert.equal(resolved.wasCorrected, false);
  assert.equal(resolved.evaluation.status, VAT_ELIGIBILITY_STATUS.NOT_APPLICABLE);
});

run('5,5% demandé sur un Velux Confort reste à 5,5%, sur un Velux Standard est ramené à 10%', () => {
  const confortResolved = resolveEffectiveTvaRate(
    { productId: 'custom-product', veluxRange: 'confort' },
    REDUCED_VAT_RATE
  );
  const standardResolved = resolveEffectiveTvaRate(
    { productId: 'custom-product', veluxRange: 'standard' },
    REDUCED_VAT_RATE
  );
  assert.equal(confortResolved.rate, REDUCED_VAT_RATE);
  assert.equal(confortResolved.wasCorrected, false);
  assert.equal(standardResolved.rate, FALLBACK_VAT_RATE);
  assert.equal(standardResolved.wasCorrected, true);
});
