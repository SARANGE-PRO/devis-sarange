// Prix modifiés directement dans le récapitulatif du devis.
//
// Le prix tapé est toujours le prix NET HT affiché (après remise, commission
// comprise) et il est converti vers le levier qui existe déjà pour la ligne,
// jamais vers un nouveau champ de prix « forcé » :
//   • menuiseries catalogue (simples, composées, cintrées, à prix fixe) :
//     ajustement net (marge nette ou remise nette souhaitée), comme le prix
//     tapé sur l'estimation du configurateur. La remise % de la ligne reste
//     affichée, le prix barré suit ;
//   • produit hors catalogue, services, pièces détachées : le prix saisi de la
//     ligne (net payé, la remise y est psychologique) ;
//   • remise commerciale : son montant ;
//   • évacuation des déchets : un prix saisi qui remplace le calcul au poids ;
//   • pose : le tarif de pose spécifique de la ligne ;
//   • volet monobloc à prix séparé : le prix du volet (avant remise de la ligne).
// La commission (% ou €) est redistribuée sur tout le devis à chaque essai :
// le prix est recherché par itérations jusqu’à retomber sur la valeur tapée (le
// centime le plus proche quand la part de commission saute un centime).
import {
  COMMERCIAL_DISCOUNT_PRODUCT_ID,
  SPARE_PART_PRODUCT_IDS,
  applyCommissionToCartItems,
  calculateItemPrice,
  getItemPricingSummary,
  getVoletMonoblocPricing,
  normalizePosePriceOverride,
  roundCurrency,
} from './products.js';
import { normalizeVoletMonoblocPriceOverride, splitVoletMonoblocPricing } from './volet-monobloc.mjs';
import { WASTE_MANAGEMENT_PRODUCT_ID } from './waste-management.mjs';

const DIRECT_UNIT_PRICE_IDS = new Set([
  'metrage-technique-validation',
  'forfait-deplacement',
  'livraison',
  'pose-menuiseries',
]);

/**
 * Levier du prix principal de la ligne : 'adjustment' (ajustement net),
 * 'customPrice', 'unitPrice', 'discountAmount', 'waste', ou null (non modifiable).
 */
export const getRecapPriceMode = (item) => {
  const productId = item?.productId;
  if (!productId || productId === 'text-only') return null;
  if (productId === WASTE_MANAGEMENT_PRODUCT_ID) return 'waste';
  if (productId === COMMERCIAL_DISCOUNT_PRODUCT_ID) return 'discountAmount';
  if (productId === 'custom-product') return 'customPrice';
  if (DIRECT_UNIT_PRICE_IDS.has(productId) || SPARE_PART_PRODUCT_IDS.has(productId)) return 'unitPrice';
  return 'adjustment';
};

/** Prix saisi de l'évacuation des déchets (null = calcul automatique au poids). */
export const normalizeWastePriceOverride = normalizePosePriceOverride;

/** Saisie « 1 234,50 » ou « 1234.5 » → nombre au centime, null si invalide ou négatif. */
export const parseRecapPriceInput = (value) => {
  const text = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? roundCurrency(amount) : null;
};

const toCommissionSettings = (commission = {}) => ({
  mode: commission?.mode,
  percent: commission?.percent,
  amount: commission?.amount,
});

/** Prix NET unitaires affichés au récap pour une ligne : principal (part menuiserie si volet séparé), volet, pose. */
export const getRecapShownPrices = (items, itemId, commission) => {
  const commissioned = applyCommissionToCartItems(items, toCommissionSettings(commission));
  const item = commissioned.find((entry) => entry?.id === itemId);
  if (!item) return null;
  const calc = calculateItemPrice(item);
  const split = splitVoletMonoblocPricing(item, calc, getItemPricingSummary(item, calc));
  return {
    main: split ? split.menuiserie.unitPriceAfterDiscount : calc.unitPriceAfterDiscount,
    volet: split ? split.volet.unitPriceAfterDiscount : null,
    pose: calc.posePrice,
  };
};

const withNetAdjustment = (item, amount) =>
  amount >= 0
    ? { ...item, netMarginWanted: amount, netDiscountWanted: 0 }
    : { ...item, netMarginWanted: 0, netDiscountWanted: -amount };

// Le montant brut ajouté avant remise (au centime) est la vraie résolution du
// prix : une marge nette arrondie au centime sauterait des prix nets après
// remise (ex. -20 % : brut = marge / 0,8, d'où des pas de 1 ou 2 centimes).
// La marge nette est donc gardée à 4 décimales, ce qui redonne exactement ce brut.
const withGrossAdjustment = (item, gross) =>
  withNetAdjustment(item, Math.round(gross * retentionRate(item) * 10000) / 10000);

const getNetAdjustment = (item) =>
  (Number(item?.netMarginWanted) || 0) - (Number(item?.netDiscountWanted) || 0);

const withVoletPrice = (item, price) => {
  const voletMonoblocPriceOverride = normalizeVoletMonoblocPriceOverride(price);
  return item.isComposite && item.compositeFrame
    ? {
        ...item,
        voletMonoblocPriceOverride,
        // Le configurateur relit le prix du volet d'un composé dans son ossature.
        compositeFrame: { ...item.compositeFrame, voletMonoblocPriceOverride },
      }
    : { ...item, voletMonoblocPriceOverride };
};

