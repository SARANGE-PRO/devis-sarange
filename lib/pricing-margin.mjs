const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundCurrency = (value) => Math.round(toFiniteNumber(value) * 100) / 100;

export const normalizeNetMargin = (value) => {
  const margin = toFiniteNumber(value);
  return margin > 0 ? margin : 0;
};

export const normalizeDiscountPercent = (value) => {
  const discount = toFiniteNumber(value);
  if (discount <= 0) return 0;
  if (discount >= 99.99) return 99.99;
  return discount;
};

/**
 * Calcule le montant brut à ajouter au prix avant remise pour conserver
 * une marge nette souhaitée après remise.
 *
 * Formule:
 * Montant brut à ajouter = Marge nette souhaitée / (1 - remise/100)
 */
export const calculateGrossAmountToAddForNetMargin = (netMarginWanted, remisePercent) => {
  const netMargin = normalizeNetMargin(netMarginWanted);
  if (netMargin === 0) return 0;

  const discount = normalizeDiscountPercent(remisePercent);
  const retentionRate = 1 - discount / 100;

  return roundCurrency(netMargin / retentionRate);
};

export const calculateRecoveredNetMargin = (grossAmountAdded, remisePercent) => {
  const gross = toFiniteNumber(grossAmountAdded);
  if (gross <= 0) return 0;
  const discount = normalizeDiscountPercent(remisePercent);
  return roundCurrency(gross * (1 - discount / 100));
};

