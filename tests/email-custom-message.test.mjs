import assert from 'node:assert/strict';
import {
  CUSTOM_MESSAGE_PLACEHOLDER,
  MAX_CUSTOM_MESSAGE_LENGTH,
  customMessageToHtml,
  normalizeCustomMessage,
  normalizeCustomSubject,
  resolveCustomMessage,
  resolveCustomSubject,
} from '../lib/email-custom-message.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('objet : une seule ligne, borné', () => {
  assert.equal(normalizeCustomSubject('  Votre devis\n n°12  '), 'Votre devis n°12');
  assert.equal(normalizeCustomSubject('x'.repeat(200)).length, 150);
  assert.equal(normalizeCustomSubject(null), '');
});

run('message : retours à la ligne unifiés, lignes vides limitées, borné', () => {
  assert.equal(normalizeCustomMessage('Bonjour,\r\n\r\n\r\n\r\nVoici le devis.   \n'), 'Bonjour,\n\nVoici le devis.');
  assert.equal(normalizeCustomMessage('x'.repeat(3000)).length, MAX_CUSTOM_MESSAGE_LENGTH);
  assert.equal(normalizeCustomMessage(undefined), '');
});

run('texte identique au gabarit ou vide : rien de personnalisé', () => {
  const defaultMessage = 'Veuillez trouver ci-joint votre devis.\n\nEn tant que fabricant direct…';
  assert.equal(resolveCustomMessage('', defaultMessage), null);
  assert.equal(resolveCustomMessage('  Veuillez trouver ci-joint votre devis.\n\n\nEn tant que fabricant direct… ', defaultMessage), null);
  assert.equal(resolveCustomMessage('Bonjour, voici le devis corrigé.', defaultMessage), 'Bonjour, voici le devis corrigé.');
  assert.equal(resolveCustomSubject('Votre devis SARANGE', 'Votre devis SARANGE'), null);
  assert.equal(resolveCustomSubject('Devis fenêtres, version 2', 'Votre devis SARANGE'), 'Devis fenêtres, version 2');
});

run('HTML : paragraphes, retours simples, texte échappé', () => {
  const html = customMessageToHtml('Bonjour <M. Dupont>,\nvoici le devis.\n\nÀ bientôt & merci.');
  assert.equal(
    html,
    '<p style="line-height: 1.6; color: #475569; font-size: 16px;">Bonjour &lt;M. Dupont&gt;,<br>voici le devis.</p>\n' +
      '<p style="line-height: 1.6; color: #475569; font-size: 16px;">À bientôt &amp; merci.</p>'
  );
  // Le repère d'aperçu traverse le rendu tel quel.
  assert.ok(customMessageToHtml(CUSTOM_MESSAGE_PLACEHOLDER).includes(CUSTOM_MESSAGE_PLACEHOLDER));
  assert.equal(customMessageToHtml(''), '');
});

console.log('Tous les tests du message personnalisé ont reussi.');
