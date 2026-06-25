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

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
