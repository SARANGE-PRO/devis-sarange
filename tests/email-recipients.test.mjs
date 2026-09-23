import assert from 'node:assert/strict';
import {
  MAX_RECIPIENTS,
  formatRecipientEmails,
  isEmailAddress,
  parseRecipientEmails,
  validateRecipientEmails,
} from '../lib/email-recipients.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('adresses : forme raisonnable', () => {
  assert.equal(isEmailAddress('jean.dupont@exemple.fr'), true);
  assert.equal(isEmailAddress(' Jean@Exemple.FR '), true);
  assert.equal(isEmailAddress('jean@exemple'), false);
  assert.equal(isEmailAddress('jean exemple.fr'), false);
  assert.equal(isEmailAddress(''), false);
});

run('saisie libre : séparateurs variés, doublons ignorés, ordre conservé', () => {
  assert.deepEqual(
    parseRecipientEmails('jean@exemple.fr, Marie@Exemple.fr; jean@EXEMPLE.fr\n<paul@exemple.fr>  '),
    ['jean@exemple.fr', 'Marie@Exemple.fr', 'paul@exemple.fr']
  );
  assert.deepEqual(parseRecipientEmails(''), []);
  assert.deepEqual(parseRecipientEmails(['a@b.fr', 'c@d.fr']), ['a@b.fr', 'c@d.fr']);
});

run('contrôle : vide, trop nombreux, invalide', () => {
  assert.equal(validateRecipientEmails('jean@exemple.fr, marie@exemple.fr'), null);
  assert.ok(validateRecipientEmails('').includes('au moins une'));
  assert.ok(validateRecipientEmails('jean@exemple.fr, pas-une-adresse').includes('pas-une-adresse'));
  const tooMany = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@exemple.fr`);
  assert.ok(validateRecipientEmails(tooMany).includes(`Au plus ${MAX_RECIPIENTS}`));
});

run('affichage', () => {
  assert.equal(formatRecipientEmails(['a@b.fr', 'c@d.fr']), 'a@b.fr, c@d.fr');
  assert.equal(formatRecipientEmails('a@b.fr;c@d.fr'), 'a@b.fr, c@d.fr');
});

console.log('Tous les tests des destinataires ont reussi.');