const retentionRate = (item) => {
  const remise = Number(item?.remise) || 0;
  return remise > 0 && remise < 100 ? 1 - remise / 100 : 1;
};

/**
 * Cherche la valeur du levier (au centime) qui fait afficher `target`.
 * `apply(item, x)` pose le levier, `read(prices)` lit le prix affiché, `slope`
 * = variation du prix affiché pour 1 € de levier (hors commission).
 */
const solveLever = ({ items, itemId, commission, target, start, slope, apply, read, min = -Infinity }) => {
  const base = items.find((entry) => entry?.id === itemId);
  const evaluate = (x) => {
    const next = apply(base, x);
    const nextItems = items.map((entry) => (entry?.id === itemId ? next : entry));
    return { next, shown: read(getRecapShownPrices(nextItems, itemId, commission)) };
  };
  const clamp = (x) => roundCurrency(Math.max(min, x));

  let x = clamp(start);
  let best = null;
  const seen = new Set();
  for (let step = 0; step < 12 && !seen.has(x); step += 1) {
    seen.add(x);
    const result = evaluate(x);
    const error = roundCurrency(target - result.shown);
    if (!best || Math.abs(error) < Math.abs(best.error)) best = { ...result, x, error };
    if (error === 0) return result.next;
    x = clamp(x + error / slope);
  }
  // Arrondis (remise, commission) : on balaie quelques centimes autour.
  for (let cents = 1; cents <= 4; cents += 1) {
    for (const x2 of [best.x + cents / 100, best.x - cents / 100]) {
      const candidate = clamp(x2);
      const result = evaluate(candidate);
      const error = roundCurrency(target - result.shown);
      if (Math.abs(error) < Math.abs(best.error)) best = { ...result, x: candidate, error };
      if (error === 0) return result.next;
    }
  }
  return best.next;
};

/**
 * Ligne mise à jour pour afficher `target` (prix NET unitaire HT) sur le prix
 * principal, ou null si la ligne n'est pas modifiable ou la saisie invalide.
 * `items` = articles du panier SANS commission (celle-ci est recalculée).
 */
export const applyRecapUnitPrice = ({ items, itemId, target, commission }) => {
  const item = items.find((entry) => entry?.id === itemId);
  const mode = getRecapPriceMode(item);
  const amount = parseRecapPriceInput(target);
  if (!mode || amount === null) return null;

  if (mode === 'customPrice') return { ...item, customPrice: amount };
  if (mode === 'unitPrice') return { ...item, unitPrice: amount };
  if (mode === 'discountAmount') return { ...item, customPrice: amount };
  if (mode === 'waste') return { ...item, wastePriceOverride: amount };

  const current = getRecapShownPrices(items, itemId, commission);
  const rate = retentionRate(item);
  return solveLever({
    items,
    itemId,
    commission,
    target: amount,
    start: (getNetAdjustment(item) + (amount - current.main)) / rate,
    slope: rate,
    apply: withGrossAdjustment,
    read: (prices) => prices.main,
  });
};

/** Prix principal revenu au calcul automatique (null si rien à rétablir). */
export const resetRecapUnitPrice = (item) => {
  const mode = getRecapPriceMode(item);
  if (mode === 'adjustment' && Math.abs(getNetAdjustment(item)) > 0.00001) return withNetAdjustment(item, 0);
  if (mode === 'waste' && normalizeWastePriceOverride(item.wastePriceOverride) !== null) {
    return { ...item, wastePriceOverride: null };
  }
  return null;
};

/** Pose : tarif spécifique de la ligne (prix saisi pour un produit hors catalogue). */
export const applyRecapPosePrice = (item, target) => {
  const amount = parseRecapPriceInput(target);
  if (!item?.includePose || amount === null) return null;
  if (item.productId === 'custom-product') return { ...item, customPoseHt: amount };
  return { ...item, posePriceOverride: amount };
};

export const resetRecapPosePrice = (item) =>
  item?.productId !== 'custom-product' && normalizePosePriceOverride(item?.posePriceOverride) !== null
    ? { ...item, posePriceOverride: null }
    : null;

/** Volet monobloc à prix séparé : prix NET unitaire voulu → prix du volet avant remise. */
export const applyRecapVoletPrice = ({ items, itemId, target, commission }) => {
  const item = items.find((entry) => entry?.id === itemId);
  const amount = parseRecapPriceInput(target);
  if (!item?.voletMonobloc || !item?.voletMonoblocSeparate || amount === null) return null;
  const rate = retentionRate(item);
  return solveLever({
    items,
    itemId,
    commission,
    target: amount,
    start: amount / rate,
    slope: rate,
    min: 0,
    apply: withVoletPrice,
    read: (prices) => prices.volet,
  });
};

/** Retour au tarif automatique du volet, seulement s'il existe (grille Volet Filaire). */
export const resetRecapVoletPrice = (item) => {
  if (normalizeVoletMonoblocPriceOverride(item?.voletMonoblocPriceOverride) === null) return null;
  return getVoletMonoblocPricing(item).hasGridPrice ? withVoletPrice(item, null) : null;
};
