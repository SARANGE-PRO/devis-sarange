import assert from 'node:assert/strict';
import { buildSignatureLinkPreviewTexts } from '../lib/quote-signature-preview.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const base = {
  deliveryMode: 'signature',
  status: 'sent',
  quoteNumber: 'DV-262341234',
  recipientName: 'Jean Dupont',
  totalTTC: 2810.58,
  variantsMode: false,
};

run('lien à signer : titre et description personnalisés', () => {
  const texts = buildSignatureLinkPreviewTexts(base);

  assert.equal(texts.title, 'Votre devis SARANGE n° DV-262341234 est prêt à être signé');
  assert.ok(texts.description.startsWith('Bonjour Jean Dupont, votre devis n° DV-262341234'));
  assert.ok(texts.description.includes('TTC)'));
  assert.ok(texts.description.includes('signer en ligne'));
  assert.equal(texts.headline, 'Votre devis est prêt à être signé');
  assert.equal(texts.badge, 'Signer en ligne');
  assert.ok(texts.details.includes('DV-262341234'));
  // Jamais de tiret cadratin dans les textes montrés au client.
  assert.ok(!Object.values(texts).join(' ').includes('—'));
});

run('plusieurs variantes : aucun montant affiché', () => {
  const texts = buildSignatureLinkPreviewTexts({ ...base, variantsMode: true });
  assert.ok(!texts.description.includes('TTC'));
  assert.ok(!texts.details.includes('TTC'));
});

run('devis signé, lien expiré, signature refusée', () => {
  const signed = buildSignatureLinkPreviewTexts({ ...base, status: 'signed' });
  assert.equal(signed.title, 'Devis SARANGE n° DV-262341234 signé');
  assert.ok(signed.description.startsWith('Merci Jean Dupont'));
  assert.equal(signed.headline, 'Votre devis est signé, merci !');

  const expired = buildSignatureLinkPreviewTexts({ ...base, status: 'expired' });
  assert.ok(expired.title.includes('a expiré'));
  assert.ok(expired.description.includes('nouveau lien'));

  const refused = buildSignatureLinkPreviewTexts({ ...base, status: 'refused' });
  assert.ok(refused.title.includes('signature refusée'));
});

run('envoi simple (sans signature) : consultation seulement', () => {
  const texts = buildSignatureLinkPreviewTexts({ ...base, deliveryMode: 'email' });
  assert.equal(texts.title, 'Votre devis SARANGE n° DV-262341234');
  assert.ok(!texts.description.includes('signer'));
  assert.equal(texts.badge, 'Consulter le devis');
});

run('session inconnue : textes génériques, jamais d’erreur', () => {
  const texts = buildSignatureLinkPreviewTexts(null);
  assert.equal(texts.title, 'Votre devis SARANGE en ligne');
  assert.ok(texts.description.includes('sécurisé'));

  // Champs manquants : phrases toujours propres (pas de double espace ni de « n° » vide).
  const sparse = buildSignatureLinkPreviewTexts({ status: 'sent' });
  assert.equal(sparse.title, 'Votre devis SARANGE est prêt à être signé');
  assert.ok(sparse.description.startsWith('Bonjour, votre devis vous attend'));
  assert.ok(!sparse.title.includes('  '));
});

console.log('Tous les tests d’aperçu des liens de signature ont reussi.');
