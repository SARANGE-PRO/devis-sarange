/**
 * Glazing options, frame systems, and thermal performance calculations.
 * All business logic for glazing is centralized here.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const BASE_GLASS_PRICE_PER_M2 = 37; // €/m² — included in base menuiserie price
export const MARKUP_COEFFICIENT = 2.88;     // Commercial markup on glass surcharge
export const PSI_G = 0.04;                  // Intercalaire coefficient (W/m·K)

// ─── Glazing Database ────────────────────────────────────────────────────────

export const GLAZING_OPTIONS = [
  {
    id: 'dv_4_20_4_argon_we',
    label: 'Double vitrage isolant 4/20/4 ITR Argon WE (28 mm)',
    shortLabel: '4/20/4 Argon WE',
    purchasePricePerM2: 37,
    ug: 1.1,
    g: 0.63,
    thicknessMm: 28,
    category: 'standard',
    isBaseIncluded: true,
  },
  {
    id: 'dv_4_20_4_g200',
    label: 'Double vitrage isolant 4/20/4 ITR Argon WE Granité 200 (28 mm)',
    shortLabel: '4/20/4 G200 Opaque',
    purchasePricePerM2: 42,
    ug: 1.1,
    g: 0.62,
    thicknessMm: 28,
    category: 'decoratif',
    isBaseIncluded: false,
  },
  {
    id: 'dv_33_2_18_4',
    label: 'Double vitrage isolant feuilleté 33.2/18/4 ITR Argon WE (28 mm)',
    shortLabel: 'Feuilleté 33.2',
    purchasePricePerM2: 67,
    ug: 1.1,
    g: 0.57,
    thicknessMm: 28,
    category: 'securite',
    isBaseIncluded: false,
  },
  {
    id: 'dv_33_2_18_4_g200',
    label: 'Double vitrage isolant feuilleté 33.2/18/4 ITR Argon WE Granité 200 (28 mm)',
    shortLabel: 'Feuilleté 33.2 G200',
    purchasePricePerM2: 75,
    ug: 1.1,
    g: 0.55,
    thicknessMm: 28,
    category: 'securite_decoratif',
    isBaseIncluded: false,
  },
  {
    id: 'dv_44_2_10_44_2',
    label: 'Double vitrage isolant feuilleté 44.2/10/44.2 ITR Argon WE (28 mm)',
    shortLabel: 'Feuilleté 2 faces',
    purchasePricePerM2: 78,
    ug: 1.4,
    g: 0.60,
    thicknessMm: 28,
    category: 'securite_renforcee',
    isBaseIncluded: false,
  },
  {
    id: 'dv_44_2_10_44_2_g200',
    label: 'Double vitrage isolant feuilleté 44.2/10/44.2 ITR Argon WE Granité 200 (28 mm)',
    shortLabel: 'Feuilleté 2 faces G200',
    purchasePricePerM2: 85,
    ug: 1.4,
    g: 0.58,
    thicknessMm: 28,
    category: 'securite_renforcee_decoratif',
    isBaseIncluded: false,
  },
];

// ─── Frame Systems ───────────────────────────────────────────────────────────

export const FRAME_SYSTEMS = [
  {
    id: 'ct70',
    label: 'Fenêtre Schüco CT70',
    frameWidthMm: 112,
    uf: 1.3,
  },
  {
    id: 'softslide',
    label: 'Coulissant Schüco SoftSlide',
    frameWidthMm: 118,
    uf: 1.4,
  },
];

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Get a glazing option by ID. Falls back to the standard option.
 */
export function getSelectedGlazing(glazingId) {
  return GLAZING_OPTIONS.find((g) => g.id === glazingId) || GLAZING_OPTIONS[0];
}

/**
 * Get the frame system based on the product sheet name.
 * Coulissants → SoftSlide, everything else → CT70.
 */
export function getFrameSystemForProduct(sheetName) {
  if (!sheetName) return FRAME_SYSTEMS[0];
  if (sheetName.includes('Coulissant')) return FRAME_SYSTEMS[1]; // SoftSlide
  return FRAME_SYSTEMS[0]; // CT70
}

/**
 * Determine if a product is a glazed menuiserie (eligible for glazing selection).
 * Returns true for fenêtres, portes-fenêtres, coulissants.
 * Returns false for volets, portes d'entrée, services, custom products.
 */
export function isGlazedProduct(product) {
  if (!product || !product.sheet) return false;
  const sheet = product.sheet;
  // Exclude volets
  if (sheet.startsWith('Volet')) return false;
  // Exclude portes d'entrée
  if (sheet.startsWith('Porte Entrée')) return false;
  // Exclude special products
  if (sheet === 'Gestion Déchets' || sheet === 'Custom') return false;
  // Everything else (Fenêtre, Porte-Fenêtre, Coulissant) is glazed
  return true;
}

// ─── Surface Calculations ────────────────────────────────────────────────────

/**
 * Calculate glass area metrics from overall menuiserie dimensions and frame width.
 * All inputs in mm, all outputs in m or m².
 *
 * Returns null if dimensions are invalid (glass area would be zero or negative).
 */
export function calculateGlassAreas(widthMm, heightMm, frameWidthMm) {
  const W = widthMm / 1000;
  const H = heightMm / 1000;
  const frame = frameWidthMm / 1000;

  const Wg = W - 2 * frame;
  const Hg = H - 2 * frame;

  if (Wg <= 0 || Hg <= 0) return null; // Invalid dimensions

  const Aw = W * H;       // Total window area
  const Ag = Wg * Hg;     // Glass area
  const Af = Aw - Ag;     // Frame area
  const Lg = 2 * (Wg + Hg); // Glass perimeter

  return { Aw, Ag, Af, Lg, Wg, Hg };
}

// ─── Thermal Performance ─────────────────────────────────────────────────────

/**
 * Calculate the global Uw of the menuiserie (simplified EN ISO 10077-1).
 * Uw = ((Ag * Ug + Af * Uf + Lg * Psi) / Aw) - 0.02
 */
export function calculateUw({ Ag, Af, Aw, Lg, Ug, Uf, psi = PSI_G }) {
  if (!Aw || Aw <= 0) return null;
  const raw = (Ag * Ug + Af * Uf + Lg * psi) / Aw - 0.02;
  return Math.round(raw * 100) / 100;
}

/**
 * Calculate the global Sw (solar factor) of the menuiserie.
 * Sw = (Ag / Aw) * g
 */
export function calculateSw({ Ag, Aw, g }) {
  if (!Aw || Aw <= 0) return null;
  const raw = (Ag / Aw) * g;
  return Math.round(raw * 100) / 100;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Calculate the commercial glazing surcharge relative to the standard glass.
 *
 * Formula: surcoût = max(0, (selectedPricePerM2 - BASE_GLASS_PRICE_PER_M2)) * Ag * MARKUP_COEFFICIENT
 *
 * This surcharge is added BEFORE commercial discount (remise) in calculateItemPrice.
 */
export function calculateGlazingExtra({ selectedGlassPricePerM2, Ag }) {
  const extraPerM2 = Math.max(0, selectedGlassPricePerM2 - BASE_GLASS_PRICE_PER_M2);
  return Math.round(extraPerM2 * Ag * MARKUP_COEFFICIENT * 100) / 100;
}
