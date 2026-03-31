/**
 * Glazing options, frame systems, thermal performance, and filling pricing.
 */

export const BASE_GLASS_PRICE_PER_M2 = 37;
export const MARKUP_COEFFICIENT = 2.88;
export const PSI_G = 0.04;
export const PANEL_SANDWICH_GLAZING_ID = 'panel_sandwich_pvc_28';
export const PANEL_SANDWICH_PRICE_PER_M2 = 74.37;
export const PANEL_SANDWICH_COLOR_MULTIPLIER = 1.4;
export const SOUS_BASSEMENT_TRAVERSE_PRICE_PER_ML = 10;

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: 'dv_4_20_4_g200',
    label: 'Double vitrage isolant 4/20/4 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: '4/20/4 G200 Opaque',
    purchasePricePerM2: 42,
    ug: 1.1,
    g: 0.62,
    thicknessMm: 28,
    category: 'decoratif',
    isBaseIncluded: false,
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: 'dv_33_2_18_4',
    label: 'Double vitrage isolant feuillete 33.2/18/4 ITR Argon WE (28 mm)',
    shortLabel: 'Feuillete 33.2',
    purchasePricePerM2: 67,
    ug: 1.1,
    g: 0.57,
    thicknessMm: 28,
    category: 'securite',
    isBaseIncluded: false,
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: 'dv_33_2_18_4_g200',
    label: 'Double vitrage isolant feuillete 33.2/18/4 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: 'Feuillete 33.2 G200',
    purchasePricePerM2: 75,
    ug: 1.1,
    g: 0.55,
    thicknessMm: 28,
    category: 'securite_decoratif',
    isBaseIncluded: false,
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: 'dv_44_2_10_44_2',
    label: 'Double vitrage isolant feuillete 44.2/10/44.2 ITR Argon WE (28 mm)',
    shortLabel: 'Feuillete 2 faces',
    purchasePricePerM2: 78,
    ug: 1.4,
    g: 0.6,
    thicknessMm: 28,
    category: 'securite_renforcee',
    isBaseIncluded: false,
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: 'dv_44_2_10_44_2_g200',
    label: 'Double vitrage isolant feuillete 44.2/10/44.2 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: 'Feuillete 2 faces G200',
    purchasePricePerM2: 85,
    ug: 1.4,
    g: 0.58,
    thicknessMm: 28,
    category: 'securite_renforcee_decoratif',
    isBaseIncluded: false,
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
  },
  {
    id: PANEL_SANDWICH_GLAZING_ID,
    label: 'Panneau sandwich isolant PVC (Ep. 28 mm)',
    shortLabel: 'Panneau sandwich PVC 28 mm',
    purchasePricePerM2: PANEL_SANDWICH_PRICE_PER_M2,
    ug: null,
    g: null,
    thicknessMm: 28,
    category: 'remplissage',
    isBaseIncluded: false,
    isOpaqueFilling: true,
    isThermalDataAvailable: false,
  },
];

export const FRAME_SYSTEMS = [
  {
    id: 'ct70',
    label: 'Fenetre Schuco CT70',
    frameWidthMm: 112,
    uf: 1.3,
  },
  {
    id: 'softslide',
    label: 'Coulissant Schuco SoftSlide',
    frameWidthMm: 118,
    uf: 1.4,
  },
];

const resolveGlazingOption = (glazingOrId) => {
  if (!glazingOrId) return GLAZING_OPTIONS[0];
  if (typeof glazingOrId === 'string') {
    return GLAZING_OPTIONS.find((glazing) => glazing.id === glazingOrId) || GLAZING_OPTIONS[0];
  }
  return GLAZING_OPTIONS.find((glazing) => glazing.id === glazingOrId.id) || glazingOrId;
};

export function getSelectedGlazing(glazingId) {
  return resolveGlazingOption(glazingId);
}

export function getFrameSystemForProduct(sheetName) {
  if (!sheetName) return FRAME_SYSTEMS[0];
  if (sheetName.includes('Coulissant')) return FRAME_SYSTEMS[1];
  return FRAME_SYSTEMS[0];
}

export function isGlazedProduct(product) {
  if (!product || !product.sheet) return false;
  const sheet = product.sheet;
  if (sheet.startsWith('Volet')) return false;
  if (sheet.startsWith('Porte Entr')) return false;
  if (sheet.startsWith('Gestion D') || sheet === 'Custom') return false;
  return true;
}

export function isOpaqueFilling(glazingOrId) {
  return Boolean(resolveGlazingOption(glazingOrId)?.isOpaqueFilling);
}

export function getFillingPricePerM2(glazingOrId, colorOptionId = 'blanc') {
  const glazing = resolveGlazingOption(glazingOrId);
  if (!glazing) return BASE_GLASS_PRICE_PER_M2;

  if (glazing.id === PANEL_SANDWICH_GLAZING_ID) {
    const multiplier =
      colorOptionId && colorOptionId !== 'blanc'
        ? PANEL_SANDWICH_COLOR_MULTIPLIER
        : 1;
    return roundTo(glazing.purchasePricePerM2 * multiplier, 2);
  }

  return glazing.purchasePricePerM2;
}

