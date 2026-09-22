import assert from 'node:assert/strict';
import {
  VOLET_MONOBLOC_COULEURS,
  getVoletMonoblocCouleurHex,
  getVoletMonoblocCouleurLabel,
  getVoletMonoblocCouleurOptions,
  isPresetVoletMonoblocCouleur,
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

run('normalisation : liste, texte libre nettoyé, vide = ton menuiserie', () => {
  assert.equal(normalizeVoletMonoblocCouleur('Gris 7016'), 'Gris 7016');
  assert.equal(normalizeVoletMonoblocCouleur(''), '');
  assert.equal(normalizeVoletMonoblocCouleur(undefined), '');
  // « Autre » : texte libre conservé, espaces repliés, longueur bornée.
  assert.equal(normalizeVoletMonoblocCouleur('  RAL 5003   bleu nuit '), 'RAL 5003 bleu nuit');
  assert.equal(normalizeVoletMonoblocCouleur('x'.repeat(80)).length, 60);
  assert.equal(isPresetVoletMonoblocCouleur('Noir'), true);
  assert.equal(isPresetVoletMonoblocCouleur('RAL 5003'), false);
  assert.equal(isPresetVoletMonoblocCouleur(''), false);
  assert.equal(getVoletMonoblocCouleurLabel(''), 'ton menuiserie');
  assert.equal(getVoletMonoblocCouleurLabel('Noir'), 'Noir');
  assert.equal(getVoletMonoblocCouleurLabel('RAL 5003'), 'RAL 5003');
});

run('teinte de dessin : mêmes correspondances que le croquis de métrage', () => {
  assert.equal(getVoletMonoblocCouleurHex('Blanc'), '#FFFFFF');
  assert.equal(getVoletMonoblocCouleurHex('Gris 7016'), '#4A4A4A');
  assert.equal(getVoletMonoblocCouleurHex('Chêne doré'), '#8B5A2B');
  assert.equal(getVoletMonoblocCouleurHex('Noir'), '#2F2F2F');
  // Ton menuiserie : le rendu reprend la couleur du profilé.
  assert.equal(getVoletMonoblocCouleurHex(''), null);
  // Texte libre : mot-clé reconnu, sinon couleur du profilé.
  assert.equal(getVoletMonoblocCouleurHex('gris anthracite RAL 7016'), '#4A4A4A');
  assert.equal(getVoletMonoblocCouleurHex('RAL 5003 bleu nuit'), null);
});

run('options du sélecteur : ton menuiserie en premier', () => {
  const options = getVoletMonoblocCouleurOptions();
  assert.equal(options[0].id, '');
  assert.equal(options[0].label, 'Ton menuiserie');
  assert.equal(options.length, 5);
  assert.ok(options.slice(1).every((option) => option.hex));
});

console.log('Tous les tests de couleur du volet monobloc ont reussi.');
