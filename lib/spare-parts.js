/**
 * Catalogue des pièces détachées (volets roulants pour l'instant), et calculs
 * de prix associés (unité / mètre linéaire / m² de tablier).
 *
 * Source : catalogue interne construit à partir des factures fournisseurs
 * (Cherubini, SUYS, Profine) — "Prix Net Actuel" = coût d'achat déjà net de
 * remise ET des surcharges matières premières connues (SUYS +13 %, Profine
 * +7,9 %). Le prix de vente appliqué au client est ce coût d'achat multiplié
 * par le coefficient pièces détachées, paramétrable dans /parametres
 * (cf. lib/catalogue-pricing.js, sparePartsMarkupCoefficient).
 */

import { getCataloguePricing } from './catalogue-pricing.js';

export const DEFAULT_SPARE_PARTS_MARKUP_COEFFICIENT = 2;

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

export const SPARE_PART_CATEGORIES = [
  { id: 'moteurs-emetteurs', label: 'Moteurs & émetteurs' },
  { id: 'tabliers-lames', label: 'Tabliers : lames alu' },
  { id: 'coffres', label: 'Coffres aluminium' },
  { id: 'flasques', label: 'Flasques & contreplaques' },
  { id: 'encadrement', label: 'Encadrement' },
  { id: 'mecanique', label: 'Mécanique & composants' },
];

// 'unit'   -> quantité entière (unité, paire, pièce...)
// 'length' -> longueur en mètres (ml)
export const SPARE_PART_PRICING_MODES = Object.freeze({
  UNIT: 'unit',
  LENGTH: 'length',
});

/**
 * Chaque entrée = une référence fournisseur déclinée dans UN coloris (le prix
 * varie parfois selon le coloris — ex. BP42R — et parfois non — ex. RR2150,
 * qui liste plusieurs coloris au même prix) : on modélise donc toujours une
 * variante = un prix, jamais un prix partagé implicite entre coloris.
 */
