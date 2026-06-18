import assert from 'node:assert/strict';

import {
  MAX_VARIANTS,
  createVirtualVariant,
  getActiveVariant,
  getQuoteVariants,
  isVariantsMode,
  normalizeVariant,
  normalizeVariantsBlock,
} from '../lib/quote-variants.mjs';

// Dépendances de sanitization simulées (le vrai quote-cloud injecte les siennes).
const deps = {
  normalizeCartItems: (items) => (Array.isArray(items) ? items : []),
  normalizeTvaRate: (rate) => (Number.isFinite(Number(rate)) ? Number(rate) : 10),
  normalizeSettings: (settings) => settings || {},
};

// ── Mono-option : variante virtuelle dérivée des champs racine ─────────────────
{
  const monoPayload = {
    cartItems: [{ id: 'a', unitPrice: 100 }],
    tvaRate: 20,
    quoteSettings: { foo: 'bar' },
  };

  assert.equal(isVariantsMode(monoPayload), false, 'mono ne doit pas être en mode variantes');

  const variants = getQuoteVariants(monoPayload, deps);
  assert.equal(variants.length, 1, 'mono renvoie 1 variante virtuelle');
  assert.deepEqual(variants[0].cartItems, monoPayload.cartItems, 'cartItems racine repris');
  assert.equal(variants[0].tvaRate, 20, 'tva racine reprise');

  const active = getActiveVariant(monoPayload, deps);
  assert.equal(active.id, 'var-1', 'id virtuel par défaut');
  assert.deepEqual(active.cartItems, monoPayload.cartItems);
}

// createVirtualVariant utilise activeVariantId s'il est fourni
{
  const variant = createVirtualVariant({ activeVariantId: 'var-xyz', cartItems: [] }, deps);
  assert.equal(variant.id, 'var-xyz', 'reprend activeVariantId');
}

// ── normalizeVariant : id de repli, trims ─────────────────────────────────────
{
  const v = normalizeVariant({ name: '  Gris anthracite  ', summary: '  ouverture droite ' }, 2, deps);
  assert.equal(v.id, 'var-3', 'id de repli déterministe var-{index+1}');
  assert.equal(v.name, 'Gris anthracite', 'name trimé');
  assert.equal(v.summary, 'ouverture droite', 'summary trimé');
  assert.deepEqual(v.cartItems, [], 'cartItems par défaut');
  assert.equal(v.tvaRate, 10, 'tva par défaut via deps');
}

// ── normalizeVariantsBlock : ids stables + activeVariantId valide ──────────────
{
  const payload = {
    variantsMode: true,
    activeVariantId: 'var-b',
    variants: [
      { id: 'var-a', name: 'Blanc', cartItems: [{ id: '1' }], tvaRate: 10 },
      { id: 'var-b', name: 'Gris', cartItems: [{ id: '2' }], tvaRate: 5.5 },
    ],
  };
  const block = normalizeVariantsBlock(payload, deps);
  assert.equal(block.variants.length, 2);
  assert.deepEqual(
    block.variants.map((v) => v.id),
    ['var-a', 'var-b'],
    'ids préservés'
  );
  assert.equal(block.activeVariantId, 'var-b', 'activeVariantId valide conservé');
}

// activeVariantId invalide → repli sur la première variante
{
  const block = normalizeVariantsBlock(
    {
      variantsMode: true,
      activeVariantId: 'inconnue',
      variants: [{ id: 'var-a', name: 'A' }, { id: 'var-b', name: 'B' }],
    },
    deps
  );
  assert.equal(block.activeVariantId, 'var-a', 'repli sur la première variante');
}

// Garde-fou : au moins 1 variante (fabriquée depuis la racine si variants vide)
{
  const block = normalizeVariantsBlock(
    {
      variantsMode: true,
      variants: [],
      cartItems: [{ id: 'racine' }],
      tvaRate: 20,
    },
    deps
  );
  assert.equal(block.variants.length, 1, 'au moins une variante garantie');
  assert.deepEqual(block.variants[0].cartItems, [{ id: 'racine' }], 'fabriquée depuis la racine');
  assert.equal(block.activeVariantId, block.variants[0].id, 'activeVariantId pointe la variante');
}

// ── getActiveVariant en mode variantes ────────────────────────────────────────
{
  const payload = {
    variantsMode: true,
    activeVariantId: 'var-b',
    variants: [
      { id: 'var-a', name: 'A', cartItems: [], tvaRate: 10 },
      { id: 'var-b', name: 'B', cartItems: [{ id: 'x' }], tvaRate: 10 },
    ],
  };
  assert.equal(isVariantsMode(payload), true);
  assert.equal(getActiveVariant(payload, deps).id, 'var-b', 'sélectionne la variante active');
  assert.equal(getQuoteVariants(payload, deps).length, 2);
}

// variantsMode true mais variants vide → traité comme mono (pas de mode variantes réel)
{
  assert.equal(
    isVariantsMode({ variantsMode: true, variants: [] }),
    false,
    'variantsMode sans variantes => non actif'
  );
}

// ── Constante de limite ───────────────────────────────────────────────────────
assert.equal(MAX_VARIANTS, 4, 'limite raisonnable de 4 variantes');

console.log('quote-variants helpers ok');
