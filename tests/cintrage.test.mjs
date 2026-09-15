import assert from 'node:assert/strict';
import {
  CINTRAGE_TYPES,
  MIN_FLECHE_MM,
  applyCintrageToPricing,
  clampFlecheMm,
  computeArchRadiusMm,
  describeCintrageLines,
  formatCintrageShortLabel,
  getArchInsetGeometry,
  getArchSegmentGeometry,
  getDefaultFlecheMm,
  getMaxFlecheMm,
  normalizeCintrage,
  resolveCintrageGeometry,
} from '../lib/cintrage.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `attendu ${expected} ± ${tolerance}, obtenu ${actual}`
  );

/* ─── Normalisation des champs d'article ─────────────────────────────────── */

run('normalizeCintrage : type absent ou inconnu -> null', () => {
  assert.equal(normalizeCintrage({}), null);
  assert.equal(normalizeCintrage({ cintrageType: 'ogive' }), null);
  assert.equal(normalizeCintrage(null), null);
});

run('normalizeCintrage : imposte garde le prix du fixe, ignore le prix manuel', () => {
  const cintrage = normalizeCintrage({
    cintrageType: 'imposte',
    cintrageFlecheMm: '300',
    cintrageImpostePriceHt: '245.5',
    cintrageManualPriceHt: '9999',
  });
  assert.deepEqual(cintrage, {
    type: 'imposte',
    flecheMm: 300,
    impostePriceHt: 245.5,
    manualPriceHt: 0,
  });
});

run('normalizeCintrage : cintre intégré garde le prix manuel, ignore le prix du fixe', () => {
  const cintrage = normalizeCintrage({
    cintrageType: 'integre',
    cintrageFlecheMm: 600,
    cintrageImpostePriceHt: 120,
    cintrageManualPriceHt: '1850.004',
  });
  assert.deepEqual(cintrage, {
    type: 'integre',
    flecheMm: 600,
    impostePriceHt: 0,
    manualPriceHt: 1850,
  });
});

/* ─── Flèche : bornes et valeurs par défaut ──────────────────────────────── */

run('flèche maximale = L/2 ; bornée par H en cintre intégré', () => {
  assert.equal(getMaxFlecheMm('imposte', 1200, 1250), 600);
  assert.equal(getMaxFlecheMm('integre', 1200, 1250), 600);
  // Fenêtre basse : l'arc intégré ne peut pas dépasser la hauteur hors tout.
  assert.equal(getMaxFlecheMm('integre', 1200, 400), 400);
  // L'imposte s'ajoute au-dessus : la hauteur ne borne pas.
  assert.equal(getMaxFlecheMm('imposte', 1200, 400), 600);
  assert.equal(getMaxFlecheMm('imposte', 0, 1250), 0);
  assert.equal(getMaxFlecheMm('imposte', 30, 1250), 0);
});

run('flèche par défaut : L/4 en imposte, plein cintre en intégré', () => {
  assert.equal(getDefaultFlecheMm('imposte', 1200, 1250), 300);
  assert.equal(getDefaultFlecheMm('integre', 1200, 1250), 600);
  assert.equal(getDefaultFlecheMm('imposte', 60, 1250), MIN_FLECHE_MM);
  assert.equal(getDefaultFlecheMm('imposte', '', 1250), 0);
});

run('clampFlecheMm : bornée entre le minimum et L/2, null si vide', () => {
  assert.equal(clampFlecheMm('', 'imposte', 1200, 1250), null);
  assert.equal(clampFlecheMm('abc', 'imposte', 1200, 1250), null);
  assert.equal(clampFlecheMm('5', 'imposte', 1200, 1250), MIN_FLECHE_MM);
  assert.equal(clampFlecheMm('900', 'imposte', 1200, 1250), 600);
  assert.equal(clampFlecheMm('250', 'imposte', 1200, 1250), 250);
});

/* ─── Géométrie de l'arc ─────────────────────────────────────────────────── */

run('rayon : plein cintre -> R = L/2 ; arc surbaissé 1200/300 -> 750', () => {
  assert.equal(computeArchRadiusMm(1000, 500), 500);
  assert.equal(computeArchRadiusMm(1200, 300), 750);
  assert.equal(computeArchRadiusMm(1200, 0), 0);
});

run('géométrie imposte : hauteur totale = partie basse + flèche', () => {
  const geometry = resolveCintrageGeometry({
    type: 'imposte',
    flecheMm: 300,
    widthMm: 1200,
    heightMm: 1250,
  });
  assert.deepEqual(geometry, {
    type: 'imposte',
    widthMm: 1200,
    flecheMm: 300,
    radiusMm: 750,
    bodyHeightMm: 1250,
    totalHeightMm: 1550,
    isPleinCintre: false,
  });
});

run('géométrie intégrée : hauteur totale = hauteur saisie, plein cintre par défaut', () => {
  const geometry = resolveCintrageGeometry({
    type: 'integre',
    flecheMm: '',
    widthMm: 1000,
    heightMm: 1400,
  });
  assert.equal(geometry.flecheMm, 500);
  assert.equal(geometry.radiusMm, 500);
  assert.equal(geometry.totalHeightMm, 1400);
  assert.equal(geometry.bodyHeightMm, 1400);
  assert.equal(geometry.isPleinCintre, true);
});

run('géométrie : null sans type valide ou sans dimensions', () => {
  assert.equal(resolveCintrageGeometry({ type: null, widthMm: 1200, heightMm: 1250 }), null);
  assert.equal(resolveCintrageGeometry({ type: 'imposte', widthMm: 0, heightMm: 1250 }), null);
  assert.equal(resolveCintrageGeometry({ type: 'imposte', widthMm: 1200, heightMm: '' }), null);
});