export const SPARE_PARTS = [
  // ─── Moteurs & émetteurs (Cherubini) ─────────────────────────────────────
  {
    id: 'cmm45101705c',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CMM45101705C',
    label: 'Moteur Movi 10 Nm 17 Tours Ø45',
    color: null,
    conditioning: 'Conditionné par 10 chez le fournisseur (vendu à l\'unité)',
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 24.34,
  },
  {
    id: 'cmm452017050',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CMM452017050',
    label: 'Moteur Movi 20 Nm 17 Tours Ø45',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 28.01,
  },
  {
    id: 'ceo451017050',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CEO451017050',
    label: 'Moteur Modo RX 10 Nm 17 Tours Ø45',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 60.49,
  },
  {
    id: 'ceo452017050',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CEO452017050',
    label: 'Moteur Modo RX 20 Nm 17 Tours Ø45',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 63.05,
  },
  {
    id: 'ceo454017050',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CEO454017050',
    label: 'Moteur Modo RX 40 Nm 17 Tours Ø45',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 81.51,
  },
  {
    id: 'cwr45101700',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'CWR45101700',
    label: 'Moteur Open Wifi RX 10 Nm 17 Tours Ø45',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 73.90,
  },
  {
    id: 'a530090l-blanc',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'A530090L',
    label: 'Émetteur mural GIRO WALL',
    color: 'Blanc',
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 14.25,
  },
  {
    id: 'a530126-gris',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'A530126',
    label: 'Émetteur POP Mono canal',
    color: 'Gris',
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 15.91,
  },
  {
    id: 'a530054',
    categoryId: 'moteurs-emetteurs',
    supplier: 'Cherubini',
    reference: 'A530054',
    label: 'Émetteur portable 1 canal RX Pocket',
    color: null,
    unitLabel: 'Unité',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 15.23,
  },

  // ─── Tabliers : lames alu (SUYS) — alimentent aussi le prix au m² ────────
  {
    id: 'bp42r-blanc-belge',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP42R',
    label: 'Lame Alu 2 faces ajourée 42 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 0.82,
    profileHeightMm: 42,
  },
  {
    id: 'bp42r-gris-anthracite',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP42R',
    label: 'Lame Alu 2 faces ajourée 42 mm',
    color: 'Gris Anthracite (RAL 7016)',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 0.86,
    profileHeightMm: 42,
  },
  {
    id: 'bp42r-chene-dore',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP42R',
    label: 'Lame Alu 2 faces ajourée 42 mm',
    color: 'Chêne Doré',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 0.90,
    profileHeightMm: 42,
  },
  {
    id: 'bp42r-marron-sepia',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP42R',
    label: 'Lame Alu 2 faces ajourée 42 mm',
    color: 'Marron Sepia (RAL 8014)',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 0.98,
    profileHeightMm: 42,
  },
  {
    id: 'bp55r-blanc-belge',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP55R',
    label: 'Lame Alu 2 faces ajourée 55 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 1.49,
    profileHeightMm: 55,
  },
  {
    id: 'bp55r-gris-anthracite',
    categoryId: 'tabliers-lames',
    supplier: 'SUYS',
    reference: 'BP55R',
    label: 'Lame Alu 2 faces ajourée 55 mm',
    color: 'Gris Anthracite (RAL 7016)',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 1.56,
    profileHeightMm: 55,
  },

  // ─── Coffres aluminium (SUYS) ─────────────────────────────────────────────
  {
    id: 'rr2150-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2150',
    label: 'Coffre Alu Plié standard 150 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.15,
  },
  {
    id: 'rr2150-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2150',
    label: 'Coffre Alu Plié standard 150 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.15,
  },
  {
    id: 'rr2165-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2165',
    label: 'Coffre Alu Plié standard 165 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.41,
  },
  {
    id: 'rr2165-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2165',
    label: 'Coffre Alu Plié standard 165 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.41,
  },
  {
    id: 'rr2165-marron-sepia',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2165',
    label: 'Coffre Alu Plié standard 165 mm',
    color: 'Marron Sepia',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.41,
  },
  {
    id: 'rr2180-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2180',
    label: 'Coffre Alu Plié standard 180 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 6.47,
  },
  {
    id: 'rr2180-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'RR2180',
    label: 'Coffre Alu Plié standard 180 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 6.47,
  },
  {
    id: 'slr2150-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2150',
    label: 'Coffre Alu Plié à 45° 150 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 3.66,
  },
  {
    id: 'slr2150-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2150',
    label: 'Coffre Alu Plié à 45° 150 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 3.66,
  },
  {
    id: 'slr2165-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2165',
    label: 'Coffre Alu Plié à 45° 165 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.41,
  },
  {
    id: 'slr2165-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2165',
    label: 'Coffre Alu Plié à 45° 165 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.41,
  },
  {
    id: 'slr2165-marron-sepia',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2165',
    label: 'Coffre Alu Plié à 45° 165 mm',
    color: 'Marron Sepia',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.41,
  },
  {
    id: 'slr2180-blanc-belge',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2180',
    label: 'Coffre Alu Plié à 45° 180 mm',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.81,
  },
  {
    id: 'slr2180-gris-anthracite',
    categoryId: 'coffres',
    supplier: 'SUYS',
    reference: 'SLR2180',
    label: 'Coffre Alu Plié à 45° 180 mm',
    color: 'Gris Anthracite',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.81,
  },

  // ─── Flasques & contreplaques (SUYS) ─────────────────────────────────────
  {
    id: 'szs150-blanc-sat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS150',
    label: 'Flasque 45° - 150 mm',
    color: 'Blanc (SAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 7.15,
  },
  {
    id: 'szs150-gris-mat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS150',
    label: 'Flasque 45° - 150 mm',
    color: 'Gris (MAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 7.15,
  },
  {
    id: 'szs165-blanc-sat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS165',
    label: 'Flasque 45° - 165 mm',
    color: 'Blanc (SAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 8.18,
  },
  {
    id: 'szs165-gris-mat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS165',
    label: 'Flasque 45° - 165 mm',
    color: 'Gris (MAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 8.18,
  },
  {
    id: 'szs180-blanc-sat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS180',
    label: 'Flasque 45° - 180 mm',
    color: 'Blanc (SAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 8.84,
  },
  {
    id: 'szs180-gris-mat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS180',
    label: 'Flasque 45° - 180 mm',
    color: 'Gris (MAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 8.84,
  },
  {
    id: 'szs205-blanc-sat',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SZS205',
    label: 'Flasque 45° - 205 mm',
    color: 'Blanc (SAT)',
    unitLabel: 'Paire',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 10.99,
  },
  {
    id: 'sppt7150',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SPPT7150',
    label: 'Contreplaque 45° - 150 mm (Trou 72)',
    color: null,
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 1.01,
  },
  {
    id: 'sppt7180',
    categoryId: 'flasques',
    supplier: 'SUYS',
    reference: 'SPPT7180',
    label: 'Contreplaque 45° - 180 mm (Trou 72)',
    color: null,
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 1.24,
  },

  // ─── Encadrement (SUYS / Profine) ─────────────────────────────────────────
  {
    id: 'gl100-blanc-belge',
    categoryId: 'encadrement',
    supplier: 'SUYS',
    reference: 'GL100',
    label: 'Coulisse Alu 53x22x53',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.15,
  },
  {
    id: 'gl100-gris-anthracite',
    categoryId: 'encadrement',
    supplier: 'SUYS',
    reference: 'GL100',
    label: 'Coulisse Alu 53x22x53',
    color: 'Gris Anthracite (RAL 7016)',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 5.40,
  },
  {
    id: '4997-blanc',
    categoryId: 'encadrement',
    supplier: 'Profine',
    reference: '4997',
    label: 'Coulisse rénovation pour lame 8mm PVC',
    color: 'Blanc',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 7.00,
  },
  {
    id: '4346-blanc',
    categoryId: 'encadrement',
    supplier: 'Profine',
    reference: '4346',
    label: 'Coulisse monobloc PVC',
    color: 'Blanc',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 4.34,
  },
  {
    id: 'fin948-blanc-belge',
    categoryId: 'encadrement',
    supplier: 'SUYS',
    reference: 'FIN948',
    label: 'Lame Finale Alu + Lame Interm.',
    color: 'Blanc Belge',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 3.30,
  },
  {
    id: 'fin948-gris-anthracite',
    categoryId: 'encadrement',
    supplier: 'SUYS',
    reference: 'FIN948',
    label: 'Lame Finale Alu + Lame Interm.',
    color: 'Gris Anthracite (RAL 7016)',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 3.46,
  },
  {
    id: 'dio1372-noir',
    categoryId: 'encadrement',
    supplier: 'SUYS',
    reference: 'DIO1372',
    label: 'Joint Néoprène pour finale',
    color: 'Noir',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 0.23,
  },

  // ─── Mécanique & composants (Cherubini / Profine) ────────────────────────
  {
    id: 'mm-rod6016ff',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: 'MM ROD6016FF',
    label: 'Tube OCTO 60 0,6 C8 (pas 60/70mm)',
    color: 'Acier galvanisé',
    unitLabel: 'ml',
    pricingMode: SPARE_PART_PRICING_MODES.LENGTH,
    purchasePrice: 3.11,
  },
  {
    id: '721505',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: '721505',
    label: 'Verrou à clipper sur Octo 60 (2 éléments)',
    color: 'Polycarbonate',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 1.36,
  },
  {
    id: '1740260',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: '1740260',
    label: 'Embout octo 60 pour roulement 28mm',
    color: 'PVC dur',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 0.85,
  },
  {
    id: '110-8112',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: '110.8112',
    label: 'Roulement 28',
    color: 'Nylon',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 0.39,
  },
  {
    id: 'a4505-0510',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: 'A4505 0510',
    label: 'Adaptateur moteur Ø45 sur tube Octo 60',
    color: 'PVC/Nylon',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 0.86,
  },
  {
    id: 'a4506-0642',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: 'A4506 0642',
    label: 'Support universel ailes en acier/anneau',
    color: 'Acier',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 1.77,
  },
  {
    id: '73307017ach04',
    categoryId: 'mecanique',
    supplier: 'Cherubini',
    reference: '73307017ACH04',
    label: 'Treuil debrayable 5,3:1',
    color: null,
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 6.52,
  },
  {
    id: '5655',
    categoryId: 'mecanique',
    supplier: 'Profine',
    reference: '5655',
    label: "Tulipe d'engagement pour lame 8mm",
    color: 'Plastique VNF',
    unitLabel: 'Pièce',
    pricingMode: SPARE_PART_PRICING_MODES.UNIT,
    purchasePrice: 0.67,
  },
];

