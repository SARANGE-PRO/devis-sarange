import assert from 'node:assert/strict';
import {
  WASTE_MANAGEMENT_CENTRE,
  WASTE_MANAGEMENT_DESCRIPTION,
  WASTE_MANAGEMENT_LABEL,
  buildWasteConfigurationText,
  buildWasteDesignation,
  buildWasteDetailLine,
  buildWasteWeightLine,
  getWasteManagementLabel,
} from '../lib/waste-management.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('intitulé : le nouveau, aussi pour l’ancien « Gestion des déchets » des devis enregistrés', () => {
  assert.equal(WASTE_MANAGEMENT_LABEL, 'Évacuation et recyclage des menuiseries déposées');
  assert.equal(getWasteManagementLabel('Gestion des déchets'), WASTE_MANAGEMENT_LABEL);
  assert.equal(getWasteManagementLabel(''), WASTE_MANAGEMENT_LABEL);
  assert.equal(getWasteManagementLabel(undefined), WASTE_MANAGEMENT_LABEL);
  assert.equal(getWasteManagementLabel('Autre libellé'), 'Autre libellé');
});

run('poids estimé seulement quand il est connu, centre toujours cité', () => {
  assert.equal(buildWasteWeightLine(0), '');
  assert.equal(buildWasteWeightLine(undefined), '');
  assert.equal(buildWasteWeightLine('abc'), '');
  assert.equal(buildWasteWeightLine(84.6), 'Poids estimé : 85 kg');
  assert.equal(buildWasteDetailLine(120), `Poids estimé : 120 kg · ${WASTE_MANAGEMENT_CENTRE}.`);
  assert.equal(buildWasteDetailLine(0), `${WASTE_MANAGEMENT_CENTRE}.`);
  assert.equal(WASTE_MANAGEMENT_CENTRE, 'BIG BENNES 77 – ZA Mont Saint-Sébastien, 77111 Soignolles-en-Brie');
});

run('désignation : intitulé puis deux lignes ; quantités et prix inchangés', () => {
  assert.equal(WASTE_MANAGEMENT_DESCRIPTION, 'Enlèvement, transport, tri et traitement des déchets.');
  assert.equal(
    buildWasteDesignation({ weightKg: 120 }),
    `${WASTE_MANAGEMENT_LABEL}\n${WASTE_MANAGEMENT_DESCRIPTION}\nPoids estimé : 120 kg · ${WASTE_MANAGEMENT_CENTRE}.`
  );
  assert.equal(buildWasteDesignation(), `${WASTE_MANAGEMENT_LABEL}\n${WASTE_MANAGEMENT_DESCRIPTION}\n${WASTE_MANAGEMENT_CENTRE}.`);
  assert.equal(buildWasteConfigurationText({ weightKg: 120 }).split('\n').length, 2, 'deux lignes sous l’intitulé');
});

console.log('Tous les tests d’évacuation et recyclage ont reussi.');
