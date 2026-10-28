import assert from 'node:assert/strict';

import {
  PETITS_BOIS_BORDER_COLOR,
  buildPetitsBoisLayout,
  getPetitsBoisFillColor,
  getPetitsBoisWidthMm,
  hasPetitsBoisCrossJoints,
} from '../lib/petits-bois-layout.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.log(`KO - ${name}`);
    throw error;
  }
};

const glass = { x: 20, y: 30, width: 400, height: 600, scaleFactor: 2 };

run('rien sans barre ni sans surface', () => {
  assert.equal(buildPetitsBoisLayout({ ...glass }), null);
  assert.equal(buildPetitsBoisLayout({ ...glass, petitsBoisH: 0, petitsBoisV: 0 }), null);
  assert.equal(buildPetitsBoisLayout({ ...glass, width: 0, petitsBoisH: 1 }), null);
});

run('barres régulièrement réparties, arrêtées au bord du vitrage', () => {
  const layout = buildPetitsBoisLayout({ ...glass, petitsBoisH: 2, petitsBoisV: 1 });
  assert.equal(layout.bars.length, 3);
  const [vertical, firstHorizontal, secondHorizontal] = layout.bars;
  // Verticales d'abord, horizontales par-dessus.
  assert.equal(vertical.orientation, 'vertical');
  assert.equal(vertical.x + vertical.width / 2, 20 + 200, 'verticale centrée');
  assert.equal(vertical.y, 30);
  assert.equal(vertical.height, 600);
  assert.equal(firstHorizontal.orientation, 'horizontal');
  assert.equal(firstHorizontal.y + firstHorizontal.height / 2, 30 + 200);
  assert.equal(secondHorizontal.y + secondHorizontal.height / 2, 30 + 400);
  assert.equal(firstHorizontal.x, 20);
  assert.equal(firstHorizontal.width, 400);
  assert.equal(layout.joints.length, 0, 'pas de croix pour un 26×8');
});

run('largeur liée au profil et à l’échelle, liseré fin', () => {
  const wide = buildPetitsBoisLayout({ ...glass, petitsBoisH: 1, petitsBoisType: '26x8-blanc' });
  const medium = buildPetitsBoisLayout({ ...glass, petitsBoisH: 1, petitsBoisType: '18x8-exterieur-blanc' });
  const thin = buildPetitsBoisLayout({ ...glass, petitsBoisH: 1, petitsBoisType: '9x5-blanc-croix' });
  assert.equal(getPetitsBoisWidthMm('26x8-chene-dore'), 26);
  assert.equal(getPetitsBoisWidthMm('9x5-laiton-croix'), 9);
  assert.equal(getPetitsBoisWidthMm('inconnu'), 26, 'type inconnu : 26×8 blanc');
  assert.ok(wide.barWidth > medium.barWidth && medium.barWidth > thin.barWidth);
  assert.ok(Math.abs(wide.barWidth - 26 * (18 / 80) * 2) < 1e-9, 'même réduction que le cadre');
  assert.ok(wide.borderWidth <= wide.barWidth / 4);
  assert.ok(thin.borderWidth >= 0.5);
  const small = buildPetitsBoisLayout({ ...glass, scaleFactor: 0.2, petitsBoisH: 1, petitsBoisType: '9x5-blanc-croix' });
  assert.equal(small.barWidth, 2, 'largeur minimale lisible');
  assert.equal(wide.border, PETITS_BOIS_BORDER_COLOR);
});

run('couleur du type ; bicolores blancs vus de l’intérieur ; hors standard = profilé', () => {
  assert.equal(getPetitsBoisFillColor('26x8-blanc', '#4A4A4A'), '#FFFFFF');
  assert.equal(getPetitsBoisFillColor('26x8-bicolore-blanc-chene', '#8B5A2B'), '#FFFFFF');
  assert.equal(getPetitsBoisFillColor('9x5-laiton-croix'), '#C9A227');
  assert.equal(getPetitsBoisFillColor('26x8-marron'), '#4A3526');
  assert.equal(getPetitsBoisFillColor('26x8-teinte-hors-standard', '#1E3A5F'), '#1E3A5F');
  assert.equal(getPetitsBoisFillColor('26x8-teinte-hors-standard'), '#FFFFFF');
  assert.equal(getPetitsBoisFillColor(undefined, '#4A4A4A'), '#FFFFFF', 'articles antérieurs : blanc');
  const layout = buildPetitsBoisLayout({ ...glass, petitsBoisH: 1, petitsBoisType: '26x8-chene-dore' });
  assert.equal(layout.fill, '#B97A3A');
});

run('types « avec croix » : un connecteur carré par croisement', () => {
  assert.ok(hasPetitsBoisCrossJoints('9x5-laiton-croix'));
  assert.ok(!hasPetitsBoisCrossJoints('26x8-blanc'));
  const layout = buildPetitsBoisLayout({ ...glass, petitsBoisH: 2, petitsBoisV: 3, petitsBoisType: '9x5-laiton-croix' });
  assert.equal(layout.joints.length, 6);
  const joint = layout.joints[0];
  assert.equal(joint.width, joint.height);
  assert.ok(joint.width > layout.barWidth, 'plus large que la barre');
  assert.equal(joint.x + joint.width / 2, 20 + 100, 'centré sur la première verticale');
  assert.equal(joint.y + joint.height / 2, 30 + 200, 'centré sur la première horizontale');
});

console.log('Tous les tests du dessin des petits bois ont reussi.');
