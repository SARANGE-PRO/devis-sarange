import assert from 'node:assert/strict';
import {
  createBand,
  createDefaultFrame,
  solveDimensionBands,
  computeOpenings,
  toggleSegment,
  verticalSegmentId,
  horizontalSegmentId,
  refreshBandValues,
  placeChassis,
  reconcileChassisPlacements,
  serializeCompositeFrame,
  normalizeCompositeFrame,
  migrateLegacyCompositeFrame,
  validateCompositeFrame,
  setFrameColor,
  getFrameColorOptions,
  mapPlacements,
} from '../lib/composite-frame.mjs';

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

const openingsOf = (frame) => computeOpenings(frame).openings;
const find00 = (openings) => openings.find((o) => o.rMin === 0 && o.cMin === 0);

// ----------------------------------------------------- SOLVEUR (cas 1 a 5)
run('CAS 1 : 1080, [200 fixe, auto, auto] -> [200,440,440]', () => {
  const bands = [createBand({ mode: 'fixed', value: 200 }), createBand(), createBand()];
  const r = solveDimensionBands(1080, bands);
  assert.ok(r.ok);
  assert.deepEqual(r.values, [200, 440, 440]);
});

run('CAS 2 : 1200, [200 fixe, auto, auto] -> [200,500,500]', () => {
  const bands = [createBand({ mode: 'fixed', value: 200 }), createBand(), createBand()];
  const r = solveDimensionBands(1200, bands);
  assert.ok(r.ok);
  assert.deepEqual(r.values, [200, 500, 500]);
});

run('CAS 3 : 1000, [200 fixe, 300 fixe, auto] -> [200,300,500]', () => {
  const bands = [
    createBand({ mode: 'fixed', value: 200 }),
    createBand({ mode: 'fixed', value: 300 }),
    createBand(),
  ];
  const r = solveDimensionBands(1000, bands);
  assert.ok(r.ok);
  assert.deepEqual(r.values, [200, 300, 500]);
});

run('CAS 4 : 1000, [600 fixe, 500 fixe, auto] -> erreur de contrainte', () => {
  const bands = [
    createBand({ mode: 'fixed', value: 600 }),
    createBand({ mode: 'fixed', value: 500 }),
    createBand(),
  ];
  const r = solveDimensionBands(1000, bands);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'FIXED_SUM_EXCEEDS_TOTAL');
});

run('CAS 5 : toutes fixes, somme != total -> erreur (aucune correction silencieuse)', () => {
  const bands = [
    createBand({ mode: 'fixed', value: 300 }),
    createBand({ mode: 'fixed', value: 300 }),
    createBand({ mode: 'fixed', value: 300 }),
  ];
  const r = solveDimensionBands(1000, bands);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'FIXED_SUM_MISMATCH');
});

// ----------------------------------------------------- OUVERTURES (cas 6 a 8)
run('CAS 6 : grille 3x2, tous tronçons actifs -> 6 ouvertures rectangulaires', () => {
  const frame = createDefaultFrame(1080, 2150, 2, 1);
  const openings = openingsOf(frame);
  assert.equal(openings.length, 6);
  assert.ok(openings.every((o) => o.rectangular));
});

run('CAS 7 : suppression traverse colonne gauche -> 5 ouvertures (baie pleine hauteur a gauche)', () => {
  const frame = createDefaultFrame(1080, 2150, 2, 1);
  const next = toggleSegment(frame, horizontalSegmentId(frame, 0, 0));
  const openings = openingsOf(next);
  assert.equal(openings.length, 5);
  const left = openings.find((o) => o.cMin === 0 && o.cMax === 0);
  assert.equal(left.rMin, 0);
  assert.equal(left.rMax, 1); // pleine hauteur
  assert.ok(openings.every((o) => o.rectangular));
});

run('CAS 8 : suppressions formant un L -> ouverture non rectangulaire (refus)', () => {
  const frame = createDefaultFrame(1080, 2150, 2, 1);
  const next = toggleSegment(
    toggleSegment(frame, horizontalSegmentId(frame, 0, 0)),
    verticalSegmentId(frame, 1, 0)
  );
  const openings = openingsOf(next);
  assert.ok(openings.some((o) => !o.rectangular));
  assert.equal(validateCompositeFrame(next).ok, false);
});

