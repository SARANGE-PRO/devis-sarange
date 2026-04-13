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
const MAX_CUSTOM_IMAGE_LENGTH = 120000;

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

export const getDefaultQuoteTitle = (clientData = null) => {
  const reference = clientData?.referenceDevis?.trim();
  if (reference) return reference;

  const fullName = getClientFullName(clientData);
  if (fullName) return `Devis ${fullName}`;

  return 'Devis sans titre';
};

export const normalizeQuotePayload = (payload = {}) => {
  const nextPayload = {
    clientData: payload?.clientData ? sanitizeClientData(payload.clientData) : null,
    cartItems: Array.isArray(payload?.cartItems)
      ? payload.cartItems.map((item) => sanitizeCartItem(removeUndefinedDeep(item)))
      : [],
    tvaRate: normalizeTvaRate(payload?.tvaRate, DEFAULT_TVA_RATE),
    currentStep: normalizeQuoteStep(payload?.currentStep),
    quoteSettings: normalizeQuoteSettings(payload?.quoteSettings),
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
  status = 'draft',
}) => {
  const payload = normalizeQuotePayload({
    clientData,
    cartItems,
    tvaRate,
    currentStep,
    quoteSettings,
  });
  const totals = computeQuoteTotals(payload.cartItems, payload.tvaRate);
  const clientName = getClientFullName(payload.clientData);
  const clientCity = getClientFullLocation(payload.clientData);
  const searchText = [
    title?.trim(),
    clientName,
    payload.clientData?.email,
    payload.clientData?.telephone,
    payload.clientData?.referenceDevis,
    clientCity,
    buildClientSearchText(payload.clientData),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return removeUndefinedDeep({
    title: title?.trim() || getDefaultQuoteTitle(payload.clientData),
    status,
    schemaVersion: 3,
    clientId: payload.clientData?.savedClientId || null,
    clientName: clientName || null,
    clientEmail: payload.clientData?.email?.trim() || null,
    clientPhone: payload.clientData?.telephone?.trim() || null,
    clientCity: clientCity || null,
    referenceDevis: payload.clientData?.referenceDevis?.trim() || null,
    productCount: payload.cartItems.length,
    totalHT: totals.totalHT,
    totalTTC: totals.totalTTC,
    tvaRate: payload.tvaRate,
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
