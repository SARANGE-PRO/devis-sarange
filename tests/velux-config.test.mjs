import assert from 'node:assert/strict';
import {
  VELUX_ACCESSORIES,
  VELUX_FINISHES,
  VELUX_FLASHINGS,
  VELUX_OPENINGS,
  VELUX_RANGES,
  VELUX_SIZES,
  buildVeluxDesignation,
  createVeluxConfiguration,
  formatVeluxThermal,
  getVeluxPrefix,
  getVeluxThermal,
} from '../lib/velux-config.js';
import {
  ROOF_WINDOW_RULE,
  VELUX_GLAZING_THERMAL,
  evaluateReducedVatEligibility,
  VAT_ELIGIBILITY_STATUS,
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

run('les catalogues exposent tous les standards Velux', () => {
  assert.equal(VELUX_OPENINGS.length, 2);
  assert.equal(VELUX_FINISHES.length, 3);
  assert.deepEqual(
    VELUX_SIZES.map((size) => size.code),
    ['CK02', 'CK04', 'MK04', 'MK06', 'MK08', 'SK06', 'UK04', 'UK08']
  );
  assert.equal(VELUX_RANGES.length, 3);
  assert.deepEqual(
    VELUX_FLASHINGS.map((flashing) => flashing.code),
    ['EDW', 'EDS', 'EDQ']
  );
  assert.equal(VELUX_ACCESSORIES.length, 4);
  assert.equal(VELUX_ACCESSORIES.find((entry) => entry.isDefault)?.id, 'aucun');
});

run('genere les 4 prefixes techniques (regle ouverture x materiau)', () => {
  assert.equal(getVeluxPrefix('rotation', 'bois-vernis'), 'GGL');
  assert.equal(getVeluxPrefix('rotation', 'bois-laque-blanc'), 'GGL');
  assert.equal(getVeluxPrefix('rotation', 'polyurethane-blanc'), 'GGU');
  assert.equal(getVeluxPrefix('projection', 'bois-vernis'), 'GPL');
  assert.equal(getVeluxPrefix('projection', 'bois-laque-blanc'), 'GPL');
  assert.equal(getVeluxPrefix('projection', 'polyurethane-blanc'), 'GPU');
  assert.equal(getVeluxPrefix('rotation', null), null);
  assert.equal(getVeluxPrefix(null, 'bois-vernis'), null);
});

run("genere la designation exacte de l'exemple du cahier des charges", () => {
  const designation = buildVeluxDesignation({
    opening: 'rotation',
    finish: 'polyurethane-blanc',
    sizeCode: 'MK04',
    range: 'tout-confort',
    flashing: 'edw',
    accessory: 'store-occultation',
  });

  assert.equal(
    designation,
    "Velux GGU MK04 (78x98) - Tout Confort avec Store d'occultation intérieur + Raccord EDW (Tuiles) – Uw = 1.3 W/m²K – Sw = 0.22"
  );
});

run('designation sans equipement : pas de suffixe « avec »', () => {
  const designation = buildVeluxDesignation({
    opening: 'projection',
    finish: 'bois-vernis',
    sizeCode: 'UK08',
    range: 'standard',
    flashing: 'eds',
    accessory: 'aucun',
  });

  assert.equal(designation, 'Velux GPL UK08 (134x140) - Standard + Raccord EDS (Ardoises) – Uw = 1.4 W/m²K – Sw = 0.39');
});

run('designation incomplete (dont raccord manquant) -> null', () => {
  assert.equal(buildVeluxDesignation({ opening: 'rotation' }), null);
  assert.equal(
    buildVeluxDesignation({
      opening: 'rotation',
      finish: 'bois-vernis',
      sizeCode: 'MK04',
      range: 'standard',
      // pas de raccord : la designation doit rester incomplete
    }),
    null
  );
  assert.equal(
    buildVeluxDesignation({
      opening: 'rotation',
      finish: 'bois-vernis',
      sizeCode: 'ZZ99',
      range: 'standard',
      flashing: 'edw',
    }),
    null
  );
});

run("createVeluxConfiguration retourne l'objet complet (sans aucun prix)", () => {
  const configuration = createVeluxConfiguration({
    opening: 'rotation',
    finish: 'polyurethane-blanc',
    sizeCode: 'MK04',
    range: 'tout-confort',
    flashing: 'edw',
    accessory: 'store-occultation',
  });

  assert.deepEqual(configuration, {
    opening: 'rotation',
    finish: 'polyurethane-blanc',
    sizeCode: 'MK04',
    widthCm: 78,
    heightCm: 98,
    range: 'tout-confort',
    flashing: 'edw',
    flashingCode: 'EDW',
    accessory: 'store-occultation',
    prefix: 'GGU',
    designation:
      "Velux GGU MK04 (78x98) - Tout Confort avec Store d'occultation intérieur + Raccord EDW (Tuiles) – Uw = 1.3 W/m²K – Sw = 0.22",
    thermalUw: 1.3,
    thermalSw: 0.22,
    imageSrc: '/fenetre-de-toit-velux-rotation-v2.webp',
    labels: {
      opening: 'Rotation',
      finish: 'Polyuréthane blanc',
      finishCommercialName: 'EverFinish / PVC',
      size: 'MK04 (78 x 98 cm)',
      range: 'Tout Confort',
      flashing: 'EDW (Tuiles)',
      accessory: "Store d'occultation intérieur",
    },
  });

  const serialized = JSON.stringify(configuration).toLowerCase();
  assert.ok(!serialized.includes('prix') && !serialized.includes('price'));

  assert.equal(createVeluxConfiguration({ opening: 'rotation' }), null);
  assert.equal(
    createVeluxConfiguration({
      opening: 'rotation',
      finish: 'polyurethane-blanc',
      sizeCode: 'MK04',
      range: 'tout-confort',
      // raccord manquant -> null
    }),
    null
  );
});

/* ─── Performance thermique et TVA 5,5 % ────────────────────────────────────
 * Le descriptif d'une fenêtre de toit doit porter Uw et Sw : c'est la mention
 * qui justifie le taux réduit sur le devis et la facture. Ces tests verrouillent
 * deux choses : que le libellé les affiche, et qu'ils proviennent de la MÊME
 * table que le contrôle d'éligibilité — deux sources qui divergeraient
 * feraient afficher une valeur et en contrôler une autre.
 * ────────────────────────────────────────────────────────────────────────── */

run('les coefficients du descriptif viennent de la table de reference', () => {
  for (const range of VELUX_RANGES) {
    const thermal = getVeluxThermal(range.id);
    assert.ok(thermal, `gamme ${range.id} absente de VELUX_GLAZING_THERMAL`);
    assert.equal(thermal, VELUX_GLAZING_THERMAL[range.id], 'source unique attendue');
    assert.equal(formatVeluxThermal(range.id), `Uw = ${thermal.uw} W/m²K – Sw = ${thermal.sw}`);
  }
});

run('chaque designation Velux affiche Uw et Sw', () => {
  for (const range of VELUX_RANGES) {
    const designation = buildVeluxDesignation({
      opening: 'rotation',
      finish: 'bois-vernis',
      sizeCode: 'MK04',
      range: range.id,
      flashing: 'edw',
    });
    const thermal = getVeluxThermal(range.id);
    assert.ok(
      designation.includes(`Uw = ${thermal.uw} W/m²K`),
      `Uw absent du descriptif de la gamme ${range.id}`
    );
    assert.ok(designation.includes(`Sw = ${thermal.sw}`), `Sw absent (${range.id})`);
  }
});

run('la performance ne depend pas de la taille (Velux publie par gamme)', () => {
  const forSize = (sizeCode) =>
    createVeluxConfiguration({
      opening: 'rotation',
      finish: 'bois-vernis',
      sizeCode,
      range: 'confort',
      flashing: 'edw',
    });
  const petite = forSize('CK02');
  const grande = forSize('UK08');
  assert.equal(petite.thermalUw, grande.thermalUw);
  assert.equal(petite.thermalSw, grande.thermalSw);
});

run('le taux de 5,5 % suit reellement les coefficients annonces', () => {
  const evaluate = (rangeId) =>
    evaluateReducedVatEligibility({ veluxRange: rangeId, tvaRate: 5.5 });

  // Seuil fenêtre de toit : Uw ≤ 1,5 ET Sw ≤ 0,36 (plafond, pas plancher).
  for (const range of VELUX_RANGES) {
    const thermal = getVeluxThermal(range.id);
    const attendu =
      thermal.uw <= ROOF_WINDOW_RULE.maxUw && thermal.sw <= ROOF_WINDOW_RULE.maxSw;
    const evaluation = evaluate(range.id);
    assert.equal(
      evaluation.status === VAT_ELIGIBILITY_STATUS.ELIGIBLE,
      attendu,
      `gamme ${range.id} : eligibilite incoherente avec Uw=${thermal.uw} / Sw=${thermal.sw}`
    );
  }

  // Concrètement, avec les valeurs du tarif Velux en vigueur :
  assert.equal(evaluate('confort').status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
  assert.equal(evaluate('tout-confort').status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
  // Standard : Sw = 0,39 dépasse le plafond de 0,36 → pas de 5,5 %.
  assert.notEqual(evaluate('standard').status, VAT_ELIGIBILITY_STATUS.ELIGIBLE);
});

console.log('Tous les tests du configurateur Velux ont reussi.');