const SPARE_PART_BY_ID = new Map(SPARE_PARTS.map((part) => [part.id, part]));

export function getSparePart(id) {
  return SPARE_PART_BY_ID.get(id) || null;
}

export function getSparePartsByCategory(categoryId) {
  return SPARE_PARTS.filter((part) => part.categoryId === categoryId);
}

/**
 * Lames de tablier disponibles (catégorie tabliers-lames), pour le
 * sélecteur profil + coloris du calcul au m².
 */
export function getTablierLameOptions() {
  return getSparePartsByCategory('tabliers-lames');
}

export function getSparePartsMarkupCoefficient() {
  const pricing = getCataloguePricing();
  const value = Number(pricing.sparePartsMarkupCoefficient);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SPARE_PARTS_MARKUP_COEFFICIENT;
}

/**
 * Prix d'achat effectif d'une pièce détachée (avec surcharge éventuelle
 * saisie dans /parametres pour corriger une référence sans toucher au code —
 * même principe que glazingPrices dans lib/glazing.js).
 */
export function getSparePartPurchasePrice(sparePartId) {
  const part = getSparePart(sparePartId);
  if (!part) return 0;

  const pricing = getCataloguePricing();
  const override = pricing.sparePartsPrices?.[sparePartId];
  return Number.isFinite(Number(override)) ? Number(override) : part.purchasePrice;
}

