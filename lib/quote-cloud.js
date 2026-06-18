import { normalizeQuoteSettings } from '@/lib/quote-settings.mjs';
import {
  DEFAULT_TVA_RATE,
  computeQuoteTotals,
  normalizeOptionalTvaRate,
  normalizeTvaRate,
} from '@/lib/quote-totals.mjs';
import {
  buildClientSearchText,
  getClientFullLocation,
  getClientFullName,
  sanitizeClientData,
} from '@/lib/client-cloud';
import {
  MAX_VARIANTS,
  getActiveVariant as getActiveVariantPure,
  getQuoteVariants as getQuoteVariantsPure,
  isVariantsMode,
  normalizeVariantsBlock,
} from '@/lib/quote-variants.mjs';
const MAX_CUSTOM_IMAGE_LENGTH = 120000;

export { MAX_VARIANTS, isVariantsMode };

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

const sanitizeCartItem = (item) => {
  if (!isPlainObject(item)) return item;

  const nextItem = (
    typeof item.customImage === 'string' &&
    item.customImage.length > MAX_CUSTOM_IMAGE_LENGTH
  )
    ? {
        ...item,
        customImage: null,
      }
    : { ...item };

  const normalizedItemTvaRate = normalizeOptionalTvaRate(nextItem.tvaRate);
  if (normalizedItemTvaRate !== undefined) {
    nextItem.tvaRate = normalizedItemTvaRate;
  } else {
    delete nextItem.tvaRate;
  }

  return nextItem;
};

export const removeUndefinedDeep = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((accumulator, [key, entry]) => {
      const sanitized = removeUndefinedDeep(entry);
      if (sanitized !== undefined) {
        accumulator[key] = sanitized;
      }
      return accumulator;
    }, {});
  }

  return value === undefined ? undefined : value;
};

export const normalizeQuoteStep = (step) => {
  const parsed = Number.parseInt(step, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(3, Math.max(1, parsed));
};

export const getDefaultQuoteTitle = (clientData = null, reference = '') => {
  const trimmedReference = typeof reference === 'string' ? reference.trim() : '';
  if (trimmedReference) return trimmedReference;

  const fullName = getClientFullName(clientData);
  if (fullName) return `Devis ${fullName}`;

  return 'Devis sans titre';
};

// Sanitizers injectés dans la logique pure des variantes (lib/quote-variants.mjs)
// pour réutiliser EXACTEMENT la même normalisation que les cartItems racine.
const VARIANT_DEPS = {
  normalizeCartItems: (items) =>
    (Array.isArray(items) ? items : []).map((item) =>
      sanitizeCartItem(removeUndefinedDeep(item))
    ),
  normalizeTvaRate: (rate) => normalizeTvaRate(rate, DEFAULT_TVA_RATE),
  normalizeSettings: (settings) => normalizeQuoteSettings(settings),
};

// Helpers publics liés aux dépendances réelles (le reste de l'app passe par eux).
export const getQuoteVariants = (payload = {}) => getQuoteVariantsPure(payload, VARIANT_DEPS);
export const getActiveVariant = (payload = {}) => getActiveVariantPure(payload, VARIANT_DEPS);

export const normalizeQuotePayload = (payload = {}) => {
  // La référence appartient au devis (un client peut avoir plusieurs chantiers).
  // Migration : les anciens devis la stockaient dans clientData.referenceDevis.
  const legacyReference =
    typeof payload?.clientData?.referenceDevis === 'string'
      ? payload.clientData.referenceDevis.trim()
      : '';
  const reference =
    typeof payload?.reference === 'string' ? payload.reference.trim() : legacyReference;

  // Mode VARIANTES : on normalise variants[] + activeVariantId.
  // (les champs cartItems/tvaRate/quoteSettings racine n'existent plus.)
  if (payload?.variantsMode === true) {
    const { variants, activeVariantId } = normalizeVariantsBlock(payload, VARIANT_DEPS);
    return removeUndefinedDeep({
      clientData: payload?.clientData ? sanitizeClientData(payload.clientData) : null,
      variantsMode: true,
      activeVariantId,
      variants,
      currentStep: normalizeQuoteStep(payload?.currentStep),
      reference: reference || undefined,
    });
  }

  // Mode MONO-OPTION (défaut) : schéma plat ACTUEL, strictement inchangé.
  const nextPayload = {
    clientData: payload?.clientData ? sanitizeClientData(payload.clientData) : null,
    cartItems: Array.isArray(payload?.cartItems)
      ? payload.cartItems.map((item) => sanitizeCartItem(removeUndefinedDeep(item)))
      : [],
    tvaRate: normalizeTvaRate(payload?.tvaRate, DEFAULT_TVA_RATE),
    currentStep: normalizeQuoteStep(payload?.currentStep),
    quoteSettings: normalizeQuoteSettings(payload?.quoteSettings),
    reference: reference || undefined,
  };

  return removeUndefinedDeep(nextPayload);
};

export const buildQuoteDraftRecord = ({
  title,
  clientData,
  cartItems,
  tvaRate,
  currentStep,
  quoteSettings,
  reference,
  variantsMode,
  variants,
  activeVariantId,
  status = 'draft',
}) => {
  const payload = normalizeQuotePayload({
    clientData,
    cartItems,
    tvaRate,
    currentStep,
    quoteSettings,
    reference,
    variantsMode,
    variants,
    activeVariantId,
  });
  const effectiveReference = payload.reference || '';

  // Les champs dénormalisés de surface (liste des devis) reflètent la VARIANTE
  // ACTIVE — identique aux champs racine en mono-option.
  const activeVariant = getActiveVariant(payload);
  const variantList = getQuoteVariants(payload);
  const totals = computeQuoteTotals(activeVariant.cartItems, activeVariant.tvaRate);

  const clientName = getClientFullName(payload.clientData);
  const clientCity = getClientFullLocation(payload.clientData);
  const searchText = [
    title?.trim(),
    clientName,
    payload.clientData?.email,
    payload.clientData?.telephone,
    effectiveReference,
    clientCity,
    variantList.map((variant) => variant.name).filter(Boolean).join(' '),
    buildClientSearchText(payload.clientData),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return removeUndefinedDeep({
    title: title?.trim() || getDefaultQuoteTitle(payload.clientData, effectiveReference),
    status,
    schemaVersion: 3,
    clientId: payload.clientData?.savedClientId || null,
    clientName: clientName || null,
    clientEmail: payload.clientData?.email?.trim() || null,
    clientPhone: payload.clientData?.telephone?.trim() || null,
    clientCity: clientCity || null,
    referenceDevis: effectiveReference || null,
    productCount: activeVariant.cartItems.length,
    totalHT: totals.totalHT,
    totalTTC: totals.totalTTC,
    tvaRate: activeVariant.tvaRate,
    variantCount: payload.variantsMode === true ? variantList.length : 1,
    searchText: searchText || null,
    payload,
  });
};

export const formatQuoteUpdatedAt = (value) => {
  if (!value) return 'À l’instant';

  const asDate =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(asDate.getTime())) return 'Date inconnue';

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(asDate);
};
