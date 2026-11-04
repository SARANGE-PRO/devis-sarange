// Recherche commune des onglets (lib/search.mjs).
//   node tests/search.test.mjs
import assert from 'node:assert/strict';

import {
  buildSearchIndex,
  collectSearchValues,
  matchesSearch,
  matchesSearchIndex,
  tokenizeSearchQuery,
} from '../lib/search.mjs';

let ok = 0;
let fail = 0;
const run = (name, fn) => {
  try {
    fn();
    ok += 1;
    console.log(`OK - ${name}`);
  } catch (error) {
    fail += 1;
    console.error(`KO - ${name}`);
    console.error(error);
  }
};

const quote = [
  'Devis fenêtres',
  'Hélène DUPONT-MARTIN',
  'helene.dupont@example.com',
  '06 62 68 90 84',
  'Croissy-sur-Seine (78290)',
  'DV-262341234',
  'Fenêtre PVC 2 vantaux',
  'Envoyé',
  4530.5,
];

run('saisie vide : tout passe', () => {
  assert.equal(matchesSearch(quote, ''), true);
  assert.equal(matchesSearch(quote, '   '), true);
});

run('sans accents ni casse, mot partiel', () => {
  assert.equal(matchesSearch(quote, 'helene'), true);
  assert.equal(matchesSearch(quote, 'HÉLÈNE'), true);
  assert.equal(matchesSearch(quote, 'dupont'), true);
  assert.equal(matchesSearch(quote, 'croissy'), true);
  assert.equal(matchesSearch(quote, 'durand'), false);
});

run('plusieurs mots, dans n’importe quel ordre, tous requis', () => {
  assert.equal(matchesSearch(quote, 'dupont envoye'), true);
  assert.equal(matchesSearch(quote, 'envoye dupont pvc'), true);
  assert.equal(matchesSearch(quote, 'dupont signe'), false);
});

run('téléphone avec ou sans espaces, dans les deux sens', () => {
  assert.equal(matchesSearch(quote, '0662689084'), true);
  assert.equal(matchesSearch(quote, '06 62 68 90 84'), true);
  assert.equal(matchesSearch(quote, '06.62.68'), true);
  assert.equal(matchesSearch(quote, '62 68 90'), true);
  assert.equal(matchesSearch(['0662689084'], '06 62 68 90 84'), true);
  assert.equal(matchesSearch(quote, '0662689085'), false);
});

run('numéro de devis avec ou sans DV, séparateurs, partie du numéro', () => {
  assert.equal(matchesSearch(quote, 'DV-262341234'), true);
  assert.equal(matchesSearch(quote, 'dv 262341234'), true);
  assert.equal(matchesSearch(quote, '262341234'), true);
  assert.equal(matchesSearch(quote, '41234'), true);
  assert.equal(matchesSearch(quote, 'dv-26 2341234'), true);
  assert.equal(matchesSearch(quote, '262341235'), false);
});

run('code postal, e-mail, produit, montant', () => {
  assert.equal(matchesSearch(quote, '78290'), true);
  assert.equal(matchesSearch(quote, 'example.com'), true);
  assert.equal(matchesSearch(quote, '2 vantaux'), true);
  assert.equal(matchesSearch(quote, '4530'), true);
});

run('tableaux imbriqués et valeurs vides ignorés', () => {
  const index = buildSearchIndex(['Martin', null, undefined, '', ['Paris', ['75001']]], 0, false);
  assert.equal(matchesSearchIndex(index, 'martin paris 75001'), true);
  assert.equal(matchesSearchIndex(index, 'null'), false);
  assert.equal(matchesSearchIndex(index, 'undefined'), false);
});

run('les chiffres voisins ne se collent pas entre deux champs', () => {
  // « 06 62 … » puis « 78290 » : « 8478290 » n’existe dans aucun champ.
  assert.equal(matchesSearch(['06 62 68 90 84', '78290'], '84 78290'), false);
});

run('découpage : groupes de chiffres fusionnés, mots séparés', () => {
  const tokens = tokenizeSearchQuery('Dupont 06 62 68 DV-26');
  assert.deepEqual(
    tokens.map((token) => token.compact),
    ['dupont', '066268', 'dv26']
  );
});

run('collecte des valeurs d’un objet : textes et nombres, profondeur limitée', () => {
  const analysis = {
    clientName: 'Mme Durand',
    phone: '06 11 22 33 44',
    done: true,
    lines: [{ product: 'Volet roulant', count: 2 }],
    deep: { a: { b: { c: 'trop profond' } } },
  };
  const values = collectSearchValues(analysis);
  assert.deepEqual(values, ['Mme Durand', '06 11 22 33 44', 'Volet roulant', 2]);
  assert.equal(matchesSearch(collectSearchValues(analysis), 'durand volet'), true);
});

console.log(`${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
