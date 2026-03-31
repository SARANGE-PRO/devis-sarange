import { calculateItemPrice } from '@/lib/products';

const DEFAULT_TVA_RATE = 10;
const MAX_CUSTOM_IMAGE_LENGTH = 120000;

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

const sanitizeCartItem = (item) => {
  if (!isPlainObject(item)) return item;

  if (
    typeof item.customImage === 'string' &&
    item.customImage.length > MAX_CUSTOM_IMAGE_LENGTH
  ) {
    return {
      ...item,
      customImage: null,
    };
  }

  return item;
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

  const fullName = [clientData?.prenom, clientData?.nom].filter(Boolean).join(' ').trim();
  if (fullName) return `Devis ${fullName}`;

  return 'Devis sans titre';
};

export const computeQuoteTotals = (cartItems = [], tvaRate = DEFAULT_TVA_RATE) => {
  let totalHT = 0;

  (Array.isArray(cartItems) ? cartItems : []).forEach((item) => {
    const calc = calculateItemPrice(item);
    totalHT += calc.totalLine;
    if (item.includePose) {
      totalHT += calc.posePrice * (item.quantity || 1);
    }
  });

  const safeTvaRate = Number.isFinite(Number(tvaRate)) ? Number(tvaRate) : DEFAULT_TVA_RATE;
  const tva = Math.round(totalHT * (safeTvaRate / 100) * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  return {
    totalHT: Math.round(totalHT * 100) / 100,
    totalTTC,
    tva,
  };
};

export const normalizeQuotePayload = (payload = {}) => {
  const nextPayload = {
    clientData: payload?.clientData || null,
    cartItems: Array.isArray(payload?.cartItems)
      ? payload.cartItems.map((item) => sanitizeCartItem(removeUndefinedDeep(item)))
      : [],
    tvaRate: Number.isFinite(Number(payload?.tvaRate))
      ? Number(payload.tvaRate)
      : DEFAULT_TVA_RATE,
    currentStep: normalizeQuoteStep(payload?.currentStep),
  };

  return removeUndefinedDeep(nextPayload);
};

export const buildQuoteDraftRecord = ({
  title,
  clientData,
  cartItems,
  tvaRate,
  currentStep,
  status = 'draft',
}) => {
  const payload = normalizeQuotePayload({
    clientData,
    cartItems,
    tvaRate,
    currentStep,
  });
  const totals = computeQuoteTotals(payload.cartItems, payload.tvaRate);
  const clientName = [payload.clientData?.prenom, payload.clientData?.nom]
    .filter(Boolean)
    .join(' ')
    .trim();

  return removeUndefinedDeep({
    title: title?.trim() || getDefaultQuoteTitle(payload.clientData),
    status,
    schemaVersion: 1,
    clientName: clientName || null,
    clientEmail: payload.clientData?.email?.trim() || null,
    referenceDevis: payload.clientData?.referenceDevis?.trim() || null,
    productCount: payload.cartItems.length,
    totalHT: totals.totalHT,
    totalTTC: totals.totalTTC,
    tvaRate: payload.tvaRate,
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
