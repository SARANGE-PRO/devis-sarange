import { applyCommissionToCartItems } from '@/lib/products';
import { normalizeQuoteSettings } from '@/lib/quote-settings.mjs';
import {
  DEFAULT_TVA_RATE,
  computeQuoteTotals,
  normalizeOptionalTvaRate,
  normalizeTvaRate,
} from '@/lib/quote-totals.mjs';
import {
  buildClientSearchText,
  formatPhoneNumber,
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
import { normalizeCgvSnapshot } from '@/lib/cgv-templates.mjs';
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
  // Snapshot de figement des CGV/conditions de règlement (P4) : conservé tel
  // quel dans le payload — c'est LUI qui fait foi à la réouverture d'un devis
  // finalisé ou signé, jamais les templates courants.
  const cgvSnapshot = normalizeCgvSnapshot(payload?.cgvSnapshot) || undefined;

  if (payload?.variantsMode === true) {
    const { variants, activeVariantId } = normalizeVariantsBlock(payload, VARIANT_DEPS);
    return removeUndefinedDeep({
      clientData: payload?.clientData ? sanitizeClientData(payload.clientData) : null,
      variantsMode: true,
      activeVariantId,
      variants,
      currentStep: normalizeQuoteStep(payload?.currentStep),
      reference: reference || undefined,
      cgvSnapshot,
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
    cgvSnapshot,
  };

  return removeUndefinedDeep(nextPayload);
};

const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const hasCommission = (settings) =>
  settings?.commissionMode === 'amount'
    ? Number(settings?.commissionAmount) > 0
    : Number(settings?.commissionPercent) > 0;

/**
 * Totaux d'une variante TELS QUE LE CLIENT LES VOIT : la commission commerciale
 * est redistribuée dans les prix avant le calcul, exactement comme dans le
 * récapitulatif (QuoteSummary) et le PDF (buildQuotePdfDocument). Sans cette
 * étape, les montants de « Mes devis » étaient inférieurs au devis réel dès
 * qu'une commission était saisie.
 */
export const computeVariantDisplayTotals = (variant) => {
  const settings = variant?.quoteSettings;
  const items = applyCommissionToCartItems(variant?.cartItems, {
    mode: settings?.commissionMode,
    percent: settings?.commissionPercent,
    amount: settings?.commissionAmount,
  });
  return computeQuoteTotals(items, variant?.tvaRate);
};

/**
 * Montants de surface d'un devis LU en base. Les devis enregistrés avant la
 * correction (sans `totalsIncludeCommission`) ont des totaux stockés HORS
 * commission : on leur ajoute l'écart dû à la commission. Seul cet écart est
 * recalculé — le montant stocké reste la base, pour ne pas re-chiffrer un
 * ancien devis au tarif du jour. Les devis sans commission ou déjà corrigés
 * sont renvoyés tels quels.
 */
export const resolveStoredQuoteTotals = (data, payload) => {
  const stored = { totalHT: data?.totalHT, totalTTC: data?.totalTTC };
  if (data?.totalsIncludeCommission === true) return stored;

  try {
    const activeVariant = getActiveVariant(payload || {});
    if (!hasCommission(activeVariant?.quoteSettings)) return stored;

    const base = computeQuoteTotals(activeVariant.cartItems, activeVariant.tvaRate);
    const withCommission = computeVariantDisplayTotals(activeVariant);
    return {
      totalHT: roundCurrency(
        Number(stored.totalHT || 0) + withCommission.totalHT - base.totalHT
      ),
      totalTTC: roundCurrency(
        Number(stored.totalTTC || 0) + withCommission.totalTTC - base.totalTTC
      ),
    };
  } catch (error) {
    console.error('Montant du devis non corrigé de la commission :', error);
    return stored;
  }
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
  cgvSnapshot,
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
    cgvSnapshot,
  });
  const effectiveReference = payload.reference || '';

  // Les champs dénormalisés de surface (liste des devis) reflètent la VARIANTE
  // ACTIVE — identique aux champs racine en mono-option.
  const activeVariant = getActiveVariant(payload);
  const variantList = getQuoteVariants(payload);
  const totals = computeVariantDisplayTotals(activeVariant);

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
    // Numéro mis en forme : c'est lui que reprend le suivi de chantier.
    clientPhone: formatPhoneNumber(payload.clientData?.telephone) || null,
    clientCity: clientCity || null,
    referenceDevis: effectiveReference || null,
    productCount: activeVariant.cartItems.length,
    totalHT: totals.totalHT,
    totalTTC: totals.totalTTC,
    // Les totaux ci-dessus incluent la commission (voir resolveStoredQuoteTotals).
    totalsIncludeCommission: true,
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
