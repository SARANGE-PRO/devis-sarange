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
  getVeluxPrefix,
} from '../lib/velux-config.js';

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
    "Velux GGU MK04 (78x98) - Tout Confort avec Store d'occultation intérieur + Raccord EDW (Tuiles)"
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

  assert.equal(designation, 'Velux GPL UK08 (134x140) - Standard + Raccord EDS (Ardoises)');
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
      "Velux GGU MK04 (78x98) - Tout Confort avec Store d'occultation intérieur + Raccord EDW (Tuiles)",
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

console.log('Tous les tests du configurateur Velux ont reussi.');
