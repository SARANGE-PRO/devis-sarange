// La plus-value d'un panneau recalculée côté serveur doit être celle que le
// sélecteur de panneaux afficherait : on relit selecteur.html et on compare.
//
//   node tests/door-panel-pricing.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DOOR_PANEL_DEFINITIONS,
  HAUSSE_ACHAT,
  MARGE_VENTE,
  TAUX_REMISE_ACHAT,
  panelPlusValueHT,
} from '../lib/door-panel-pricing.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const html = fs.readFileSync(new URL('../public/selecteur-panneaux/selecteur.html', import.meta.url), 'utf8');
const pick = (re) => {
  const match = html.match(re);
  assert.ok(match, `introuvable dans selecteur.html : ${re}`);
  return match[1];
};

run('les constantes de prix sont celles du sélecteur', () => {
  assert.equal(TAUX_REMISE_ACHAT, Function(`return ${pick(/const TAUX_REMISE_ACHAT = ([^;]+);/)}`)());
  assert.equal(MARGE_VENTE, Number(pick(/const MARGE_VENTE = ([^;]+);/)));
  assert.equal(HAUSSE_ACHAT, Number(pick(/const HAUSSE_ACHAT = ([^;]+);/)));
});

run('le catalogue des panneaux est celui du sélecteur', () => {
  const fromHtml = Function(`return ${pick(/const doorDefinitions = (\[[\s\S]*?\n\s*\]);/)}`)();
  assert.deepEqual(DOOR_PANEL_DEFINITIONS, fromHtml);
});

run('les plus-values', () => {
  // Modèle de référence, inclus dans le prix de la porte.
  assert.equal(panelPlusValueHT('ELA 01'), 0);
  assert.equal(panelPlusValueHT('GEO 03'), 0);
  // Premium : (brut × 1,06 arrondi) × multiplicateur − base incluse.
  const m = TAUX_REMISE_ACHAT * MARGE_VENTE;
  const expected = Math.round(1460 * 1.06 * 100) / 100 * m - 900 * 1.06 * m;
  assert.ok(Math.abs(panelPlusValueHT('REVA 62') - expected) < 1e-9);
  assert.ok(panelPlusValueHT('CLASSICO 01-D') > 0);
  // Écritures tolérées, modèle inconnu.
  assert.equal(panelPlusValueHT(' reva   62 '), panelPlusValueHT('REVA 62'));
  assert.equal(panelPlusValueHT('REVA 33'), null);
  assert.equal(panelPlusValueHT(''), null);
});

console.log('Tous les tests door-panel-pricing passent.');
