import assert from 'node:assert/strict';
import {
  VARIANT_SUMMARY_MAX_LENGTH,
  buildAutoVariantSummary,
  normalizeVariantSummary,
  resolveVariantSummary,
} from '../lib/variant-summary.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const fenetre = {
  id: 'f1',
  productId: 'fenetre-2v',
  productLabel: 'Fenêtre 2 vantaux',
  colorOption: { label: 'PVC Blanc' },
  glazingOption: { label: 'Double vitrage FE' },
  includePose: true,
};
const base = { id: 'a', cartItems: [fenetre, { id: 'p1', productLabel: 'Porte-fenêtre 2 vantaux', includePose: true }] };

run('variante A : configuration de base', () => {
  assert.equal(buildAutoVariantSummary(base, base), 'Configuration de base');
});

run('différences poste par poste : coloris, vitrage, volet, pose', () => {
  const b = {
    id: 'b',
    cartItems: [
      { ...fenetre, marketingFinition: 'Gris anthracite 7016', glazingOption: { label: 'Feuilleté 44.2' }, voletMonobloc: true, voletMonoblocManoeuvre: 'radio' },
      { id: 'p1', productLabel: 'Porte-fenêtre 2 vantaux', includePose: true },
    ],
  };
  assert.equal(
    buildAutoVariantSummary(b, base),
    'Coloris Gris anthracite 7016 · Vitrage Feuilleté 44.2 · Volet roulant monobloc radio'
  );
  const c = { id: 'c', cartItems: base.cartItems.map((item) => ({ ...item, includePose: false })) };
  assert.equal(buildAutoVariantSummary(c, base), 'Sans pose', 'sans doublon');
});

run('aluminium, produit remplacé, poste ajouté ou retiré', () => {
  const alu = { id: 'b', cartItems: [{ ...fenetre, productId: 'fenetre-2v-alu', material: 'alu' }, base.cartItems[1]] };
  assert.equal(buildAutoVariantSummary(alu, base), 'Aluminium');
  const changed = { id: 'b', cartItems: [{ ...fenetre, productLabel: 'Fenêtre 3 vantaux' }] };
  assert.equal(buildAutoVariantSummary(changed, base), 'Fenêtre 3 vantaux · Sans Porte-fenêtre 2 vantaux');
  const added = { id: 'b', cartItems: [...base.cartItems, { id: 'v1', productLabel: 'Volet roulant radio' }] };
  assert.equal(buildAutoVariantSummary(added, base), '+ Volet roulant radio');
});

run('au plus 4 différences, sinon « … » ; rien de différent = conditions', () => {
  const many = {
    id: 'b',
    cartItems: [
      { ...fenetre, marketingFinition: 'Noir', glazingOption: { label: 'Triple' }, voletMonobloc: true, petitsBoisH: 2, includePose: false },
    ],
  };
  const text = buildAutoVariantSummary(many, base);
  assert.ok(text.endsWith('…'));
  assert.equal(text.split(' · ').length, 4);
  assert.equal(buildAutoVariantSummary({ id: 'b', cartItems: base.cartItems }, base), 'Même configuration, conditions différentes');
});

run('texte saisi prioritaire, nettoyé et borné ; vide = automatique', () => {
  assert.equal(normalizeVariantSummary('  Option   motorisée  '), 'Option motorisée');
  assert.equal(normalizeVariantSummary('x'.repeat(400)).length, VARIANT_SUMMARY_MAX_LENGTH);
  assert.equal(resolveVariantSummary({ id: 'b', summary: 'Mon texte', cartItems: [] }, base), 'Mon texte');
  assert.equal(resolveVariantSummary({ id: 'a', summary: '  ', cartItems: [] }, base), 'Configuration de base');
});

console.log('Tous les tests du résumé des variantes ont reussi.');
