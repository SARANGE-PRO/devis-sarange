import assert from 'node:assert/strict';
import {
  formatPhoneInput,
  formatPhoneNumber,
  formatPhoneWhileTyping,
  getPhoneComparisonKey,
  getPhoneDigits,
  getPhoneHref,
  matchesSearchTerm,
} from '../lib/phone.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('Numéro français : groupes de 2', () => {
  assert.equal(formatPhoneNumber('0662689084'), '06 62 68 90 84');
  assert.equal(formatPhoneNumber('06.62.68.90.84'), '06 62 68 90 84');
  assert.equal(formatPhoneNumber('06-62-68-90-84'), '06 62 68 90 84');
  assert.equal(formatPhoneNumber('06 62 68 90 84'), '06 62 68 90 84');
  assert.equal(formatPhoneNumber('0986713444'), '09 86 71 34 44');
  assert.equal(formatPhoneNumber('01 60 00 00 00'), '01 60 00 00 00');
});

run('Mise en forme idempotente', () => {
  const once = formatPhoneNumber('0662689084');
  assert.equal(formatPhoneNumber(once), once);
  assert.equal(formatPhoneNumber(formatPhoneNumber('+33662689084')), '+33 6 62 68 90 84');
  assert.equal(formatPhoneNumber(formatPhoneNumber('+32475123456')), '+32 475 12 34 56');
});

run('Le +33 est conservé, jamais converti en 06', () => {
  assert.equal(formatPhoneNumber('+33662689084'), '+33 6 62 68 90 84');
  assert.equal(formatPhoneNumber('+33 6 62 68 90 84'), '+33 6 62 68 90 84');
  assert.equal(formatPhoneNumber('0033662689084'), '+33 6 62 68 90 84');
  assert.equal(formatPhoneNumber('+33 (0)6 62 68 90 84'), '+33 6 62 68 90 84');
});

run('Numéros étrangers : indicatif isolé, usage local respecté', () => {
  assert.equal(formatPhoneNumber('+32475123456'), '+32 475 12 34 56'); // Belgique mobile
  assert.equal(formatPhoneNumber('+3223456789'), '+32 2 345 67 89'); // Belgique fixe
  assert.equal(formatPhoneNumber('+41791234567'), '+41 79 123 45 67'); // Suisse
  assert.equal(formatPhoneNumber('+12125551234'), '+1 212 555 1234'); // USA / Canada
  assert.equal(formatPhoneNumber('+351912345678'), '+351 912 345 678'); // Portugal
  assert.equal(formatPhoneNumber('+352621123456'), '+352 621 123 456'); // Luxembourg
  assert.equal(formatPhoneNumber('+212612345678'), '+212 6 12 34 56 78'); // Maroc
  assert.equal(formatPhoneNumber('+34612345678'), '+34 612 345 678'); // Espagne
  assert.equal(formatPhoneNumber('+393331234567'), '+39 333 123 4567'); // Italie
});

run('Indicatif inconnu : paires, indicatif correctement isolé', () => {
  // 81 (Japon) fait partie des indicatifs à 2 chiffres, 358 (Finlande) à 3.
  assert.equal(formatPhoneNumber('+81312345678'), '+81 312 34 56 78');
  assert.equal(formatPhoneNumber('+358401234567'), '+358 401 23 45 67');
  assert.equal(formatPhoneNumber('+7 4951234567'), '+7 495 123 45 67');
});

run('Saisie non numérique laissée intacte', () => {
  assert.equal(formatPhoneNumber('06 12 34 56 78 poste 2'), '06 12 34 56 78 poste 2');
  assert.equal(formatPhoneNumber('sur rendez-vous'), 'sur rendez-vous');
  assert.equal(formatPhoneNumber(''), '');
  assert.equal(formatPhoneNumber(null), '');
  assert.equal(formatPhoneNumber('   '), '');
});

run('Deux numéros dans le même champ : jamais fusionnés', () => {
  assert.equal(formatPhoneNumber('0662689084 / 0160000000'), '06 62 68 90 84 / 01 60 00 00 00');
  assert.equal(formatPhoneNumber('0662689084, +33160000000'), '06 62 68 90 84, +33 1 60 00 00 00');
  assert.equal(formatPhoneNumber('0662689084/0160000000'), '06 62 68 90 84 / 01 60 00 00 00');
});

run('Numéro aberrant : on ne touche à rien', () => {
  assert.equal(formatPhoneNumber('123456789012345678901'), '123456789012345678901');
});

run('Frappe : mise en forme progressive', () => {
  assert.equal(formatPhoneInput('0'), '0');
  assert.equal(formatPhoneInput('06'), '06');
  assert.equal(formatPhoneInput('066'), '06 6');
  assert.equal(formatPhoneInput('0662'), '06 62');
  assert.equal(formatPhoneInput('06626'), '06 62 6');
  assert.equal(formatPhoneInput('+'), '+');
  assert.equal(formatPhoneInput('+3'), '+3');
  assert.equal(formatPhoneInput('+33'), '+33');
  assert.equal(formatPhoneInput('+336'), '+33 6');
  assert.equal(formatPhoneInput('+3366'), '+33 6 6');
});

run('Frappe : le curseur au milieu bloque la mise en forme', () => {
  // Curseur en bout de champ → on met en forme.
  assert.equal(formatPhoneWhileTyping('0662689084', 10), '06 62 68 90 84');
  // Curseur au milieu (correction d'un chiffre) → saisie laissée telle quelle.
  assert.equal(formatPhoneWhileTyping('06 62 68 9084', 5), '06 62 68 9084');
});

run('Clé de comparaison : 06… et +33 6… se rejoignent', () => {
  assert.equal(getPhoneComparisonKey('06 62 68 90 84'), '0662689084');
  assert.equal(getPhoneComparisonKey('+33 6 62 68 90 84'), '0662689084');
  assert.equal(getPhoneComparisonKey('0033662689084'), '0662689084');
  assert.equal(getPhoneComparisonKey('+32 475 12 34 56'), '32475123456');
  assert.equal(getPhoneComparisonKey(''), '');
  assert.equal(getPhoneComparisonKey('06 62 68 90 84 / 01 60 00 00 00'), '0662689084');
});

run('Lien tel: en E.164', () => {
  assert.equal(getPhoneHref('06 62 68 90 84'), 'tel:+33662689084');
  assert.equal(getPhoneHref('+33 6 62 68 90 84'), 'tel:+33662689084');
  assert.equal(getPhoneHref('0033 6 62 68 90 84'), 'tel:+33662689084');
  assert.equal(getPhoneHref('+32 475 12 34 56'), 'tel:+32475123456');
  assert.equal(getPhoneHref('06 62 68 90 84 / 01 60 00 00 00'), 'tel:+33662689084');
  assert.equal(getPhoneHref(''), '');
});

run('getPhoneDigits inchangé', () => {
  assert.equal(getPhoneDigits('06 62 68 90 84'), '0662689084');
  assert.equal(getPhoneDigits('+33 6 62 68 90 84'), '33662689084');
});

console.log('\nTous les tests téléphone sont passés.');