// ----------------------------------------------------- PLACEMENTS (cas 9 a 10)
run('CAS 9 : changement de largeur globale -> ouverture conservee, chassis maj', () => {
  let frame = createDefaultFrame(1080, 2150, 2, 1);
  const op = find00(openingsOf(frame));
  frame = placeChassis(frame, op.id, op, { productId: 'fenetre-fixe' });
  const prevOpenings = openingsOf(frame);

  frame = refreshBandValues({ ...frame, overallWidthMm: 1200 });
  const newOpenings = openingsOf(frame);
  const { placements } = reconcileChassisPlacements(prevOpenings, newOpenings, frame.placements);

  const kept = placements[op.id];
  assert.ok(kept);
  assert.equal(kept.status, 'placed');
  const newOp = find00(newOpenings);
  assert.equal(kept.computedWidthMm, newOp.wMm);
  assert.equal(newOp.wMm, 400); // 1200 / 3
});

run('CAS 10 : fusion de 2 ouvertures avec chassis -> conflit, aucune suppression silencieuse', () => {
  let frame = createDefaultFrame(1080, 2150, 2, 1);
  const opened = openingsOf(frame);
  const op00 = opened.find((o) => o.rMin === 0 && o.cMin === 0);
  const op01 = opened.find((o) => o.rMin === 0 && o.cMin === 1);
  frame = placeChassis(frame, op00.id, op00, { productId: 'a' });
  frame = placeChassis(frame, op01.id, op01, { productId: 'b' });
  const prevOpenings = openingsOf(frame);

  const merged = toggleSegment(frame, verticalSegmentId(frame, 0, 0));
  const newOpenings = openingsOf(merged);
  const { placements, conflicts } = reconcileChassisPlacements(
    prevOpenings,
    newOpenings,
    merged.placements
  );
  assert.equal(conflicts.length, 2);
  assert.equal(Object.keys(placements).length, 0);
});

// ----------------------------------------------------- SÉRIALISATION & MIGRATION
run('serialisation : aller-retour conserve geometrie, troncons et placements', () => {
  let frame = createDefaultFrame(1080, 2150, 2, 1);
  const op = find00(openingsOf(frame));
  frame = placeChassis(frame, op.id, op, { productId: 'fenetre-fixe' });
  frame = toggleSegment(frame, horizontalSegmentId(frame, 0, 1));

  const restored = normalizeCompositeFrame(JSON.parse(JSON.stringify(serializeCompositeFrame(frame))));
  assert.equal(restored.overallWidthMm, 1080);
  assert.deepEqual(restored.removedHorizontalSegments, frame.removedHorizontalSegments);
  assert.equal(Object.keys(restored.placements).length, 1);
  assert.equal(openingsOf(restored).length, openingsOf(frame).length);
});

run('migration : anciennes rangees regulieres -> grille avec placements', () => {
  const legacy = [
    {
      id: 'row-1',
      modules: [
        { id: 'm1', productId: 'fenetre-1v', widthMm: 540, heightMm: 1075 },
        { id: 'm2', productId: 'fenetre-fixe', widthMm: 540, heightMm: 1075 },
      ],
    },
    {
      id: 'row-2',
      modules: [
        { id: 'm3', productId: 'fenetre-fixe', widthMm: 540, heightMm: 1075 },
        { id: 'm4', productId: 'fenetre-1v', widthMm: 540, heightMm: 1075 },
      ],
    },
  ];
  const frame = migrateLegacyCompositeFrame(legacy);
  assert.equal(frame.version, 2);
  assert.equal(frame.overallWidthMm, 1080);
  assert.equal(frame.overallHeightMm, 2150);
  const openings = openingsOf(frame);
  assert.equal(openings.length, 4);
  assert.equal(Object.keys(frame.placements).length, 4);
});

// ----------------------------------------------- COLORATION DE L'ENSEMBLE
run('coloration d ensemble : blanc par defaut, heritee par chaque chassis place', () => {
  const frame = createDefaultFrame(2000, 1500, 1, 0);
  assert.equal(frame.colorOptionId, 'blanc');
  assert.equal(frame.rawColorState, null);
  assert.deepEqual(getFrameColorOptions(frame), { colorOptionId: 'blanc' });

  const colored = setFrameColor(frame, {
    colorOptionId: 'coloration-2f',
    rawColorState: { color2fType: 'standard_7016', is2fPlaxage: true },
  });
  assert.equal(colored.colorOptionId, 'coloration-2f');
  // L'ossature d'origine n'est pas modifiee.
  assert.equal(frame.colorOptionId, 'blanc');

  const [first, second] = openingsOf(colored);
  const placed = placeChassis(colored, first.id, first, { productId: 'fenetre-1v' });
  assert.equal(placed.placements[first.id].options.colorOptionId, 'coloration-2f');
  assert.deepEqual(placed.placements[first.id].options.rawColorState, {
    color2fType: 'standard_7016',
    is2fPlaxage: true,
  });
  // Des options explicites gardent la main sur l'heritage.
  const custom = placeChassis(placed, second.id, second, {
    productId: 'fenetre-fixe',
    options: { colorOptionId: 'blanc' },
  });
  assert.equal(custom.placements[second.id].options.colorOptionId, 'blanc');
});

