import assert from 'node:assert/strict';
import {
  GENERIC_COMPLETION_LINK_TEXTS,
  buildCompletionLinkPreviewTexts,
} from '../lib/completion-link-preview.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const noEmDash = (texts) => assert.ok(!Object.values(texts).join(' ').includes('—'));

const base = {
  mode: 'quote-linked',
  docType: 'reception',
  status: 'sent',
  quoteNumber: 'DV-262341234',
  recipientName: 'Jean Dupont',
};

run('bon de fin de chantier à signer : travaux terminés', () => {
  const texts = buildCompletionLinkPreviewTexts(base);
  assert.equal(texts.title, 'Votre bon de fin de chantier SARANGE est prêt à signer');
  assert.ok(texts.description.startsWith('Bonjour Jean Dupont, vos travaux (devis n° DV-262341234) sont terminés'));
  assert.ok(texts.description.includes('signez votre bon de fin de chantier'));
  assert.equal(texts.headline, 'Vos travaux sont terminés');
  assert.equal(texts.details, 'Devis n° DV-262341234');
  assert.equal(texts.badge, 'Vérifier et signer');
  noEmDash(texts);
});

run('bon de livraison ou d’enlèvement : menuiseries remises', () => {
  const livraison = buildCompletionLinkPreviewTexts({ ...base, docType: 'livraison' });
  assert.equal(livraison.title, 'Votre bon de livraison SARANGE est prêt à signer');
  assert.ok(livraison.description.includes('vos menuiseries vous ont été remises'));
  assert.ok(livraison.description.includes('signez votre bon de livraison'));
  assert.equal(livraison.headline, 'Vos menuiseries vous ont été remises');

  const enlevement = buildCompletionLinkPreviewTexts({ ...base, docType: 'enlevement' });
  assert.equal(enlevement.title, "Votre bon d'enlèvement SARANGE est prêt à signer");
  // Jamais « fin de chantier » sans pose.
  assert.ok(!enlevement.description.includes('fin de chantier'));
});

run('bon signé, lien expiré, signature refusée', () => {
  const signed = buildCompletionLinkPreviewTexts({ ...base, status: 'received_with_reserves' });
  assert.equal(signed.title, 'Bon de fin de chantier SARANGE signé');
  assert.ok(signed.description.startsWith('Merci Jean Dupont'));
  assert.equal(signed.badge, 'Consulter le bon signé');

  const lifted = buildCompletionLinkPreviewTexts({ ...base, docType: 'livraison', status: 'reserves_lifted' });
  assert.equal(lifted.title, 'Bon de livraison SARANGE signé');

  const expired = buildCompletionLinkPreviewTexts({ ...base, status: 'expired' });
  assert.ok(expired.title.includes('a expiré'));

  const refused = buildCompletionLinkPreviewTexts({ ...base, status: 'refused' });
  assert.ok(refused.title.includes('signature refusée'));
  noEmDash(refused);
});

run('PV de levée des réserves : à signer puis signé', () => {
  const lift = {
    mode: 'reserves-lift',
    docType: 'reception',
    status: 'sent',
    quoteNumber: 'DV-262341234',
    completionNumber: 'BFC-262351012',
    recipientName: 'Jean Dupont',
  };
  const ready = buildCompletionLinkPreviewTexts(lift);
  assert.equal(ready.title, 'PV de levée des réserves SARANGE à signer');
  assert.ok(ready.description.startsWith('Bonjour Jean Dupont, les réserves de votre chantier ont été corrigées'));
  assert.equal(ready.headline, 'Levée des réserves de votre chantier');
  assert.equal(ready.details, 'Bon n° BFC-262351012');

  const signed = buildCompletionLinkPreviewTexts({ ...lift, status: 'reserves_lifted' });
  assert.equal(signed.title, 'PV de levée des réserves SARANGE signé');
  assert.equal(signed.headline, 'Réserves levées, merci !');
  noEmDash(signed);
});

run('session inconnue et lien général : textes propres', () => {
  const unknown = buildCompletionLinkPreviewTexts(null);
  assert.equal(unknown.title, 'Votre bon SARANGE en ligne');
  assert.ok(unknown.description.includes('sécurisé'));

  // Champs manquants : phrases sans trou.
  const sparse = buildCompletionLinkPreviewTexts({ status: 'sent' });
  assert.equal(sparse.title, 'Votre bon de fin de chantier SARANGE est prêt à signer');
  assert.ok(sparse.description.startsWith('Bonjour, vos travaux sont terminés'));
  assert.equal(sparse.details, '');

  assert.equal(GENERIC_COMPLETION_LINK_TEXTS.title, 'Votre bon SARANGE en ligne');
  assert.ok(GENERIC_COMPLETION_LINK_TEXTS.description.includes('livraison ou enlèvement'));
  noEmDash(GENERIC_COMPLETION_LINK_TEXTS);
});

console.log('Tous les tests d’aperçu des liens de bon ont reussi.');
