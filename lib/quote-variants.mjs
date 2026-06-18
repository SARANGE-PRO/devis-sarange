/**
 * quote-variants.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Logique PURE des « variantes de configuration » d'un devis.
 *
 * Une variante = un snapshot nommé de { cartItems, tvaRate, quoteSettings } sur
 * le MÊME périmètre produit (le nom décrit la différence réelle de config :
 * couleur, sens d'ouverture, vitrage, motorisation, présence d'un volet…).
 *
 * Ce module n'importe AUCUN alias '@/' : les fonctions de sanitization
 * (cartItems, TVA, réglages) sont INJECTÉES par l'appelant (quote-cloud), ce
 * qui le rend testable en isolation par le runner Node du projet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Limite raisonnable (UX/log, pas une erreur dure).
export const MAX_VARIANTS = 4;

const identity = (value) => value;

const resolveDeps = (deps = {}) => ({
  normalizeCartItems:
    typeof deps.normalizeCartItems === 'function' ? deps.normalizeCartItems : identity,
  normalizeTvaRate:
    typeof deps.normalizeTvaRate === 'function' ? deps.normalizeTvaRate : identity,
  normalizeSettings:
    typeof deps.normalizeSettings === 'function' ? deps.normalizeSettings : identity,
});

/**
 * Vrai si le payload est explicitement en mode multi-variantes.
 */
export const isVariantsMode = (payload = {}) =>
  payload?.variantsMode === true &&
  Array.isArray(payload?.variants) &&
  payload.variants.length > 0;

/**
 * Fabrique la variante « virtuelle » d'un devis mono-option à partir des champs
 * racine (cartItems / tvaRate / quoteSettings). Permet au reste du code de
 * toujours raisonner sur « une liste de variantes ».
 */
export const createVirtualVariant = (payload = {}, deps = {}) => {
  const { normalizeCartItems, normalizeTvaRate, normalizeSettings } = resolveDeps(deps);
  return {
    id:
      typeof payload?.activeVariantId === 'string' && payload.activeVariantId.trim()
        ? payload.activeVariantId.trim()
        : 'var-1',
    name: '',
    summary: '',
    cartItems: normalizeCartItems(Array.isArray(payload?.cartItems) ? payload.cartItems : []),
    tvaRate: normalizeTvaRate(payload?.tvaRate),
    quoteSettings: normalizeSettings(payload?.quoteSettings),
  };
};

/**
 * Normalise une entrée de variante (id stable, libellés trimés, snapshot sain).
 */
export const normalizeVariant = (variant, index = 0, deps = {}) => {
  const { normalizeCartItems, normalizeTvaRate, normalizeSettings } = resolveDeps(deps);
  const safe = variant && typeof variant === 'object' ? variant : {};

  return {
    id:
      typeof safe.id === 'string' && safe.id.trim() ? safe.id.trim() : `var-${index + 1}`,
    name: typeof safe.name === 'string' ? safe.name.trim() : '',
    summary: typeof safe.summary === 'string' ? safe.summary.trim() : '',
    cartItems: normalizeCartItems(Array.isArray(safe.cartItems) ? safe.cartItems : []),
    tvaRate: normalizeTvaRate(safe.tvaRate),
    quoteSettings: normalizeSettings(safe.quoteSettings),
  };
};

/**
 * Construit le bloc variantes normalisé { variants, activeVariantId } à partir
 * d'un payload en mode variantes. Garantit AU MOINS une variante (fabriquée
 * depuis la racine si `variants` est vide) et un `activeVariantId` valide.
 */
export const normalizeVariantsBlock = (payload = {}, deps = {}) => {
  const rawVariants =
    Array.isArray(payload?.variants) && payload.variants.length > 0
      ? payload.variants
      : [
          {
            id: payload?.activeVariantId || 'var-1',
            name: '',
            summary: '',
            cartItems: payload?.cartItems,
            tvaRate: payload?.tvaRate,
            quoteSettings: payload?.quoteSettings,
          },
        ];

  const variants = rawVariants.map((variant, index) => normalizeVariant(variant, index, deps));

  let activeVariantId =
    typeof payload?.activeVariantId === 'string' ? payload.activeVariantId : '';
  if (!variants.some((variant) => variant.id === activeVariantId)) {
    activeVariantId = variants[0].id;
  }

  return { variants, activeVariantId };
};

/**
 * Renvoie TOUJOURS une liste de variantes : les vraies en mode variantes, sinon
 * une variante virtuelle dérivée des champs racine (mono-option).
 */
export const getQuoteVariants = (payload = {}, deps = {}) => {
  if (isVariantsMode(payload)) return payload.variants;
  return [createVirtualVariant(payload, deps)];
};

/**
 * Renvoie la variante active (celle éditée/affichée en back-office). En
 * mono-option, c'est la variante virtuelle.
 */
export const getActiveVariant = (payload = {}, deps = {}) => {
  const variants = getQuoteVariants(payload, deps);
  if (isVariantsMode(payload) && payload?.activeVariantId) {
    return variants.find((variant) => variant.id === payload.activeVariantId) || variants[0];
  }
  return variants[0];
};
