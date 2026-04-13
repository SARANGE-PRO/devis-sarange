import { calculateItemPrice, getItemPricingSummary } from '@/lib/products';

export const DEFAULT_TVA_RATE = 10;
export const TVA_RATE_OPTIONS = Object.freeze([0, 5.5, 10, 20]);

const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formatRateNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric)
    ? String(numeric)
    : new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(numeric);
};

export const formatTvaRateLabel = (value) => `${formatRateNumber(value)}%`;

export const normalizeTvaRate = (value, fallback = DEFAULT_TVA_RATE) => {
  const parsed = Number(value);
  if (TVA_RATE_OPTIONS.includes(parsed)) {
    return parsed;
  }

  if (fallback === undefined || fallback === null) {
    return DEFAULT_TVA_RATE;
  }

  const normalizedFallback = Number(fallback);
  return TVA_RATE_OPTIONS.includes(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_TVA_RATE;
};

export const normalizeOptionalTvaRate = (value) => {
  const parsed = Number(value);
  return TVA_RATE_OPTIONS.includes(parsed) ? parsed : undefined;
};

export const getItemTvaRate = (item, defaultTvaRate = DEFAULT_TVA_RATE) =>
  normalizeTvaRate(item?.tvaRate, defaultTvaRate);

const getOrCreateBucket = (bucketMap, rate) => {
  const normalizedRate = normalizeTvaRate(rate);

  if (!bucketMap.has(normalizedRate)) {
    bucketMap.set(normalizedRate, {
      rate: normalizedRate,
      label: formatTvaRateLabel(normalizedRate),
      totalHT: 0,
      tva: 0,
      totalTTC: 0,
    });
  }

  return bucketMap.get(normalizedRate);
};

export const computeQuoteTotals = (cartItems = [], defaultTvaRate = DEFAULT_TVA_RATE) => {
  const bucketMap = new Map();
  let totalHT = 0;
  let originalTotalHT = 0;
  let totalQuantity = 0;
  let quantityWithPose = 0;

  (Array.isArray(cartItems) ? cartItems : []).forEach((item) => {
    const calc = calculateItemPrice(item);
    const pricing = getItemPricingSummary(item, calc);
    const lineHT = roundCurrency(calc.totalLine);
    const lineOriginalHT = roundCurrency(pricing.originalLineHT);
    const lineQuantity = Number(item?.quantity || 0);
    const lineTvaRate = getItemTvaRate(item, defaultTvaRate);

    totalHT += lineHT;
    originalTotalHT += lineOriginalHT;
    totalQuantity += lineQuantity;

    if (lineHT > 0) {
      const bucket = getOrCreateBucket(bucketMap, lineTvaRate);
      bucket.totalHT += lineHT;
    }

    if (item?.includePose) {
      const poseLineHT = roundCurrency(calc.posePrice * lineQuantity);
      totalHT += poseLineHT;
      originalTotalHT += poseLineHT;
      quantityWithPose += lineQuantity;

      if (poseLineHT > 0) {
        const bucket = getOrCreateBucket(bucketMap, lineTvaRate);
        bucket.totalHT += poseLineHT;
      }
    }
  });

  const vatBuckets = Array.from(bucketMap.values())
    .map((bucket) => {
      const totalHTRounded = roundCurrency(bucket.totalHT);
      const tva = roundCurrency(totalHTRounded * (bucket.rate / 100));
      return {
        ...bucket,
        totalHT: totalHTRounded,
        tva,
        totalTTC: roundCurrency(totalHTRounded + tva),
      };
    })
    .sort((left, right) => left.rate - right.rate);

  const totalHTRounded = roundCurrency(totalHT);
  const originalTotalHTRounded = roundCurrency(originalTotalHT);
  const totalTva = roundCurrency(
    vatBuckets.reduce((sum, bucket) => sum + bucket.tva, 0)
  );
  const totalTTC = roundCurrency(totalHTRounded + totalTva);
  const discountTotal = roundCurrency(originalTotalHTRounded - totalHTRounded);
  const activeVatBuckets = vatBuckets.filter((bucket) => bucket.totalHT > 0);
  const singleVatRate =
    activeVatBuckets.length === 1 ? activeVatBuckets[0].rate : null;

  return {
    totalHT: totalHTRounded,
    originalTotalHT: originalTotalHTRounded,
    discountTotal,
    hasDiscount: discountTotal > 0,
    tva: totalTva,
    totalTTC,
    acompte: roundCurrency(totalTTC * 0.5),
    solde: roundCurrency(totalTTC - roundCurrency(totalTTC * 0.5)),
    productLines: Array.isArray(cartItems) ? cartItems.length : 0,
    totalQuantity,
    quantityWithPose,
    defaultTvaRate: normalizeTvaRate(defaultTvaRate),
    vatBuckets,
    activeVatBuckets,
    singleVatRate,
    hasReducedVat: activeVatBuckets.some(
      (bucket) => bucket.rate > 0 && bucket.rate < 20
    ),
    hasZeroVat: activeVatBuckets.some((bucket) => bucket.rate === 0),
    vatSummaryLabel:
      singleVatRate === null ? 'TVA totale' : `TVA (${formatTvaRateLabel(singleVatRate)})`,
    vatSummaryText:
      singleVatRate === null
        ? 'TVA multi-taux'
        : `TVA a ${formatTvaRateLabel(singleVatRate)}`,
  };
};
