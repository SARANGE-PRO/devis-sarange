import assert from 'node:assert/strict';
import {
  VOLET_MONOBLOC_COULEURS,
  getVoletMonoblocCouleurHex,
  getVoletMonoblocCouleurLabel,
  getVoletMonoblocCouleurOptions,
  normalizeVoletMonoblocCouleur,
} from '../lib/volet-monobloc.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('couleurs proposées : celles de l’app de métrage', () => {
  assert.deepEqual([...VOLET_MONOBLOC_COULEURS], ['Blanc', 'Gris 7016', 'Chêne doré', 'Noir']);
});

run('normalisation : valeur inconnue ou vide = ton menuiserie', () => {
  assert.equal(normalizeVoletMonoblocCouleur('Gris 7016'), 'Gris 7016');
  assert.equal(normalizeVoletMonoblocCouleur(''), '');
  assert.equal(normalizeVoletMonoblocCouleur(undefined), '');
  assert.equal(normalizeVoletMonoblocCouleur('Rose'), '');
  assert.equal(getVoletMonoblocCouleurLabel(''), 'ton menuiserie');
  assert.equal(getVoletMonoblocCouleurLabel('Noir'), 'Noir');
});

run('teinte de dessin : mêmes correspondances que le croquis de métrage', () => {
  assert.equal(getVoletMonoblocCouleurHex('Blanc'), '#FFFFFF');
  assert.equal(getVoletMonoblocCouleurHex('Gris 7016'), '#4A4A4A');
  assert.equal(getVoletMonoblocCouleurHex('Chêne doré'), '#8B5A2B');
  assert.equal(getVoletMonoblocCouleurHex('Noir'), '#2F2F2F');
  // Ton menuiserie : le rendu reprend la couleur du profilé.
  assert.equal(getVoletMonoblocCouleurHex(''), null);
});

run('options du sélecteur : ton menuiserie en premier', () => {
  const options = getVoletMonoblocCouleurOptions();
  assert.equal(options[0].id, '');
  assert.equal(options[0].label, 'Ton menuiserie');
  assert.equal(options.length, 5);
  assert.ok(options.slice(1).every((option) => option.hex));
});

console.log('Tous les tests de couleur du volet monobloc ont reussi.');