/**
 * Prix de vente unitaire (ou au ml) d'une pièce détachée : achat × coefficient.
 */
export function getSparePartSalePrice(sparePartId) {
  const purchasePrice = getSparePartPurchasePrice(sparePartId);
  return roundTo(purchasePrice * getSparePartsMarkupCoefficient(), 2);
}

/**
 * Tablier de volet roulant vendu seul, au m² : la longueur de lame déjà
 * facturée au ml (prix achat) est ramenée au m² via la hauteur du profil
 * (42 ou 55 mm), puis multipliée par la surface réelle (largeur × hauteur)
 * et par le coefficient pièces détachées.
 */
export function calculateTablierPrice({ widthMm, heightMm, lameId }) {
  const lame = getSparePart(lameId);
  const width = Number(widthMm);
  const height = Number(heightMm);

  if (!lame || lame.categoryId !== 'tabliers-lames' || !(width > 0) || !(height > 0)) {
    return null;
  }

  const areaM2 = (width / 1000) * (height / 1000);
  const purchasePricePerMl = getSparePartPurchasePrice(lameId);
  const purchasePricePerM2 = purchasePricePerMl / (lame.profileHeightMm / 1000);
  const coefficient = getSparePartsMarkupCoefficient();
  const salePricePerM2 = purchasePricePerM2 * coefficient;
  const unitPrice = roundTo(areaM2 * salePricePerM2, 2);

  return {
    areaM2: roundTo(areaM2, 4),
    purchasePricePerM2: roundTo(purchasePricePerM2, 2),
    salePricePerM2: roundTo(salePricePerM2, 2),
    unitPrice,
  };
}
