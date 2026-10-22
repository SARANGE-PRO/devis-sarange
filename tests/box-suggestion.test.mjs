import assert from 'node:assert/strict';
import { getBoxManoeuvre, getBoxSuggestionLines } from '../lib/box-suggestion.mjs';
import { isSuggestedOptionsLine } from '../lib/suggested-options.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const variants = [
  { id: 'box_domotique_gaposa_rollappx', label: 'Box domotique GAPOSA RollAppX', priceHt: 179 },
  { id: 'box_domotique_cherubini_metahome', label: 'Box domotique CHERUBINI METAHome', priceHt: 258 },
];
const fmt = (n) => `${n.toFixed(2).replace('.', ',')} €`;

run('manœuvre pilotable : volets radio et solaires, seuls ou monoblocs', () => {
  assert.equal(getBoxManoeuvre({ productId: 'volet-radio' }), 'radio');
  assert.equal(getBoxManoeuvre({ productId: 'volet-solaire' }), 'solaire');
  assert.equal(getBoxManoeuvre({ productId: 'volet-filaire' }), '');
  assert.equal(getBoxManoeuvre({ productId: 'volet-manuel' }), '');
  assert.equal(getBoxManoeuvre({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' }), 'radio');
  assert.equal(getBoxManoeuvre({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'filaire' }), '');
  assert.equal(getBoxManoeuvre({ isComposite: true, voletMonobloc: true, voletMonoblocManoeuvre: 'solaire' }), 'solaire');
});

run('une seule ligne par type de volet, sous le premier poste concerné', () => {
  const items = [
    { id: 'a', productId: 'fenetre-2v' },
    { id: 'b', productId: 'volet-radio' },
    { id: 'c', productId: 'volet-radio' },
    { id: 'd', productId: 'fenetre-1v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' },
  ];
  const lines = getBoxSuggestionLines(items, variants, fmt);
  assert.equal(lines.size, 1);
  assert.equal(
    lines.get('b'),
    'En option (non inclus) : box domotique CHERUBINI METAHome, pilotage des volets depuis le téléphone, compatible Alexa et Google +258,00 € HT'
  );
  assert.ok(isSuggestedOptionsLine(lines.get('b')), 'même style discret que les autres options');
});

run('radio et solaire au même devis : chaque box sous son premier volet', () => {
  const lines = getBoxSuggestionLines(
    [
      { id: 's', productId: 'volet-solaire' },
      { id: 'r', productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' },
    ],
    variants,
    fmt
  );
  assert.ok(lines.get('s').includes('GAPOSA RollAppX') && lines.get('s').includes('+179,00 € HT'));
  assert.ok(lines.get('r').includes('CHERUBINI METAHome'));
  // Les deux sur le même poste : deux lignes.
  const same = getBoxSuggestionLines(
    [{ id: 'x', productId: 'volet-radio' }, { id: 'y', productId: 'volet-solaire' }],
    variants,
    fmt
  );
  assert.equal(same.size, 2);
});

run('prix de la box remisé comme le volet concerné', () => {
  const lines = getBoxSuggestionLines(
    [
      { id: 's', productId: 'volet-solaire', remise: 20 },
      { id: 'r', productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio', remise: 10 },
    ],
    variants,
    fmt
  );
  assert.ok(lines.get('s').endsWith('+143,20 € HT'), lines.get('s'));
  assert.ok(lines.get('r').endsWith('+232,20 € HT'), lines.get('r'));
});

run('rien si la box est déjà au devis, ni pour filaire ou manuel', () => {
  assert.equal(
    getBoxSuggestionLines(
      [
        { id: 'b', productId: 'volet-radio' },
        { id: 'box', productId: 'volet-box-domotique', productVariantId: 'box_domotique_cherubini_metahome' },
      ],
      variants,
      fmt
    ).size,
    0
  );
  assert.equal(getBoxSuggestionLines([{ id: 'f', productId: 'volet-filaire' }, { id: 'm', productId: 'volet-manuel' }], variants, fmt).size, 0);
  assert.equal(getBoxSuggestionLines([], variants, fmt).size, 0);
  assert.equal(getBoxSuggestionLines(null, variants, fmt).size, 0);
});

console.log('Tous les tests de box domotique suggérée ont reussi.');