run('coloration d ensemble : setFrameColor recopie sur tous les chassis deja places', () => {
  const frame = createDefaultFrame(2000, 1500, 1, 0);
  const [first, second] = openingsOf(frame);
  let next = placeChassis(frame, first.id, first, {
    productId: 'fenetre-1v',
    options: { glazingId: 'vitrage-x', colorOptionId: 'blanc' },
  });
  next = placeChassis(next, second.id, second, { productId: 'fenetre-fixe' });

  const colored = setFrameColor(next, {
    colorOptionId: 'bicoloration',
    rawColorState: { bicoType: 'standard_chene' },
  });
  Object.values(colored.placements).forEach((placement) => {
    assert.equal(placement.options.colorOptionId, 'bicoloration');
    assert.deepEqual(placement.options.rawColorState, { bicoType: 'standard_chene' });
  });
  // Le reste de la configuration du chassis est conserve.
  assert.equal(colored.placements[first.id].options.glazingId, 'vitrage-x');
  // Copies independantes : retoucher un chassis ne touche ni l'ensemble ni les autres.
  colored.placements[first.id].options.rawColorState.bicoType = 'custom';
  assert.equal(colored.rawColorState.bicoType, 'standard_chene');
  assert.equal(colored.placements[second.id].options.rawColorState.bicoType, 'standard_chene');
  // Sans nouvel etat de couleur, l'etat de l'ensemble est repris.
  const again = setFrameColor(colored, { colorOptionId: 'coloration-2f' });
  assert.equal(again.colorOptionId, 'coloration-2f');
  assert.equal(again.rawColorState.bicoType, 'standard_chene');
});

run('coloration d ensemble : serialisee, et deduite des chassis des anciens composes', () => {
  const frame = setFrameColor(createDefaultFrame(1000, 1000, 0, 0), {
    colorOptionId: 'coloration-2f',
    rawColorState: { color2fType: 'standard_chene' },
  });
  const restored = normalizeCompositeFrame(JSON.parse(JSON.stringify(frame)));
  assert.equal(restored.colorOptionId, 'coloration-2f');
  assert.deepEqual(restored.rawColorState, { color2fType: 'standard_chene' });

  // Ancien compose (sans coloration d'ensemble) : chassis de la meme couleur.
  const legacy = createDefaultFrame(2000, 1000, 1, 0);
  delete legacy.colorOptionId;
  delete legacy.rawColorState;
  const [a, b] = openingsOf(legacy);
  const bico = { colorOptionId: 'bicoloration', rawColorState: { bicoType: 'standard_7016' } };
  let shared = placeChassis(legacy, a.id, a, { productId: 'fenetre-1v', options: { ...bico } });
  shared = placeChassis(shared, b.id, b, { productId: 'fenetre-fixe', options: { ...bico } });
  assert.equal(shared.colorOptionId, undefined);
  const sharedRestored = serializeCompositeFrame(shared);
  assert.equal(sharedRestored.colorOptionId, 'bicoloration');
  assert.deepEqual(sharedRestored.rawColorState, { bicoType: 'standard_7016' });

  // Couleurs differentes : l'ensemble reste blanc, chaque chassis garde la sienne.
  const mixed = placeChassis(shared, b.id, b, {
    productId: 'fenetre-fixe',
    options: { colorOptionId: 'blanc' },
  });
  const mixedRestored = serializeCompositeFrame(mixed);
  assert.equal(mixedRestored.colorOptionId, 'blanc');
  assert.equal(mixedRestored.rawColorState, null);
  assert.equal(mixedRestored.placements[a.id].options.colorOptionId, 'bicoloration');
  assert.equal(mixedRestored.placements[b.id].options.colorOptionId, 'blanc');
});

run('mapPlacements : nouveau frame, chaque chassis transforme, l original intact', () => {
  const frame = createDefaultFrame(2000, 1000, 1, 0);
  const [a, b] = openingsOf(frame);
  let placed = placeChassis(frame, a.id, a, { productId: 'fenetre-1v' });
  placed = placeChassis(placed, b.id, b, { productId: 'fenetre-fixe' });
  const mapped = mapPlacements(placed, (placement) => ({ ...placement, productId: 'x' }));
  assert.notEqual(mapped, placed);
  assert.deepEqual(Object.values(mapped.placements).map((p) => p.productId), ['x', 'x']);
  assert.deepEqual(Object.values(placed.placements).map((p) => p.productId), ['fenetre-1v', 'fenetre-fixe']);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