export function calculateGlassAreas(widthMm, heightMm, frameWidthMm) {
  const W = widthMm / 1000;
  const H = heightMm / 1000;
  const frame = frameWidthMm / 1000;

  const Wg = W - 2 * frame;
  const Hg = H - 2 * frame;

  if (Wg <= 0 || Hg <= 0) return null;

  const Aw = W * H;
  const Ag = Wg * Hg;
  const Af = Aw - Ag;
  const Lg = 2 * (Wg + Hg);

  return { Aw, Ag, Af, Lg, Wg, Hg };
}

export function calculateUw({ Ag, Af, Aw, Lg, Ug, Uf, psi = PSI_G }) {
  if (
    !Number.isFinite(Aw) ||
    Aw <= 0 ||
    !Number.isFinite(Ag) ||
    !Number.isFinite(Af) ||
    !Number.isFinite(Lg) ||
    !Number.isFinite(Ug) ||
    !Number.isFinite(Uf)
  ) {
    return null;
  }

  const raw = (Ag * Ug + Af * Uf + Lg * psi) / Aw - 0.02;
  return roundTo(raw, 2);
}

export function calculateSw({ Ag, Aw, g }) {
  if (!Number.isFinite(Aw) || Aw <= 0 || !Number.isFinite(Ag) || !Number.isFinite(g)) {
    return null;
  }

  const raw = (Ag / Aw) * g;
  return roundTo(raw, 2);
}

export function calculateGlazingExtra({ selectedGlassPricePerM2, Ag }) {
  if (!Number.isFinite(selectedGlassPricePerM2) || !Number.isFinite(Ag) || Ag <= 0) {
    return 0;
  }

  const extraPerM2 = Math.max(0, selectedGlassPricePerM2 - BASE_GLASS_PRICE_PER_M2);
  return roundTo(extraPerM2 * Ag * MARKUP_COEFFICIENT, 2);
}

export function calculateSoubassementMetrics({
  glassAreas,
  widthMm,
  hasSousBassement = false,
  sousBassementHeightMm = 0,
}) {
  const totalGlassAreaM2 = glassAreas?.Ag || 0;

  if (!hasSousBassement || !glassAreas || totalGlassAreaM2 <= 0) {
    return {
      visibleHeightMm: 0,
      traverseLengthMl: 0,
      panelAreaM2: 0,
      remainingGlassAreaM2: totalGlassAreaM2,
    };
  }

  const maxVisibleHeightMm = Math.max(0, (glassAreas.Hg || 0) * 1000);
  const visibleHeightMm = clamp(
    Number(sousBassementHeightMm || 0),
    0,
    maxVisibleHeightMm
  );
  const panelAreaM2 = Math.min(
    totalGlassAreaM2,
    Math.max(0, (glassAreas.Wg || 0) * (visibleHeightMm / 1000))
  );

  return {
    visibleHeightMm,
    traverseLengthMl: Math.max(0, Number(widthMm || 0)) / 1000,
    panelAreaM2: roundTo(panelAreaM2, 4),
    remainingGlassAreaM2: roundTo(
      Math.max(0, totalGlassAreaM2 - panelAreaM2),
      4
    ),
  };
}

export function calculateGlazingAndPanelExtras({
  selectedGlazing,
  glassAreas,
  widthMm,
  hasSousBassement = false,
  sousBassementHeightMm = 0,
  colorOptionId = 'blanc',
}) {
  const glazing = resolveGlazingOption(selectedGlazing);
  const sousBassement = calculateSoubassementMetrics({
    glassAreas,
    widthMm,
    hasSousBassement,
    sousBassementHeightMm,
  });

  const glazingAreaM2 = hasSousBassement
    ? sousBassement.remainingGlassAreaM2
    : glassAreas?.Ag || 0;

  const glazingExtra =
    glazing && !glazing.isBaseIncluded
      ? calculateGlazingExtra({
          selectedGlassPricePerM2: getFillingPricePerM2(glazing, colorOptionId),
          Ag: glazingAreaM2,
        })
      : 0;

  const sousBassementPanelExtra =
    sousBassement.panelAreaM2 > 0
      ? calculateGlazingExtra({
          selectedGlassPricePerM2: getFillingPricePerM2(
            PANEL_SANDWICH_GLAZING_ID,
            colorOptionId
          ),
          Ag: sousBassement.panelAreaM2,
        })
      : 0;

  const sousBassementTraversePrice =
    sousBassement.traverseLengthMl > 0
      ? roundTo(
          sousBassement.traverseLengthMl * SOUS_BASSEMENT_TRAVERSE_PRICE_PER_ML,
          2
        )
      : 0;

  return {
    selectedGlazing: glazing,
    glazingAreaM2: roundTo(glazingAreaM2, 4),
    glazingExtra: roundTo(glazingExtra, 2),
    sousBassementVisibleHeightMm: sousBassement.visibleHeightMm,
    sousBassementTraverseMl: roundTo(sousBassement.traverseLengthMl, 3),
    sousBassementTraversePrice,
    sousBassementPanelAreaM2: sousBassement.panelAreaM2,
    sousBassementPanelExtra: roundTo(sousBassementPanelExtra, 2),
    totalExtra: roundTo(
      glazingExtra + sousBassementPanelExtra + sousBassementTraversePrice,
      2
    ),
  };
}
