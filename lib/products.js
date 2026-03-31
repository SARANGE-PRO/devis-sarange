import pricingData from '@/data/pricing.json';
import {
  calculateGlassAreas,
  calculateGlazingAndPanelExtras,
  calculateSw,
  calculateUw,
  getFrameSystemForProduct,
  getSelectedGlazing,
  isGlazedProduct,
} from '@/lib/glazing';
import { calculateGrossAmountToAddForNetMargin } from '@/lib/pricing-margin.mjs';

/**
 * Product categories with metadata for UI display.
 * The composite builder is now a global mode, not a catalog category.
 */
export const CATEGORIES = [
  {
    id: 'fenetres',
    label: 'Fenetres',
    icon: 'LayoutGrid',
    products: [
      { id: 'fenetre-1v', sheet: 'FenÃªtre 1V', label: 'Fenetre 1 vantail', shortLabel: '1V' },
      { id: 'fenetre-2v', sheet: 'FenÃªtre 2V', label: 'Fenetre 2 vantaux', shortLabel: '2V' },
      { id: 'fenetre-3v', sheet: 'FenÃªtre 3V', label: 'Fenetre 3 vantaux', shortLabel: '3V' },
      { id: 'fenetre-4v', sheet: 'FenÃªtre 4V', label: 'Fenetre 4 vantaux', shortLabel: '4V' },
      { id: 'fenetre-2v1f', sheet: 'FenÃªtre 2V+1F', label: 'Fenetre 2V + 1 fixe', shortLabel: '2V+1F' },
      { id: 'fenetre-2v2f', sheet: 'FenÃªtre 2V+2F', label: 'Fenetre 2V + 2 fixes', shortLabel: '2V+2F' },
      { id: 'fenetre-fixe', sheet: 'FenÃªtre Fixe', label: 'Fenetre fixe', shortLabel: 'Fixe' },
      { id: 'fenetre-soufflet', sheet: 'FenÃªtre Soufflet', label: 'Fenetre soufflet', shortLabel: 'Soufflet' },
    ],
  },
  {
    id: 'coulissants',
    label: 'Coulissants',
    icon: 'ArrowLeftRight',
    products: [
      { id: 'coulissant-2v2r', sheet: 'Coulissant 2 vantaux 2 rails', label: 'Coulissant 2 vantaux 2 rails', shortLabel: '2V 2R' },
    ],
  },
  {
    id: 'portes-fenetres',
    label: 'Portes-Fenetres',
    icon: 'DoorOpen',
    products: [
      { id: 'pf-1v', sheet: 'Porte-FenÃªtre 1V', label: 'Porte-fenetre 1 vantail', shortLabel: '1V' },
      { id: 'pf-2v', sheet: 'Porte-FenÃªtre 2V', label: 'Porte-fenetre 2 vantaux', shortLabel: '2V' },
      { id: 'pf-2v1f', sheet: 'Porte-FenÃªtre 2V+1F', label: 'Porte-fenetre 2V + 1 fixe', shortLabel: '2V+1F' },
      { id: 'pf-2v2f', sheet: 'Porte-FenÃªtre 2V+2F', label: 'Porte-fenetre 2V + 2 fixes', shortLabel: '2V+2F' },
    ],
  },
  {
    id: 'portes',
    label: 'Portes d entree',
    icon: 'DoorClosed',
    products: [
      { id: 'porte-reno', sheet: 'Porte EntrÃ©e RENO', label: "Porte d'entree renovation", shortLabel: 'Reno' },
      { id: 'porte-neuf', sheet: 'Porte EntrÃ©e NEUF', label: "Porte d'entree neuf", shortLabel: 'Neuf' },
    ],
  },
  {
    id: 'volets',
    label: 'Volets roulants',
    icon: 'Blinds',
    products: [
      { id: 'volet-filaire', sheet: 'Volet Filaire', label: 'Volet roulant filaire', shortLabel: 'Filaire' },
      { id: 'volet-radio', sheet: 'Volet Filaire', label: 'Volet roulant radio', shortLabel: 'Radio' },
      { id: 'volet-solaire', sheet: 'Volet Filaire', label: 'Volet roulant solaire', shortLabel: 'Solaire' },
      { id: 'volet-manuel', sheet: 'Volet Filaire', label: 'Volet roulant manuel', shortLabel: 'Manuel' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: 'Recycle',
    products: [
      { id: 'gestion-dechets', sheet: 'Gestion DÃ©chets', label: 'Gestion des dechets', shortLabel: 'Dechets' },
    ],
  },
  {
    id: 'custom',
    label: 'Hors catalogue',
    icon: 'PackagePlus',
    products: [
      { id: 'custom-product', sheet: 'Custom', label: 'Produit sur mesure', shortLabel: 'Sur-mesure' },
    ],
  },
];

export const COLOR_OPTIONS = [
  { id: 'blanc', label: 'PVC Blanc', surcharge: 0, description: 'Standard' },
  { id: 'bicoloration', label: 'Bicoloration', surcharge: 0.35, description: '+35% apres remise' },
  { id: 'coloration-2f', label: 'Coloration 2 faces', surcharge: 0.4, description: '+40% apres remise' },
];

export const VOLET_COLOR_OPTIONS = [
  { id: 'blanc', label: 'Blanc', surcharge: 0, description: 'Standard' },
  { id: 'coloration-2f', label: 'Coloration 2 faces', surcharge: 0.1, description: '+10% sur prix de base' },
];

export const POSE_PRICES = {
  menuiserie: 250,
  volet: 100,
  porte: 400,
};

export const PETITS_BOIS_PRICE = 37.5;
export const OB_PRICE = 30;
export const GRILLE_PRICE = 10;

export const WASTE_FACTORS = {
  fenetres: 35,
  'portes-fenetres': 35,
  portes: 40,
  coulissants: 45,
  volets: 12,
};

export const WASTE_PRICE_PER_KG = 0.18;

const BUILDER_CATEGORY_IDS = ['fenetres', 'portes-fenetres', 'coulissants', 'portes'];

const parsePetitsBoisValue = (value) =>
  Math.max(0, Number.parseInt(value, 10) || 0);

const resolvePetitsBoisConfig = (source = {}) => {
  const legacyValue = parsePetitsBoisValue(source.petitsBois);
  const petitsBoisH = parsePetitsBoisValue(source.petitsBoisH);
  const petitsBoisV = parsePetitsBoisValue(
    source.petitsBoisV ?? (source.petitsBoisH == null ? legacyValue : 0)
  );

  return {
    petitsBoisH,
    petitsBoisV,
  };
};

const calculatePetitsBoisPrice = ({
  widthMm,
  heightMm,
  petitsBoisH = 0,
  petitsBoisV = 0,
}) => {
  const widthMeters = Math.max(0, Number(widthMm) || 0) / 1000;
  const heightMeters = Math.max(0, Number(heightMm) || 0) / 1000;
  const mlTotal =
    parsePetitsBoisValue(petitsBoisH) * widthMeters +
    parsePetitsBoisValue(petitsBoisV) * heightMeters;

  return roundCurrency(mlTotal * PETITS_BOIS_PRICE);
};

const CANONICAL_SHEET_BY_PRODUCT_ID = {
  'fenetre-1v': 'Fen\u00eatre 1V',
  'fenetre-2v': 'Fen\u00eatre 2V',
  'fenetre-3v': 'Fen\u00eatre 3V',
  'fenetre-4v': 'Fen\u00eatre 4V',
  'fenetre-2v1f': 'Fen\u00eatre 2V+1F',
  'fenetre-2v2f': 'Fen\u00eatre 2V+2F',
  'fenetre-fixe': 'Fen\u00eatre Fixe',
  'fenetre-soufflet': 'Fen\u00eatre Soufflet',
  'pf-1v': 'Porte-Fen\u00eatre 1V',
  'pf-2v': 'Porte-Fen\u00eatre 2V',
  'pf-2v1f': 'Porte-Fen\u00eatre 2V+1F',
  'pf-2v2f': 'Porte-Fen\u00eatre 2V+2F',
  'coulissant-2v2r': 'Coulissant 2 vantaux 2 rails',
  'porte-reno': 'Porte Entr\u00e9e RENO',
  'porte-neuf': 'Porte Entr\u00e9e NEUF',
  'volet-filaire': 'Volet Filaire',
  'volet-radio': 'Volet Filaire',
  'volet-solaire': 'Volet Filaire',
  'volet-manuel': 'Volet Filaire',
  'gestion-dechets': 'Gestion D\u00e9chets',
  'custom-product': 'Custom',
};

const encodeAsMojibake = (value) =>
  Array.from(new TextEncoder().encode(value), (byte) =>
    String.fromCharCode(byte)
  ).join('');

const SHEET_NAME_ALIASES = new Map();

const registerSheetAlias = (canonical) => {
  const singleMojibake = encodeAsMojibake(canonical);
  const doubleMojibake = encodeAsMojibake(singleMojibake);

  [canonical, singleMojibake, doubleMojibake].forEach((variant) => {
    SHEET_NAME_ALIASES.set(variant, canonical);
  });
};

Object.values(CANONICAL_SHEET_BY_PRODUCT_ID).forEach(registerSheetAlias);

export function normalizeSheetName(sheetName) {
  return SHEET_NAME_ALIASES.get(sheetName) || sheetName;
}

const PRODUCT_BY_ID = new Map();
const PRODUCT_BY_SHEET = new Map();

CATEGORIES.forEach((category) => {
  category.products.forEach((product) => {
    const canonicalSheet =
      CANONICAL_SHEET_BY_PRODUCT_ID[product.id] || normalizeSheetName(product.sheet);
    const enrichedProduct = {
      ...product,
      sheet: canonicalSheet,
      categoryId: category.id,
    };
    PRODUCT_BY_ID.set(product.id, enrichedProduct);
    PRODUCT_BY_SHEET.set(canonicalSheet, enrichedProduct);
    PRODUCT_BY_SHEET.set(normalizeSheetName(product.sheet), enrichedProduct);
  });
});

const DEFAULT_COLOR_STATE = {
  bicoType: 'standard_7016',
  customColorIntText: '',
  customColorExtText: '',
  customColorIntHex: '#FFFFFF',
  isExtPlaxageBico: false,
  color2fType: 'standard_7016',
  customColor2fText: '',
  customColor2fHex: '#4A4A4A',
  is2fPlaxage: true,
};

const LEGACY_COMPOSITE_PRODUCT_MAP = {
  Ouvrant: 'fenetre-1v',
  Fixe: 'fenetre-fixe',
  Soufflet: 'fenetre-soufflet',
};

const DEFAULT_MODULE_DIMENSIONS = {
  'fenetre-1v': { widthMm: 800, heightMm: 1250 },
  'fenetre-2v': { widthMm: 1200, heightMm: 1250 },
  'fenetre-3v': { widthMm: 1800, heightMm: 1250 },
  'fenetre-4v': { widthMm: 2400, heightMm: 1250 },
  'fenetre-2v1f': { widthMm: 1800, heightMm: 1250 },
  'fenetre-2v2f': { widthMm: 2400, heightMm: 1250 },
  'fenetre-fixe': { widthMm: 800, heightMm: 1250 },
  'fenetre-soufflet': { widthMm: 1200, heightMm: 400 },
  'coulissant-2v2r': { widthMm: 1600, heightMm: 2150 },
  'pf-1v': { widthMm: 900, heightMm: 2150 },
  'pf-2v': { widthMm: 1600, heightMm: 2150 },
  'pf-2v1f': { widthMm: 1900, heightMm: 2150 },
  'pf-2v2f': { widthMm: 2200, heightMm: 2150 },
  'porte-reno': { widthMm: 900, heightMm: 2150 },
  'porte-neuf': { widthMm: 900, heightMm: 2150 },
};

const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const cloneColorState = (value = {}) => ({
  ...DEFAULT_COLOR_STATE,
  ...value,
});

export function createDefaultColorState(overrides = {}) {
  return cloneColorState(overrides);
}

const sanitizeSashOptions = (value = {}) =>
  Object.entries(value || {}).reduce((accumulator, [key, sash]) => {
    accumulator[key] = {
      ob: Boolean(sash?.ob),
      vent: Boolean(sash?.vent),
    };
    return accumulator;
  }, {});

const getDefaultDimensionsForProduct = (productId) =>
  DEFAULT_MODULE_DIMENSIONS[productId] || { widthMm: 800, heightMm: 1250 };

const resolveCompositeProduct = (value) => {
  if (!value) return PRODUCT_BY_ID.get('fenetre-1v');
  if (PRODUCT_BY_ID.has(value)) return PRODUCT_BY_ID.get(value);
  if (PRODUCT_BY_SHEET.has(value)) return PRODUCT_BY_SHEET.get(value);
  if (LEGACY_COMPOSITE_PRODUCT_MAP[value]) {
    return PRODUCT_BY_ID.get(LEGACY_COMPOSITE_PRODUCT_MAP[value]);
  }
  return PRODUCT_BY_ID.get('fenetre-1v');
};

const normalizeModuleOptions = (productId, options = {}, legacySource = {}) => ({
  colorOptionId:
    options.colorOptionId ||
    legacySource.colorOptionId ||
    legacySource.colorOption?.id ||
    'blanc',
  rawColorState: cloneColorState(options.rawColorState || legacySource.rawColorState),
  ...resolvePetitsBoisConfig({
    petitsBoisH: options.petitsBoisH ?? legacySource.petitsBoisH,
    petitsBoisV: options.petitsBoisV ?? legacySource.petitsBoisV,
    petitsBois: options.petitsBois ?? legacySource.petitsBois,
  }),
  panneauDecoratif: Boolean(options.panneauDecoratif ?? legacySource.panneauDecoratif),
  hasSousBassement: Boolean(options.hasSousBassement ?? legacySource.hasSousBassement),
  sousBassementHeight: parsePositiveNumber(
    options.sousBassementHeight ?? legacySource.sousBassementHeight,
    400
  ),
  sashOptions: sanitizeSashOptions(options.sashOptions || legacySource.sashOptions),
  openingDirection: options.openingDirection || legacySource.openingDirection || 'standard',
  glazingId: options.glazingId || legacySource.glazingId || legacySource.glazingOption?.id || 'dv_4_20_4_argon_we',
  hasLockingHandle: Boolean(options.hasLockingHandle ?? legacySource.hasLockingHandle),
  productId,
});

const createModuleId = (seed) => `module-${seed}`;
const createRowId = (seed) => `row-${seed}`;

export const COMPOSITE_MODULE_TYPES = BUILDER_CATEGORY_IDS.map((categoryId) => {
  const category = CATEGORIES.find((entry) => entry.id === categoryId);

  return {
    ...category,
    products: category.products.map((product) => ({
      ...product,
      categoryId,
      ...getDefaultDimensionsForProduct(product.id),
    })),
  };
});

export function getProductById(productId) {
  return PRODUCT_BY_ID.get(productId) || null;
}

export function getProductBySheetName(sheetName) {
  return PRODUCT_BY_SHEET.get(normalizeSheetName(sheetName)) || null;
}

export function getProductCategory(productId) {
  return getProductById(productId)?.categoryId || null;
}

export function getCompositeModuleDefinition(type = 'fenetre-1v') {
  return resolveCompositeProduct(type);
}

export function createCompositeModule(id, overrides = {}) {
  const product = resolveCompositeProduct(
    overrides.productId || overrides.sheetName || overrides.type
  );
  const defaults = getDefaultDimensionsForProduct(product.id);

  return {
    id: overrides.id || createModuleId(id),
    productId: product.id,
    categoryId: overrides.categoryId || product.categoryId,
    widthMm: parsePositiveNumber(
      overrides.widthMm ?? overrides.largeur,
      defaults.widthMm
    ),
    heightMm: parsePositiveNumber(
      overrides.heightMm ?? overrides.hauteur,
      defaults.heightMm
    ),
    options: normalizeModuleOptions(product.id, overrides.options, overrides),
  };
}

export function createCompositeRow(id, modules) {
  return {
    id: createRowId(id),
    modules:
      modules && modules.length
        ? modules.map((module, index) => createCompositeModule(`${id}-${index + 1}`, module))
        : [createCompositeModule(`${id}-1`)],
  };
}

export function createCompositeComposition() {
  return [createCompositeRow(1)];
}

export function normalizeCompositeComposition(composition = [], legacyModules = null) {
  if (Array.isArray(composition) && composition.some((row) => Array.isArray(row?.modules))) {
    return composition.map((row, rowIndex) => ({
      id: row?.id || createRowId(rowIndex + 1),
      modules:
        row.modules && row.modules.length
          ? row.modules.map((module, moduleIndex) =>
              createCompositeModule(`${rowIndex + 1}-${moduleIndex + 1}`, module)
            )
          : [createCompositeModule(`${rowIndex + 1}-1`)],
    }));
  }

  if (Array.isArray(legacyModules) && legacyModules.length) {
    return [
      {
        id: createRowId(1),
        modules: legacyModules.map((module, moduleIndex) =>
          createCompositeModule(`1-${moduleIndex + 1}`, module)
        ),
      },
    ];
  }

  return createCompositeComposition();
}

export function flattenCompositeModules(composition = [], legacyModules = null) {
  return normalizeCompositeComposition(composition, legacyModules).flatMap((row, rowIndex) =>
    row.modules.map((module, moduleIndex) => ({
      ...module,
      rowId: row.id,
      rowIndex,
      moduleIndex,
    }))
  );
}

const getColorOptionsForProduct = (product) =>
  product?.sheet?.startsWith('Volet') ? VOLET_COLOR_OPTIONS : COLOR_OPTIONS;

const buildModulePricingData = (module) => {
  const product = resolveCompositeProduct(module?.productId || module?.sheetName || module?.type);
  const defaults = getDefaultDimensionsForProduct(product.id);
  const widthMm = parsePositiveNumber(module?.widthMm ?? module?.largeur, defaults.widthMm);
  const heightMm = parsePositiveNumber(module?.heightMm ?? module?.hauteur, defaults.heightMm);
  const options = normalizeModuleOptions(product.id, module?.options, module);
  const colorOptions = getColorOptionsForProduct(product);
  const colorOption =
    colorOptions.find((entry) => entry.id === options.colorOptionId) || colorOptions[0];
  const isPorte = product.sheet.startsWith('Porte Entr');
  const isVolet = product.sheet.startsWith('Volet');
  const isGlazed = isGlazedProduct(product) || (isPorte && !options.panneauDecoratif);
  const frameSystem = isGlazed ? getFrameSystemForProduct(product.sheet) : null;
  const selectedGlazing = isGlazed ? getSelectedGlazing(options.glazingId) : null;
  const glassAreas =
    isGlazed && frameSystem
      ? calculateGlassAreas(widthMm, heightMm, frameSystem.frameWidthMm)
      : null;
  const fillingPricing =
    isGlazed && glassAreas
      ? calculateGlazingAndPanelExtras({
          selectedGlazing,
          glassAreas,
          widthMm,
          hasSousBassement: options.hasSousBassement,
          sousBassementHeightMm: options.sousBassementHeight,
          colorOptionId: options.colorOptionId,
        })
      : {
          glazingExtra: 0,
          sousBassementTraversePrice: 0,
          sousBassementPanelExtra: 0,
          totalExtra: 0,
        };
  const canComputeThermal =
    glassAreas &&
    frameSystem &&
    selectedGlazing &&
    selectedGlazing.isThermalDataAvailable !== false &&
    !options.hasSousBassement;
  const thermalUw =
    canComputeThermal
      ? calculateUw({
          Ag: glassAreas.Ag,
          Af: glassAreas.Af,
          Aw: glassAreas.Aw,
          Lg: glassAreas.Lg,
          Ug: selectedGlazing.ug,
          Uf: frameSystem.uf,
        })
      : null;
  const thermalSw =
    canComputeThermal
      ? calculateSw({ Ag: glassAreas.Ag, Aw: glassAreas.Aw, g: selectedGlazing.g })
      : null;
  const priceData = getPriceForMm(product.sheet, heightMm, widthMm);

  let modulePrice = priceData?.price ?? null;

  if (modulePrice !== null && colorOption?.surcharge > 0) {
    modulePrice = modulePrice * (1 + colorOption.surcharge);
  }

  let optionsPrice = 0;

  const petitsBoisPrice = calculatePetitsBoisPrice({
    widthMm,
    heightMm,
    petitsBoisH: options.petitsBoisH,
    petitsBoisV: options.petitsBoisV,
  });

  if (petitsBoisPrice > 0) {
    optionsPrice += petitsBoisPrice;
  }

  if (options.panneauDecoratif) {
    optionsPrice += 850 * 1.25;
  }

  Object.values(options.sashOptions).forEach((sash) => {
    if (sash?.ob) optionsPrice += OB_PRICE * 1.25;
    if (sash?.vent) optionsPrice += GRILLE_PRICE * 1.25;
  });

  if (options.hasLockingHandle) {
    optionsPrice += 18.75;
  }

  if (fillingPricing.totalExtra > 0) {
    optionsPrice += fillingPricing.totalExtra;
  }

  return {
    ...createCompositeModule(module?.id || product.id, {
      ...module,
      productId: product.id,
      widthMm,
      heightMm,
      options,
    }),
    productId: product.id,
    productLabel: product.label,
    sheetName: product.sheet,
    categoryId: product.categoryId,
    shortLabel: product.shortLabel,
    colorOption,
    glazingOption: selectedGlazing,
    glazingExtra: fillingPricing.totalExtra,
    thermalUw,
    thermalSw,
    billedHeightCm: priceData?.billedHeight ?? null,
    billedWidthCm: priceData?.billedWidth ?? null,
    priceData,
    unitPrice: modulePrice === null ? null : roundCurrency(modulePrice + optionsPrice),
    isGlazed,
  };
};

export function getCompositeDimensions(composition = [], legacyModules = null) {
  const normalized = normalizeCompositeComposition(composition, legacyModules);

  const rows = normalized.map((row) => {
    const modules = row.modules.map((module) => createCompositeModule(module.id, module));
    const width = modules.reduce((total, module) => total + parsePositiveNumber(module.widthMm), 0);
    const height = modules.reduce(
      (currentMax, module) => Math.max(currentMax, parsePositiveNumber(module.heightMm)),
      0
    );

    return {
      id: row.id,
      width,
      height,
      modules,
    };
  });

  return {
    rows,
    width: rows.reduce((currentMax, row) => Math.max(currentMax, row.width), 0),
    height: rows.reduce((total, row) => total + row.height, 0),
  };
}

export function getCompositeTotalWidth(composition = [], legacyModules = null) {
  return getCompositeDimensions(composition, legacyModules).width;
}

export function getCompositeModuleCount(composition = [], legacyModules = null) {
  return flattenCompositeModules(composition, legacyModules).length;
}

export function getCompositePricing(composition = [], legacyModules = null) {
  const normalized = normalizeCompositeComposition(composition, legacyModules);

  const pricedRows = normalized.map((row) => {
    const modules = row.modules.map((module) => buildModulePricingData(module));
    const width = modules.reduce((total, module) => total + parsePositiveNumber(module.widthMm), 0);
    const height = modules.reduce(
      (currentMax, module) => Math.max(currentMax, parsePositiveNumber(module.heightMm)),
      0
    );

    return {
      id: row.id,
      width,
      height,
      modules,
    };
  });

  const modulePricing = pricedRows.flatMap((row, rowIndex) =>
    row.modules.map((module, moduleIndex) => ({
      ...module,
      rowId: row.id,
      rowIndex,
      moduleIndex,
    }))
  );

  const hasInvalidModule =
    modulePricing.length === 0 ||
    modulePricing.some(
      (module) =>
        parsePositiveNumber(module.widthMm) <= 0 ||
        parsePositiveNumber(module.heightMm) <= 0 ||
        module.unitPrice === null
    );

  return {
    composition: pricedRows.map((row) => ({
      id: row.id,
      modules: row.modules,
      widthMm: row.width,
      heightMm: row.height,
    })),
    modulePricing,
    totalWidth: pricedRows.reduce((currentMax, row) => Math.max(currentMax, row.width), 0),
    totalHeight: pricedRows.reduce((total, row) => total + row.height, 0),
    totalPrice: hasInvalidModule
      ? null
      : roundCurrency(modulePricing.reduce((total, module) => total + module.unitPrice, 0)),
    hasInvalidModule,
  };
}

export function formatCompositeModules(composition = [], separator = ' / ') {
  const normalized = normalizeCompositeComposition(
    Array.isArray(composition) && composition.some((row) => Array.isArray(row?.modules))
      ? composition
      : [],
    Array.isArray(composition) && !composition.some((row) => Array.isArray(row?.modules))
      ? composition
      : null
  );

  return normalized
    .map((row, rowIndex) => {
      const rowLabel = row.modules
        .map((module) => {
          const product = resolveCompositeProduct(module.productId || module.sheetName || module.type);
          const widthMm = parsePositiveNumber(module.widthMm ?? module.largeur);
          const heightMm = parsePositiveNumber(module.heightMm ?? module.hauteur);
          return `${product.shortLabel || product.label} ${widthMm}x${heightMm}`;
        })
        .join(' + ');

      return normalized.length > 1 ? `R${rowIndex + 1}: ${rowLabel}` : rowLabel;
    })
    .join(separator);
}

export function getHeights(sheetName) {
  const data = pricingData[normalizeSheetName(sheetName)];
  return data ? data.heights : [];
}

export function getWidths(sheetName, height) {
  const data = pricingData[normalizeSheetName(sheetName)];
  if (!data) return [];

  const available = data.prices
    .filter((entry) => entry.h === height)
    .map((entry) => entry.l);

  return [...new Set(available)].sort((left, right) => left - right);
}

export function getPriceForMm(sheetName, heightMm, widthMm) {
  const data = pricingData[normalizeSheetName(sheetName)];
  if (!data) return null;

  const heightCm = heightMm / 10;
  const widthCm = widthMm / 10;

  const availableHeights = data.heights.filter((height) => height >= heightCm);
  if (availableHeights.length === 0) return null;
  const billedHeight = Math.min(...availableHeights);

  const widthsForHeight = data.prices
    .filter((entry) => entry.h === billedHeight)
    .map((entry) => entry.l);
  const availableWidths = widthsForHeight.filter((width) => width >= widthCm);
  if (availableWidths.length === 0) return null;
  const billedWidth = Math.min(...availableWidths);

  const entry = data.prices.find(
    (candidate) => candidate.h === billedHeight && candidate.l === billedWidth
  );

  if (!entry) return null;

  return {
    price: entry.prix,
    billedHeight,
    billedWidth,
  };
}

export function calculateSurface(widthMm, heightMm, quantity = 1) {
  return (widthMm / 1000) * (heightMm / 1000) * quantity;
}

export function getProductType(sheetName) {
  const resolvedSheetName = normalizeSheetName(sheetName);
  if (!resolvedSheetName) return 'menuiserie';
  if (resolvedSheetName.startsWith('Volet')) return 'volet';
  if (resolvedSheetName.startsWith('Porte Entr')) return 'porte';
  return 'menuiserie';
}

export const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function calculateItemPrice(item) {
  const compositePricing = item.isComposite
    ? getCompositePricing(item.composition, item.modules)
    : null;

  let basePrice = compositePricing?.totalPrice ?? item.unitPrice ?? 0;
  let optionsPrice = 0;

  if (!item.isComposite) {
    if (item.colorOption && item.colorOption.surcharge > 0) {
      basePrice = basePrice * (1 + item.colorOption.surcharge);
    }

    const hasGlazingContext =
      item.glazingOption && item.sheetName && item.widthMm && item.heightMm;
    const frameSystem = hasGlazingContext
      ? getFrameSystemForProduct(normalizeSheetName(item.sheetName))
      : null;
    const glassAreas =
      hasGlazingContext && frameSystem
        ? calculateGlassAreas(
            Number(item.widthMm),
            Number(item.heightMm),
            frameSystem.frameWidthMm
          )
        : null;
    const fillingPricing =
      hasGlazingContext && glassAreas
        ? calculateGlazingAndPanelExtras({
            selectedGlazing: item.glazingOption,
            glassAreas,
            widthMm: Number(item.widthMm),
            hasSousBassement: Boolean(item.hasSousBassement),
            sousBassementHeightMm: Number(item.sousBassementHeight || 0),
            colorOptionId: item.colorOption?.id || 'blanc',
          })
        : {
            totalExtra: Number(item.glazingExtra || 0),
          };

    if (item.productId === 'volet-radio') {
      optionsPrice += 50 * 1.25;
    } else if (item.productId === 'volet-solaire') {
      optionsPrice += 240 * 1.25;
    }

    const { petitsBoisH, petitsBoisV } = resolvePetitsBoisConfig(item);
    const petitsBoisPrice = calculatePetitsBoisPrice({
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      petitsBoisH,
      petitsBoisV,
    });

    if (petitsBoisPrice > 0) {
      optionsPrice += petitsBoisPrice;
    }

    if (item.panneauDecoratif) {
      optionsPrice += 850 * 1.25;
    }

    Object.values(item.sashOptions || {}).forEach((sash) => {
      if (sash?.ob) optionsPrice += OB_PRICE * 1.25;
      if (sash?.vent) optionsPrice += GRILLE_PRICE * 1.25;
    });

    if (item.hasLockingHandle) {
      optionsPrice += 18.75;
    }

    if (fillingPricing.totalExtra > 0) {
      optionsPrice += fillingPricing.totalExtra;
    }
  }

  const grossMarginToAdd = calculateGrossAmountToAddForNetMargin(
    item.netMarginWanted,
    item.remise
  );
  const totalPriceBeforeDiscount = basePrice + optionsPrice + grossMarginToAdd;
  const priceAfterDiscount =
    item.remise && item.remise > 0
      ? totalPriceBeforeDiscount * (1 - item.remise / 100)
      : totalPriceBeforeDiscount;

  if (item.productId === 'gestion-dechets') {
    const weight = item.totalWeight || 0;
    const price = item.totalWastePrice || 0;
    return {
      unitPriceBase: price,
      unitPriceWithOptions: price,
      unitPriceAfterDiscount: price,
      posePrice: 0,
      totalLine: price,
      weight,
    };
  }

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

  const productType = item.isComposite ? 'menuiserie' : getProductType(item.sheetName);
  const posePrice = item.includePose ? POSE_PRICES[productType] : 0;

  return {
    unitPriceBase: roundCurrency(basePrice),
    unitPriceWithOptions: roundCurrency(totalPriceBeforeDiscount),
    unitPriceAfterDiscount: roundCurrency(priceAfterDiscount),
    posePrice,
    totalLine: roundCurrency(priceAfterDiscount * (item.quantity || 1)),
  };
}

export const getItemPricingSummary = (item, calc) => {
  const quantity = Number(item.quantity || 0);
  const discountPerUnit =
    item.remise && item.remise > 0
      ? roundCurrency(calc.unitPriceWithOptions * (item.remise / 100))
      : 0;
  const originalUnitHT = roundCurrency(calc.unitPriceAfterDiscount + discountPerUnit);
  const originalLineHT = roundCurrency(originalUnitHT * quantity);
  const discountLineHT = roundCurrency(originalLineHT - calc.totalLine);

  return {
    discountPerUnit,
    originalUnitHT,
    originalLineHT,
    discountLineHT,
    hasDiscount: discountLineHT > 0,
  };
};
