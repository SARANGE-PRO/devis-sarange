/**
 * petits-bois.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Petits bois intégrés au vitrage : types proposés et prix d'achat au mètre
 * linéaire (tarif Riou Glass du 24/07/2026), prix de vente par coefficient.
 *
 * Prix de vente au ml = prix d'achat × coefficient (réglage
 * `petitsBoisMarkupCoefficient` du catalogue, 2,25 par défaut : le 26×8 blanc
 * reste ainsi au niveau de l'ancien prix unique de 37,50 €/ml). Une teinte
 * hors standard ajoute un forfait Riou par volume (réf. 95003), affecté du
 * même coefficient. Les barres sont comptées comme avant : barres
 * horizontales × largeur + barres verticales × hauteur.
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par le
 * calcul de prix (lib/products.js), le configurateur et le catalogue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PETITS_BOIS_TARIFF_DATE = '2026-07-24';
export const DEFAULT_PETITS_BOIS_MARKUP_COEFFICIENT = 2.25;
export const DEFAULT_PETITS_BOIS_TYPE_ID = '26x8-blanc';

export const PETITS_BOIS_TYPES = Object.freeze([
  { id: '26x8-blanc', ref: '18210', label: '26×8 blanc RAL 9016', purchasePricePerMl: 16.64 },
  { id: '26x8-marron', ref: '18211', label: '26×8 marron RAL 8014', purchasePricePerMl: 20.8 },
  { id: '26x8-beige', ref: '18303', label: '26×8 beige RAL 1015', purchasePricePerMl: 20.8 },
  { id: '26x8-chene-dore', ref: '18212', label: '26×8 chêne doré', purchasePricePerMl: 28.87 },
  {
    id: '26x8-bicolore-blanc-chene',
    ref: '18504',
    label: '26×8 bicolore blanc / chêne doré',
    purchasePricePerMl: 28.29,
  },
  {
    id: '26x8-bicolore-blanc-acajou',
    ref: '18505',
    label: '26×8 bicolore blanc / acajou',
    purchasePricePerMl: 32.03,
  },
  { id: '9x5-laiton-croix', ref: '18201', label: '9×5,5 laiton avec croix', purchasePricePerMl: 20.8 },
  { id: '9x5-blanc-croix', ref: '18205', label: '9×5,5 blanc avec croix', purchasePricePerMl: 20.8 },
  { id: '18x8-exterieur-blanc', ref: '18264', label: '18×8 extérieur blanc', purchasePricePerMl: 20.8 },
  {
    id: '26x8-teinte-hors-standard',
    ref: '18210 + 95003',
    label: '26×8 teinte hors standard (RAL au choix)',
    purchasePricePerMl: 16.64,
    // Forfait Riou par volume pour une teinte hors nuancier.
    supplementPerVolume: 80.08,
  },
]);

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

const toCount = (value) => Math.max(0, Number.parseInt(value, 10) || 0);

export const getPetitsBoisType = (typeId) =>
  PETITS_BOIS_TYPES.find((type) => type.id === typeId) ||
  PETITS_BOIS_TYPES.find((type) => type.id === DEFAULT_PETITS_BOIS_TYPE_ID);

/** Identifiant connu, sinon le 26×8 blanc (articles antérieurs à ce champ). */
export const normalizePetitsBoisTypeId = (value) =>
  PETITS_BOIS_TYPES.some((type) => type.id === value) ? value : DEFAULT_PETITS_BOIS_TYPE_ID;

export const getPetitsBoisMarkupCoefficient = (pricing) => {
  const value = Number(pricing?.petitsBoisMarkupCoefficient);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PETITS_BOIS_MARKUP_COEFFICIENT;
};

/** Prix de vente HT au mètre linéaire du type donné. */
export const getPetitsBoisPricePerMl = (typeId, pricing) =>
  roundTo(getPetitsBoisType(typeId).purchasePricePerMl * getPetitsBoisMarkupCoefficient(pricing), 2);

/** Forfait de vente HT par volume (teinte hors standard), 0 sinon. */
export const getPetitsBoisSupplementPerVolume = (typeId, pricing) =>
  roundTo(
    (getPetitsBoisType(typeId).supplementPerVolume || 0) * getPetitsBoisMarkupCoefficient(pricing),
    2
  );

/**
 * Prix de vente HT des petits bois d'un châssis : mètres linéaires de barres
 * (horizontales × largeur, verticales × hauteur) au prix du type, plus le
 * forfait par volume d'une teinte hors standard. 0 sans barre.
 */
export const calculatePetitsBoisPrice = ({
  widthMm,
  heightMm,
  petitsBoisH = 0,
  petitsBoisV = 0,
  petitsBoisType = DEFAULT_PETITS_BOIS_TYPE_ID,
  pricing = null,
} = {}) => {
  const widthMeters = Math.max(0, Number(widthMm) || 0) / 1000;
  const heightMeters = Math.max(0, Number(heightMm) || 0) / 1000;
  const mlTotal = toCount(petitsBoisH) * widthMeters + toCount(petitsBoisV) * heightMeters;
  if (mlTotal <= 0) return 0;
  const typeId = normalizePetitsBoisTypeId(petitsBoisType);
  return roundTo(
    mlTotal * getPetitsBoisPricePerMl(typeId, pricing) + getPetitsBoisSupplementPerVolume(typeId, pricing),
    2
  );
};

/** Libellé du type pour les récapitulatifs : vide pour le 26×8 blanc standard. */
export const formatPetitsBoisTypeLabel = (typeId) => {
  const normalized = normalizePetitsBoisTypeId(typeId);
  return normalized === DEFAULT_PETITS_BOIS_TYPE_ID ? '' : getPetitsBoisType(normalized).label;
};