run('arc décalé : en plein cintre, l arc intérieur rejoint les montants à la naissance', () => {
  const arch = { widthMm: 1000, radiusMm: 500 };
  const outer = getArchInsetGeometry(arch, 0);
  near(outer.yJoin, 500);
  near(outer.startAngle, Math.PI);
  near(outer.endAngle, 0);

  const inner = getArchInsetGeometry(arch, 12);
  assert.equal(inner.r, 488);
  assert.equal(inner.left, 12);
  assert.equal(inner.right, 988);
  near(inner.yJoin, 500);
});

run('arc décalé : arc surbaissé, la jonction se fait sous la naissance du cintre', () => {
  const arch = { widthMm: 1000, radiusMm: computeArchRadiusMm(1000, 200) };
  near(arch.radiusMm, 725);
  const inner = getArchInsetGeometry(arch, 12);
  // R − sqrt((R−12)² − (500−12)²) ≈ 205,2 : légèrement sous y = 200.
  near(inner.yJoin, 205.2, 0.1);
  assert.ok(inner.yJoin > 200);
  // L'arc est parcouru par le haut : angles de départ à gauche (< −π/2) et
  // d'arrivée à droite (> −π/2), symétriques.
  assert.ok(inner.startAngle < -Math.PI / 2);
  assert.ok(inner.endAngle > -Math.PI / 2);
  near(inner.startAngle + inner.endAngle, -Math.PI);
});

run('segment imposte : corde en y = flèche, demi-corde dans les montants', () => {
  const arch = { widthMm: 1000, radiusMm: computeArchRadiusMm(1000, 200) };
  const segment = getArchSegmentGeometry(arch, 12, 200);
  assert.equal(segment.chordY, 200);
  assert.ok(segment.left > 12);
  assert.ok(segment.right < 988);
  near(segment.left + segment.right, 1000);
  // Plein cintre : la corde intérieure touche exactement les montants.
  const plein = getArchSegmentGeometry({ widthMm: 1000, radiusMm: 500 }, 12, 500);
  near(plein.left, 12);
  near(plein.right, 988);
});

/* ─── Règle de prix ──────────────────────────────────────────────────────── */

run('prix : sans cintrage, base et options inchangées', () => {
  assert.deepEqual(applyCintrageToPricing({ cintrage: null, basePrice: 500, optionsPrice: 80 }), {
    basePrice: 500,
    optionsPrice: 80,
    isManualPrice: false,
  });
});

run('prix : imposte -> partie basse automatique + prix du fixe cintré ajouté', () => {
  const cintrage = normalizeCintrage({ cintrageType: 'imposte', cintrageImpostePriceHt: 245 });
  assert.deepEqual(applyCintrageToPricing({ cintrage, basePrice: 500, optionsPrice: 80 }), {
    basePrice: 500,
    optionsPrice: 325,
    isManualPrice: false,
  });
});

run('prix : cintre intégré -> calcul automatique désactivé, prix total manuel', () => {
  const cintrage = normalizeCintrage({ cintrageType: 'integre', cintrageManualPriceHt: 1850 });
  assert.deepEqual(applyCintrageToPricing({ cintrage, basePrice: 500, optionsPrice: 80 }), {
    basePrice: 1850,
    optionsPrice: 0,
    isManualPrice: true,
  });
});

/* ─── Désignation et libellés ────────────────────────────────────────────── */

run('désignation imposte : flèche et hauteur totale hors tout', () => {
  const lines = describeCintrageLines({
    cintrageType: 'imposte',
    cintrageFlecheMm: 300,
    widthMm: 1200,
    heightMm: 1250,
  });
  assert.deepEqual(lines, [
    'Fixe cintré en imposte – arc surbaissé, flèche 300 mm',
    'Hauteur totale hors tout 1550 mm (partie basse 1250 mm)',
  ]);
  lines.forEach((line) => assert.ok(line.length <= 80, `ligne trop longue : ${line}`));
});

run('désignation cintre intégré plein cintre', () => {
  const lines = describeCintrageLines({
    cintrageType: 'integre',
    cintrageFlecheMm: 500,
    widthMm: 1000,
    heightMm: 1400,
  });
  assert.deepEqual(lines, ["Cintrage intégré à l'ouvrant – plein cintre"]);
  assert.deepEqual(describeCintrageLines({ widthMm: 1000, heightMm: 1400 }), []);
});

run('libellé court panier', () => {
  assert.equal(
    formatCintrageShortLabel({ cintrageType: 'imposte', cintrageFlecheMm: 300, widthMm: 1200, heightMm: 1250 }),
    'Fixe cintré en imposte (flèche 300 mm)'
  );
  assert.equal(
    formatCintrageShortLabel({ cintrageType: 'integre', cintrageFlecheMm: 500, widthMm: 1000, heightMm: 1400 }),
    'Plein cintre intégré'
  );
  assert.equal(
    formatCintrageShortLabel({ cintrageType: 'integre', cintrageFlecheMm: 250, widthMm: 1000, heightMm: 1400 }),
    'Cintre intégré (flèche 250 mm)'
  );
  assert.equal(formatCintrageShortLabel({ widthMm: 1000, heightMm: 1400 }), '');
  assert.equal(CINTRAGE_TYPES.IMPOSTE, 'imposte');
});

console.log('Tous les tests cintrage sont passés.');
