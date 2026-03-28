import pricingData from '@/data/pricing.json';
import { calculateGlazingExtra } from '@/lib/glazing';

/**
 * Product categories with metadata for UI display
 */
export const CATEGORIES = [
  {
    id: 'fenetres',
    label: 'Fenêtres',
    icon: 'LayoutGrid',
    products: [
      { id: 'fenetre-1v', sheet: 'Fenêtre 1V', label: 'Fenêtre 1 Vantail', shortLabel: '1V' },
      { id: 'fenetre-2v', sheet: 'Fenêtre 2V', label: 'Fenêtre 2 Vantaux', shortLabel: '2V' },
      { id: 'fenetre-3v', sheet: 'Fenêtre 3V', label: 'Fenêtre 3 Vantaux', shortLabel: '3V' },
      { id: 'fenetre-4v', sheet: 'Fenêtre 4V', label: 'Fenêtre 4 Vantaux', shortLabel: '4V' },
      { id: 'fenetre-2v1f', sheet: 'Fenêtre 2V+1F', label: 'Fenêtre 2V + 1 Fixe', shortLabel: '2V+1F' },
      { id: 'fenetre-2v2f', sheet: 'Fenêtre 2V+2F', label: 'Fenêtre 2V + 2 Fixes', shortLabel: '2V+2F' },
      { id: 'fenetre-fixe', sheet: 'Fenêtre Fixe', label: 'Fenêtre Fixe', shortLabel: 'Fixe' },
      { id: 'fenetre-soufflet', sheet: 'Fenêtre Soufflet', label: 'Fenêtre Soufflet', shortLabel: 'Soufflet' },
    ],
  },
  {
    id: 'coulissants',
    label: 'Coulissants',
    icon: 'ArrowLeftRight',
    products: [
      { id: 'coulissant-2v2r', sheet: 'Coulissant 2 vantaux 2 rails', label: 'Coulissant 2 Vantaux 2 Rails', shortLabel: '2V 2R' },
    ],
  },
  {
    id: 'portes-fenetres',
    label: 'Portes-Fenêtres',
    icon: 'DoorOpen',
    products: [
      { id: 'pf-1v', sheet: 'Porte-Fenêtre 1V', label: 'Porte-Fenêtre 1 Vantail', shortLabel: '1V' },
      { id: 'pf-2v', sheet: 'Porte-Fenêtre 2V', label: 'Porte-Fenêtre 2 Vantaux', shortLabel: '2V' },
      { id: 'pf-2v1f', sheet: 'Porte-Fenêtre 2V+1F', label: 'Porte-Fenêtre 2V + 1 Fixe', shortLabel: '2V+1F' },
      { id: 'pf-2v2f', sheet: 'Porte-Fenêtre 2V+2F', label: 'Porte-Fenêtre 2V + 2 Fixes', shortLabel: '2V+2F' },
    ],
  },
  {
    id: 'portes',
    label: "Portes d'Entrée",
    icon: 'DoorClosed',
    products: [
      { id: 'porte-reno', sheet: 'Porte Entrée RENO', label: "Porte d'Entrée Rénovation", shortLabel: 'Réno' },
      { id: 'porte-neuf', sheet: 'Porte Entrée NEUF', label: "Porte d'Entrée Neuf", shortLabel: 'Neuf' },
    ],
  },
  {
    id: 'volets',
    label: 'Volets Roulants',
    icon: 'Blinds',
    products: [
      { id: 'volet-filaire', sheet: 'Volet Filaire', label: 'Volet Roulant Filaire', shortLabel: 'Filaire' },
      { id: 'volet-radio', sheet: 'Volet Filaire', label: 'Volet Roulant Radio', shortLabel: 'Radio' },
      { id: 'volet-solaire', sheet: 'Volet Filaire', label: 'Volet Roulant Solaire', shortLabel: 'Solaire' },
      { id: 'volet-manuel', sheet: 'Volet Filaire', label: 'Volet Roulant Manuel', shortLabel: 'Manuel' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: 'Recycle',
    products: [
      { id: 'gestion-dechets', sheet: 'Gestion Déchets', label: 'Gestion des Déchets', shortLabel: 'Déchets' },
    ],
  },
  {
    id: 'custom',
    label: 'Hors Catalogue',
    icon: 'PackagePlus',
    products: [
      { id: 'custom-product', sheet: 'Custom', label: 'Produit sur mesure', shortLabel: 'Sur-mesure' },
    ],
  },
];

/**
 * Options for product customization
 */
export const COLOR_OPTIONS = [
  { id: 'blanc', label: 'PVC Blanc', surcharge: 0, description: 'Standard' },
  { id: 'bicoloration', label: 'Bicoloration', surcharge: 0.35, description: '+35% après remise' },
  { id: 'coloration-2f', label: 'Coloration 2 faces', surcharge: 0.40, description: '+40% après remise' },
];

export const VOLET_COLOR_OPTIONS = [
  { id: 'blanc', label: 'Blanc', surcharge: 0, description: 'Standard' },
  { id: 'coloration-2f', label: 'Coloration 2 faces', surcharge: 0.10, description: '+10% sur prix de base' },
];

export const POSE_PRICES = {
  menuiserie: 250,
  volet: 100,
  porte: 400,
};

export const PETITS_BOIS_PRICE = 30; // per carré, après remise
export const OB_PRICE = 30; // par vantail, net (après remise)
export const GRILLE_PRICE = 10; // par vantail, net (après remise)
export const SOUS_BASSEMENT_PRICE = 10; // par élément, après remise

/**
 * Get available heights for a product sheet
 */
export function getHeights(sheetName) {
  const data = pricingData[sheetName];
  if (!data) return [];
  return data.heights;
}

/**
 * Get available widths for a product sheet and a given height
 */
export function getWidths(sheetName, height) {
  const data = pricingData[sheetName];
  if (!data) return [];
  // Return widths that have a price for this height
  const available = data.prices
    .filter((p) => p.h === height)
    .map((p) => p.l);
  return [...new Set(available)].sort((a, b) => a - b);
}

/**
 * Get the unit price for specific dimensions in millimeters.
 * Finds the closest upper bound in the pricing grid (which is in cm).
 */
export function getPriceForMm(sheetName, heightMm, widthMm) {
  const data = pricingData[sheetName];
  if (!data) return null;

  // Convert mm to cm for the grid lookup
  const heightCm = heightMm / 10;
  const widthCm = widthMm / 10;

  // Find the smallest available height that is >= requested height
  const availableHeights = data.heights.filter(h => h >= heightCm);
  if (availableHeights.length === 0) return null; // Too tall
  const billedHeight = Math.min(...availableHeights);

  // Get all widths available for this billed height
  const widthsForHeight = data.prices
    .filter(p => p.h === billedHeight)
    .map(p => p.l);
    
  // Find the smallest available width that is >= requested width
  const availableWidths = widthsForHeight.filter(w => w >= widthCm);
  if (availableWidths.length === 0) return null; // Too wide
  const billedWidth = Math.min(...availableWidths);

  // Get the exact price for these billed dimensions
  const entry = data.prices.find(p => p.h === billedHeight && p.l === billedWidth);
  
  if (!entry) return null;

  return {
    price: entry.prix,
    billedHeight,
    billedWidth
  };
}

/**
 * Calculate the surface area of a product in m2
 */
export function calculateSurface(widthMm, heightMm, quantity = 1) {
  return (widthMm / 1000) * (heightMm / 1000) * quantity;
}

/**
 * Determine the product type (for pose pricing)
 */
export function getProductType(sheetName) {
  if (!sheetName) return 'menuiserie';
  if (sheetName.startsWith('Volet')) return 'volet';
  if (sheetName.startsWith('Porte Entrée')) return 'porte';
  return 'menuiserie';
}

/**
 * Calculate the full price of a cart item
 */
export function calculateItemPrice(item) {
  // 1. Start with the raw grid price
  let basePrice = item.unitPrice;

  // 2. Apply color surcharge
  if (item.colorOption && item.colorOption.surcharge > 0) {
    basePrice = basePrice * (1 + item.colorOption.surcharge);
  }

  // 3. Add Motorization & Extras BEFORE discount, multiplying by 1.25
  let optionsPrice = 0;
  
  if (item.productId === 'volet-radio') {
    optionsPrice += 50 * 1.25;
  } else if (item.productId === 'volet-solaire') {
    optionsPrice += 240 * 1.25;
  }
  
  if (item.petitsBois && item.petitsBois > 0) {
    optionsPrice += item.petitsBois * PETITS_BOIS_PRICE * 1.25;
  }
  
  if (item.panneauDecoratif) {
    optionsPrice += 850 * 1.25;
  }

  if (item.sashOptions) {
    Object.values(item.sashOptions).forEach(sash => {
      if (sash.ob) optionsPrice += OB_PRICE * 1.25;
      if (sash.vent) optionsPrice += GRILLE_PRICE * 1.25;
    });
  }

  if (item.hasSousBassement) {
    optionsPrice += SOUS_BASSEMENT_PRICE * 1.25;
  }

  if (item.hasLockingHandle) {
    optionsPrice += 18.75;
  }

  // 3b. Add Glazing surcharge (NOT multiplied by 1.25 — the 2.88 markup is already in calculateGlazingExtra)
  if (item.glazingExtra && item.glazingExtra > 0) {
    optionsPrice += item.glazingExtra;
  }

  const totalPriceBeforeDiscount = basePrice + optionsPrice;

  // 4. Apply discount to EVERYTHING
  let priceAfterDiscount = totalPriceBeforeDiscount;
  if (item.remise && item.remise > 0) {
    priceAfterDiscount = totalPriceBeforeDiscount * (1 - item.remise / 100);
  }

  // 5. Special handling for Waste Management (Surface based)
  if (item.productId === 'gestion-dechets') {
    const weight = item.totalSurface * 40;
    const price = item.totalSurface * 4;
    return {
      unitPriceBase: price,
      unitPriceWithOptions: price,
      unitPriceAfterDiscount: price,
      posePrice: 0,
      totalLine: price,
      weight
    };
  }

  // 6. Special handling for Custom Products (User-defined price)
  if (item.productId === 'custom-product') {
    const price = Number(item.customPrice || 0);
    return {
      unitPriceBase: price,
      unitPriceWithOptions: price,
      unitPriceAfterDiscount: price,
      posePrice: 0,
      totalLine: price * (item.quantity || 1),
    };
  }

  // 7. Pose
  const productType = getProductType(item.sheetName);
  const posePrice = item.includePose ? POSE_PRICES[productType] : 0;

  return {
    unitPriceBase: item.unitPrice,
    unitPriceWithOptions: Math.round(totalPriceBeforeDiscount * 100) / 100, // grille + color + (options*1.25)
    unitPriceAfterDiscount: Math.round(priceAfterDiscount * 100) / 100,
    posePrice,
    totalLine: Math.round(priceAfterDiscount * item.quantity * 100) / 100, // DOES NOT INCLUDE POSE NOW
  };
}
