// Options suggérées (vente additionnelle) sur les fenêtres et portes-fenêtres :
// quand l'oscillo-battant ou la grille de ventilation n'est pas retenu, le
// devis affiche en fin de désignation une ligne discrète
//   « En option (non inclus) : oscillo-battant +33.75 € HT, grille de ventilation +11.25 € HT »
// au prix d'UN vantail, remise de la ligne déjà appliquée.
//
// La ligne est ajoutée au RENDU (récap + PDF), comme la mention « Remise : » :
// elle n'est jamais enregistrée dans la désignation, ni exportée vers Sage, et
// disparaît d'elle-même dès que l'option est cochée.

export const SUGGESTED_OPTIONS_PREFIX = 'En option (non inclus)';

// Hauteur maximale fabricable en oscillo-battant.
export const OB_MAX_HEIGHT_MM = 2000;

// Même majoration que calculateItemPrice (prix catalogue × 1,25).
const SASH_OPTION_MULTIPLIER = 1.25;

// Menuiseries à ouvrant(s) à la française. Les fixes n'ont pas d'ouvrant, les
// coulissants et portes d'entrée n'acceptent pas l'OB.
const CASEMENT_SHEET_PATTERN = /^(Fenêtre|Porte-Fenêtre) (1V|2V|3V|4V|2V\+1F|2V\+2F)\b/;
const SOUFFLET_SHEET_PATTERN = /^Fenêtre Soufflet\b/;

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Prix unitaires HT (remise de la ligne appliquée) des options non retenues,
 * ou null quand l'option ne s'applique pas / est déjà prise.
 * @returns {{ ob: number|null, vent: number|null }}
 */
export const getSuggestedSashOptions = (
  item,
  { obPrice = 0, grillePrice = 0, sheetName = item?.sheetName, isManualPrice = false } = {}
) => {
  const none = { ob: null, vent: null };
  if (!item || item.isComposite || isManualPrice) return none;

  const sheet = String(sheetName || '').replace(/\s*ALU\s*$/i, '');
  const isCasement = CASEMENT_SHEET_PATTERN.test(sheet);
  const isSoufflet = SOUFFLET_SHEET_PATTERN.test(sheet);
  if (!isCasement && !isSoufflet) return none;

  const sashes = Object.values(item.sashOptions || {});
  const hasOb = sashes.some((sash) => sash?.ob);
  const hasVent = sashes.some((sash) => sash?.vent);

  const remise = Number(item.remise) > 0 && Number(item.remise) < 100 ? Number(item.remise) : 0;
  const net = (catalogPrice) => {
    const price = toPositiveNumber(catalogPrice);
    return price > 0 ? roundCurrency(price * SASH_OPTION_MULTIPLIER * (1 - remise / 100)) : null;
  };

  const heightMm = Number(item.heightMm) || 0;
  const obAllowed = isCasement && !hasOb && heightMm > 0 && heightMm <= OB_MAX_HEIGHT_MM;

  return {
    ob: obAllowed ? net(obPrice) : null,
    vent: hasVent ? null : net(grillePrice),
  };
};

/**
 * Ligne « En option (non inclus) : … » prête à être ajoutée à la désignation,
 * ou '' s'il n'y a rien à proposer.
 */
export const buildSuggestedOptionsLine = (suggestions, formatPrice, quantity = 1) => {
  const parts = [];
  if (suggestions?.ob > 0) parts.push(`oscillo-battant +${formatPrice(suggestions.ob)} HT`);
  if (suggestions?.vent > 0) parts.push(`grille de ventilation +${formatPrice(suggestions.vent)} HT`);
  if (parts.length === 0) return '';

  const perUnit = Number(quantity) > 1 ? ' par menuiserie' : '';
  return `${SUGGESTED_OPTIONS_PREFIX} : ${parts.join(', ')}${perUnit}`;
};

export const isSuggestedOptionsLine = (line) =>
  String(line || '').trim().startsWith(SUGGESTED_OPTIONS_PREFIX);
