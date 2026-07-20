import pricingData from '@/data/pricing.json';
import { applyProductCoefficient } from '@/lib/catalogue-coefficients';
import { getCataloguePricing } from '@/lib/catalogue-pricing';
import {
  makeLeaf,
  makeSplit,
  isLeaf,
  isSplit,
  isTreeNode,
  collectLeaves,
  mapTree,
  computeCompositeLayout,
  collapseSingleChild,
  rowsToTree,
  treeToRows,
} from '@/lib/composite-layout';
import {
  solveFrame,
  computeOpenings as computeFrameOpenings,
  normalizeCompositeFrame,
} from '@/lib/composite-frame';
import {
  calculateEffectiveThermalAreas,
  calculateGlassAreas,
  calculateGlazingAndPanelExtras,
  calculateSw,
  calculateUw,
  getFrameSystemForProduct,
  getSelectedGlazing,
  getDefaultGlazingId,
  isGlazedProduct,
} from '@/lib/glazing';
import {
  calculateGrossAmountToAddForNetMargin,
  calculateGrossAmountToSubtractForNetDiscount,
} from '@/lib/pricing-margin.mjs';
import { normalizeHandleHeightMm } from '@/lib/handle-height';

const VOLET_BOX_DOMOTIQUE_VARIANTS = Object.freeze([
  {
    id: 'box_domotique_gaposa_rollappx',
    label: 'Box domotique GAPOSA RollAppX',
    optionLabel: 'GAPOSA RollAppX - 179,00 EUR HT',
    useCase: 'Volets roulants solaires GAPOSA',
    designation:
      'Box domotique GAPOSA RollAppX\n' +
      "Pilotage connect\u00e9 jusqu'\u00e0 32 volets/stores GAPOSA compatibles via application RollApp, avec gestion par pi\u00e8ces, groupes, sc\u00e9narios et horaires. Compatible Alexa et Google Assistant.",
    priceHt: 179,
    imageSrc: '/products/volets/box-domotique-gaposa-rollappx.webp',
  },
  {
    id: 'box_domotique_cherubini_metahome',
    label: 'Box domotique CHERUBINI METAHome',
    optionLabel: 'CHERUBINI METAHome - 258,00 EUR HT',
    useCase: 'Volets roulants radio CHERUBINI',
    designation:
      'Box domotique CHERUBINI METAHome\n' +
      'Pilotage connect\u00e9 des volets, stores et \u00e9quipements compatibles via application METAHome, avec sc\u00e9narios, commandes centralis\u00e9es et compatibilit\u00e9 Google Home / Alexa.',
    priceHt: 258,
    imageSrc: '/products/volets/box-domotique-cherubini-metahome.webp',
  },
]);

export const TECHNICAL_MEASUREMENT_SERVICE_TITLE =
  'Métrage technique de validation –OFFERT';
export const TECHNICAL_MEASUREMENT_SERVICE_DESCRIPTION =
  'Relevé précis des dimensions sur chantier, contrôle des supports existants et validation technique avant mise en fabrication. Prestation offerte dès signature du devis.';
// Variante FACTURÉE du métrage : mêmes prestations, sans la mention « offert ».
export const TECHNICAL_MEASUREMENT_SERVICE_TITLE_PAID =
  'Métrage technique de validation';
export const TECHNICAL_MEASUREMENT_SERVICE_DESCRIPTION_PAID =
  'Relevé précis des dimensions sur chantier, contrôle des supports existants et validation technique avant mise en fabrication.';

/**
 * Product categories with metadata for UI display.
 * The composite builder is now a global mode, not a catalog category.
 */
export const CATEGORIES = [
  {
    id: 'fenetres',
    label: 'Fenêtres',
    icon: 'LayoutGrid',
    products: [
      { id: 'fenetre-1v', sheet: 'Fenêtre 1V', label: 'Fenêtre 1 vantail', shortLabel: '1V' },
      { id: 'fenetre-2v', sheet: 'Fenêtre 2V', label: 'Fenêtre 2 vantaux', shortLabel: '2V' },
      { id: 'fenetre-3v', sheet: 'Fenêtre 3V', label: 'Fenêtre 3 vantaux', shortLabel: '3V' },
      { id: 'fenetre-4v', sheet: 'Fenêtre 4V', label: 'Fenêtre 4 vantaux', shortLabel: '4V' },
      { id: 'fenetre-2v1f', sheet: 'Fenêtre 2V+1F', label: 'Fenêtre 2V + 1 fixe', shortLabel: '2V+1F' },
      { id: 'fenetre-2v2f', sheet: 'Fenêtre 2V+2F', label: 'Fenêtre 2V + 2 fixes', shortLabel: '2V+2F' },
      { id: 'fenetre-fixe', sheet: 'Fenêtre Fixe', label: 'Fenêtre fixe', shortLabel: 'Fixe' },
      { id: 'fenetre-soufflet', sheet: 'Fenêtre Soufflet', label: 'Fenêtre soufflet', shortLabel: 'Soufflet' },
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
    label: 'Portes-Fenêtres',
    icon: 'DoorOpen',
    products: [
      { id: 'pf-1v', sheet: 'Porte-Fenêtre 1V', label: 'Porte-fenêtre 1 vantail', shortLabel: '1V' },
      { id: 'pf-2v', sheet: 'Porte-Fenêtre 2V', label: 'Porte-fenêtre 2 vantaux', shortLabel: '2V' },
      // La PF 3V n'a pas de grille fournisseur : tarif = 2V+1F +7 %. Elle suit
      // donc le coefficient de hausse tarifaire de la 2V+1F (coefficientSource)
      // pour que l'écart de 7 % soit préservé après réévaluation des tarifs.
      { id: 'pf-3v', sheet: 'Porte-Fenêtre 3V', label: 'Porte-fenêtre 3 vantaux', shortLabel: '3V', coefficientSource: 'pf-2v1f' },
      { id: 'pf-2v1f', sheet: 'Porte-Fenêtre 2V+1F', label: 'Porte-fenêtre 2V + 1 fixe', shortLabel: '2V+1F' },
      { id: 'pf-2v2f', sheet: 'Porte-Fenêtre 2V+2F', label: 'Porte-fenêtre 2V + 2 fixes', shortLabel: '2V+2F' },
    ],
  },
  {
    id: 'portes',
    label: "Portes d'entrée",
    icon: 'DoorClosed',
    products: [
      { id: 'porte-reno', sheet: 'Porte Entrée RENO', label: "Porte d'entrée rénovation", shortLabel: 'Reno' },
      { id: 'porte-neuf', sheet: 'Porte Entrée NEUF', label: "Porte d'entrée neuf", shortLabel: 'Neuf' },
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
      {
        id: 'volet-box-domotique',
        sheet: 'Volet Box domotique',
        label: 'Box domotique',
        shortLabel: 'Box domotique',
        pricingMode: 'fixed',
        requiresDimensions: false,
        supportsPose: false,
        supportsThermalData: false,
        previewImageSrc: '/products/volets/box-domotique-gaposa-rollappx.webp',
        defaultVariantId: 'box_domotique_gaposa_rollappx',
        variants: VOLET_BOX_DOMOTIQUE_VARIANTS,
      },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: 'Wrench',
    products: [
      { id: 'gestion-dechets', sheet: 'Gestion Déchets', label: 'Gestion des déchets', shortLabel: 'Déchets' },
      {
        id: 'metrage-technique-validation',
        sheet: 'Métrage Technique',
        label: 'Métrage technique de validation – OFFERT à la signature du devis',
        shortLabel: 'Métrage offert',
        pricingMode: 'service',
        servicePriceHt: 0,
        // Par défaut offert ; le configurateur permet de le facturer (prix libre).
        serviceBillingDefault: 'free',
        requiresDimensions: false,
        supportsPose: false,
        supportsThermalData: false,
        previewImageSrc: '/products/services/metrage-technique.png',
        designationTitle: TECHNICAL_MEASUREMENT_SERVICE_TITLE,
        designation: TECHNICAL_MEASUREMENT_SERVICE_DESCRIPTION,
        // Libellés utilisés quand le service est FACTURÉ.
        paidLabel: TECHNICAL_MEASUREMENT_SERVICE_TITLE_PAID,
        paidDesignationTitle: TECHNICAL_MEASUREMENT_SERVICE_TITLE_PAID,
        paidDesignation: TECHNICAL_MEASUREMENT_SERVICE_DESCRIPTION_PAID,
      },
      {
        id: 'forfait-deplacement',
        sheet: 'Forfait Déplacement',
        label: 'Forfait de déplacement pour intervention et pose sur site',
        shortLabel: 'Forfait déplacement',
        pricingMode: 'service',
        servicePriceHt: 0,
        // Ce forfait est facturé : le prix se saisit dans le configurateur.
        serviceBillingDefault: 'paid',
        requiresDimensions: false,
        supportsPose: false,
        supportsThermalData: false,
        previewImageSrc: '/products/services/forfait-deplacement.png',
        designationTitle: 'Forfait de déplacement pour intervention et pose sur site',
        designation:
          "Comprend le déplacement de l'équipe technique et l'acheminement du matériel nécessaire à la réalisation de la pose.",
      },
    ],
  },
  {
    id: 'custom',
    label: 'Hors catalogue',
    icon: 'PackagePlus',
    products: [
      { id: 'custom-product', sheet: 'Custom', label: 'Produit/Service', shortLabel: 'Produit/Service' },
      {
        // Configurateur Velux : génère la référence commerciale exacte puis
        // bascule sur le formulaire « Produit/Service » pré-rempli où le prix
        // HT est saisi manuellement. Jamais ajouté au panier sous cet id.
        id: 'velux-configurateur',
        sheet: 'Velux',
        label: 'Fenêtre de toit Velux',
        shortLabel: 'Velux',
        requiresDimensions: false,
        supportsPose: false,
        supportsThermalData: false,
        previewImageSrc: '/fenetre-de-toit-velux-rotation-v2.webp',
      },
      {
        id: 'remise-commerciale',
        sheet: 'Remise commerciale',
        label: 'Remise commerciale supplémentaire',
        shortLabel: 'Remise commerciale',
        requiresDimensions: false,
        supportsPose: false,
        supportsThermalData: false,
      },
      { id: 'text-only', sheet: 'Texte seul', label: 'Texte seul', shortLabel: 'Texte seul' },
    ],
  },
];

// Description par défaut de la ligne « Remise commerciale supplémentaire ».
export const COMMERCIAL_DISCOUNT_PRODUCT_ID = 'remise-commerciale';
export const COMMERCIAL_DISCOUNT_DEFAULT_DESCRIPTION =
  'Remise exceptionnelle déduite du total HT du devis.';

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
export const LOCKING_HANDLE_PRICE = 18.75;
export const PANNEAU_DECORATIF_PRICE = 901;
export const PANNEAU_DECORATIF_MULTIPLIER = 1.25;

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
  const { petitsBoisPricePerMl = PETITS_BOIS_PRICE } = getCataloguePricing();
  const widthMeters = Math.max(0, Number(widthMm) || 0) / 1000;
  const heightMeters = Math.max(0, Number(heightMm) || 0) / 1000;
  const mlTotal =
    parsePetitsBoisValue(petitsBoisH) * widthMeters +
    parsePetitsBoisValue(petitsBoisV) * heightMeters;

  return roundCurrency(mlTotal * (Number(petitsBoisPricePerMl) || PETITS_BOIS_PRICE));
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
  'pf-3v': 'Porte-Fen\u00eatre 3V',
  'pf-2v1f': 'Porte-Fen\u00eatre 2V+1F',
  'pf-2v2f': 'Porte-Fen\u00eatre 2V+2F',
  'coulissant-2v2r': 'Coulissant 2 vantaux 2 rails',
  'porte-reno': 'Porte Entr\u00e9e RENO',
  'porte-neuf': 'Porte Entr\u00e9e NEUF',
  'volet-filaire': 'Volet Filaire',
  'volet-radio': 'Volet Filaire',
  'volet-solaire': 'Volet Filaire',
  'volet-manuel': 'Volet Filaire',
  'volet-box-domotique': 'Volet Box domotique',
  'gestion-dechets': 'Gestion D\u00e9chets',
  'metrage-technique-validation': 'Métrage Technique',
  'custom-product': 'Custom',
  'text-only': 'Texte seul',
};

// ─── Déclinaison aluminium ────────────────────────────────────────────────
// On reproduit à l'identique les menuiseries PVC en version aluminium (gammes
// Schüco AWS 60 / ASS 41 SC). Les feuilles tarifaires ALU sont générées à 0 €
// en attendant les prix réels ; le tarif pourra être ajusté via la marge.
const ALU_MATERIAL_CATEGORY_IDS = new Set([
  'fenetres',
  'portes-fenetres',
  'coulissants',
  'portes',
]);
const ALU_ID_SUFFIX = '-alu';
const ALU_SHEET_SUFFIX = ' ALU';

const buildAluTwin = (product) => ({
  ...product,
  id: `${product.id}${ALU_ID_SUFFIX}`,
  sheet: `${product.sheet}${ALU_SHEET_SUFFIX}`,
  material: 'alu',
  aluOf: product.id,
  // Un produit lié à un coefficient de référence suit le jumeau alu de cette
  // référence (ex. pf-3v-alu suit pf-2v1f-alu).
  ...(product.coefficientSource
    ? { coefficientSource: `${product.coefficientSource}${ALU_ID_SUFFIX}` }
    : {}),
});

CATEGORIES.forEach((category) => {
  if (!ALU_MATERIAL_CATEGORY_IDS.has(category.id)) return;
  const pvcProducts = category.products;
  pvcProducts.forEach((product) => {
    product.material = 'pvc';
  });
  const aluProducts = pvcProducts.map(buildAluTwin);
  aluProducts.forEach((product) => {
    CANONICAL_SHEET_BY_PRODUCT_ID[product.id] = product.sheet;
  });
  category.products = [...pvcProducts, ...aluProducts];
});

// Produits coulissants/galandage proposés uniquement en aluminium (gamme Schüco
// ASS 41 SC). Pas de jumeau PVC. Grille tarifaire empruntée au coulissant PVC
// (mêmes dimensions) mais à 0 € en attendant les prix réels. Exclus du
// configurateur composé (compositeEligible: false).
const COULISSANT_PRICING_SOURCE_SHEET = 'Coulissant 2 vantaux 2 rails';
const ALU_ONLY_PRODUCTS = {
  coulissants: [
    {
      id: 'coulissant-3v-alu',
      sheet: 'Coulissant 3 vantaux ALU',
      label: 'Coulissant 3 vantaux',
      shortLabel: 'Coulissant 3V',
    },
    {
      id: 'coulissant-4v-alu',
      sheet: 'Coulissant 4 vantaux ALU',
      label: 'Coulissant 4 vantaux',
      shortLabel: 'Coulissant 4V',
    },
    {
      id: 'galandage-1v-alu',
      sheet: 'Galandage 1 vantail ALU',
      label: 'Coulissant à galandage 1 vantail',
      shortLabel: 'Galandage 1V',
    },
    {
      id: 'galandage-2v-alu',
      sheet: 'Galandage 2 vantaux ALU',
      label: 'Coulissant à galandage 2 vantaux',
      shortLabel: 'Galandage 2V',
    },
    {
      id: 'galandage-3v-alu',
      sheet: 'Galandage 3 vantaux ALU',
      label: 'Coulissant à galandage 3 vantaux',
      shortLabel: 'Galandage 3V',
    },
    {
      id: 'galandage-4v-alu',
      sheet: 'Galandage 4 vantaux ALU',
      label: 'Coulissant à galandage 4 vantaux',
      shortLabel: 'Galandage 4V',
    },
  ],
};

Object.entries(ALU_ONLY_PRODUCTS).forEach(([categoryId, products]) => {
  const category = CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) return;
  const enriched = products.map((product) => ({
    material: 'alu',
    compositeEligible: false,
    pricingSource: COULISSANT_PRICING_SOURCE_SHEET,
    ...product,
  }));
  enriched.forEach((product) => {
    CANONICAL_SHEET_BY_PRODUCT_ID[product.id] = product.sheet;
  });
  category.products = [...category.products, ...enriched];
});

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

// Coefficient de hausse tarifaire : un produit peut suivre le coefficient d'un
// produit de référence via coefficientSource (ex. PF 3V alignée sur la 2V+1F).
const resolveCoefficientProductId = (productId) =>
  PRODUCT_BY_ID.get(productId)?.coefficientSource || productId;

// Grilles tarifaires effectives : PVC (data/pricing.json) + feuilles ALU
// générées à partir des grilles PVC mais à 0 € (en attente des tarifs alu).
// La grille dimensionnelle est conservée pour l'arrondi des dimensions.
const PRICING = { ...pricingData };

// Porte-fenêtre 3 vantaux : pas de grille fournisseur dédiée. Tarif dérivé de
// la Porte-Fenêtre 2V+1F (mêmes dimensions) majorée de 7 %.
const PF_3V_SHEET = 'Porte-Fenêtre 3V';
const PF_3V_SOURCE_SHEET = 'Porte-Fenêtre 2V+1F';
const PF_3V_SURCHARGE = 1.07;
if (!PRICING[PF_3V_SHEET] && pricingData[PF_3V_SOURCE_SHEET]) {
  const pf3vSource = pricingData[PF_3V_SOURCE_SHEET];
  PRICING[PF_3V_SHEET] = {
    ...pf3vSource,
    prices: pf3vSource.prices.map((entry) => ({
      ...entry,
      prix: Math.round(entry.prix * PF_3V_SURCHARGE),
    })),
  };
}

CATEGORIES.forEach((category) => {
  category.products.forEach((product) => {
    if (product.material !== 'alu') return;
    const aluSheet = CANONICAL_SHEET_BY_PRODUCT_ID[product.id] || product.sheet;
    if (PRICING[aluSheet]) return;
    // Jumeau alu : grille du produit PVC d'origine (y compris grilles dérivées
    // comme la PF 3V). Produit alu-only : grille empruntée à une feuille PVC de
    // référence (pricingSource).
    const sourceSheet = product.aluOf
      ? CANONICAL_SHEET_BY_PRODUCT_ID[product.aluOf]
      : product.pricingSource;
    const source = sourceSheet ? PRICING[sourceSheet] : null;
    if (!source) return;
    PRICING[aluSheet] = {
      heights: source.heights,
      prices: source.prices.map((entry) => ({ ...entry, prix: 0 })),
    };
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
  'pf-3v': { widthMm: 1900, heightMm: 2150 },
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

const getDefaultDimensionsForProduct = (productId) => {
  // Les jumeaux aluminium partagent les dimensions par défaut du produit PVC.
  const baseId = (productId || '').replace(/-alu$/, '');
  return (
    DEFAULT_MODULE_DIMENSIONS[baseId] || { widthMm: 800, heightMm: 1250 }
  );
};

/**
 * Renvoie l'identifiant produit dans le matériau demandé (PVC ou aluminium).
 * Retombe sur le PVC si le jumeau aluminium n'existe pas.
 */
export function getMaterialVariantId(productId, material) {
  const baseId = (productId || '').replace(/-alu$/, '');
  if (material === 'alu') {
    const aluId = `${baseId}-alu`;
    return PRODUCT_BY_ID.has(aluId) ? aluId : baseId;
  }
  return baseId;
}

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
  glazingId:
    options.glazingId ||
    legacySource.glazingId ||
    legacySource.glazingOption?.id ||
    getDefaultGlazingId((productId || '').endsWith('-alu') ? 'alu' : 'pvc'),
  hasLockingHandle: Boolean(options.hasLockingHandle ?? legacySource.hasLockingHandle),
  handleHeightMm: normalizeHandleHeightMm(options.handleHeightMm ?? legacySource.handleHeightMm),
  allegeHeightMm: normalizeHandleHeightMm(options.allegeHeightMm ?? legacySource.allegeHeightMm),
  productId,
});

const createModuleId = (seed) => `module-${seed}`;
const createRowId = (seed) => `row-${seed}`;

export const COMPOSITE_MODULE_TYPES = BUILDER_CATEGORY_IDS.map((categoryId) => {
  const category = CATEGORIES.find((entry) => entry.id === categoryId);

  return {
    ...category,
    // PVC et aluminium : le configurateur composé filtre par matériau côté UI.
    // Les coulissants 3V/4V et galandages restent hors composé.
    products: category.products
      .filter((product) => product.compositeEligible !== false)
      .map((product) => ({
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

export const buildCatalogServiceDescription = (product, { paid = false } = {}) => {
  const title = paid
    ? product?.paidDesignationTitle || product?.designationTitle
    : product?.designationTitle;
  const designation = paid
    ? product?.paidDesignation || product?.designation
    : product?.designation;
  return [title, designation].filter(Boolean).join('\n');
};

export function createCatalogServiceCartItem(productId, { id, priceHt } = {}) {
  const product = getProductById(productId);
  if (!product || product.pricingMode !== 'service') {
    return null;
  }

  // Prix HT du service : 0 = offert (comportement historique), sinon facturé
  // au montant saisi (arrondi au centime pour rester comptabilisable).
  const price = roundCurrency(Math.max(0, Number(priceHt) || 0));
  const isPaid = price > 0;

  return {
    ...(id ? { id } : {}),
    productId: product.id,
    productLabel: isPaid ? product.paidLabel || product.label : product.label,
    sheetName: product.sheet,
    widthMm: 0,
    heightMm: 0,
    billedHeightCm: null,
    billedWidthCm: null,
    quantity: 1,
    unitPrice: isPaid ? price : Number(product.servicePriceHt || 0),
    includePose: false,
    remise: 0,
    netAdjustmentMode: 'margin',
    netMarginWanted: 0,
    netDiscountWanted: 0,
    customDescription: buildCatalogServiceDescription(product, { paid: isPaid }),
    customDescriptionManual: false,
    customImage: product.previewImageSrc || null,
    hasDimensions: false,
    dimensionLabel: isPaid ? 'Service' : 'Service offert',
    showThermalData: false,
  };
}

export function getProductVariants(productOrId) {
  const product =
    typeof productOrId === 'string' ? getProductById(productOrId) : productOrId;
  return Array.isArray(product?.variants) ? product.variants : [];
}

export function getDefaultProductVariant(productOrId) {
  const product =
    typeof productOrId === 'string' ? getProductById(productOrId) : productOrId;
  const variants = getProductVariants(product);
  if (variants.length === 0) return null;
  return (
    variants.find((variant) => variant.id === product?.defaultVariantId) || variants[0]
  );
}

export function getProductVariant(productOrId, variantId) {
  const product =
    typeof productOrId === 'string' ? getProductById(productOrId) : productOrId;
  const variants = getProductVariants(product);
  if (variants.length === 0) return null;
  return variants.find((variant) => variant.id === variantId) || getDefaultProductVariant(product);
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
  const leafModule = createCompositeModule('1-1');
  return makeLeaf(leafModule.id, leafModule);
}

// Normalise n'importe quelle entrée (arbre, anciennes rangées, modules à plat)
// vers un ARBRE de divisions normalisé. C'est le point de MIGRATION ascendante :
// les anciens devis (rangées / modules plats) sont convertis à la lecture, sans
// jamais réécrire les données persistées.
export function normalizeCompositeComposition(composition = [], legacyModules = null) {
  const normalizeLeaf = (leaf) => {
    const leafModule = createCompositeModule(leaf.id, leaf.module || {});
    return makeLeaf(leafModule.id, leafModule);
  };
  const wrapFlat = (modules) =>
    makeSplit(
      'h-1',
      'h',
      modules.map((module, i) => makeLeaf(module?.id || `leaf-1-${i + 1}`, module || {}))
    );

  // 1) Déjà un arbre
  if (isTreeNode(composition)) {
    return collapseSingleChild(mapTree(composition, normalizeLeaf));
  }
  // 2) Anciennes rangées : [{ id, modules:[…] } …]
  if (Array.isArray(composition) && composition.some((row) => Array.isArray(row?.modules))) {
    return collapseSingleChild(mapTree(rowsToTree(composition), normalizeLeaf));
  }
  // 3) Modules à plat passés en 1er argument (très ancien format)
  if (
    Array.isArray(composition) &&
    composition.length &&
    composition.some((m) => m && (m.productId || m.sheetName || m.type || m.widthMm || m.largeur))
  ) {
    return collapseSingleChild(mapTree(wrapFlat(composition), normalizeLeaf));
  }
  // 4) Modules à plat via legacyModules
  if (Array.isArray(legacyModules) && legacyModules.length) {
    return collapseSingleChild(mapTree(wrapFlat(legacyModules), normalizeLeaf));
  }
  // 5) Défaut : une feuille
  return createCompositeComposition();
}

export function flattenCompositeModules(composition = [], legacyModules = null) {
  const tree = normalizeCompositeComposition(composition, legacyModules);
  return collectLeaves(tree).map((leaf) => ({ ...leaf.module, leafId: leaf.id }));
}

const getColorOptionsForProduct = (product) =>
  product?.sheet?.startsWith('Volet') ? VOLET_COLOR_OPTIONS : COLOR_OPTIONS;

const buildModulePricingData = (module) => {
  const pricing = getCataloguePricing();
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
  const thermalAreas =
    glassAreas && selectedGlazing?.isThermalDataAvailable !== false
      ? calculateEffectiveThermalAreas({
          glassAreas,
          hasSousBassement: options.hasSousBassement,
          sousBassementHeightMm: options.sousBassementHeight,
        })
      : null;
  const canComputeThermal =
    thermalAreas &&
    frameSystem &&
    selectedGlazing &&
    selectedGlazing.isThermalDataAvailable !== false;
  const thermalUw =
    canComputeThermal
      ? calculateUw({
          Ag: thermalAreas.Ag,
          Af: thermalAreas.Af,
          Aw: thermalAreas.Aw,
          Lg: thermalAreas.Lg,
          Ug: selectedGlazing.ug,
          Uf: frameSystem.uf,
        })
      : null;
  const thermalSw =
    canComputeThermal
      ? calculateSw({ Ag: thermalAreas.Ag, Aw: thermalAreas.Aw, g: selectedGlazing.g })
      : null;
  const priceData = getPriceForMm(product.sheet, heightMm, widthMm);

  let modulePrice = priceData?.price ?? null;

  if (modulePrice !== null) {
    modulePrice = applyProductCoefficient(
      modulePrice,
      resolveCoefficientProductId(product.id)
    );
  }

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
    const basePrice = Number(pricing.panneauDecoratifPrice) || PANNEAU_DECORATIF_PRICE;
    const multiplier =
      Number(pricing.panneauDecoratifMultiplier) || PANNEAU_DECORATIF_MULTIPLIER;
    optionsPrice += basePrice * multiplier;
  }

  Object.values(options.sashOptions).forEach((sash) => {
    const obPrice = Number(pricing.obPrice) || OB_PRICE;
    const grillePrice = Number(pricing.grillePrice) || GRILLE_PRICE;
    if (sash?.ob) optionsPrice += obPrice * 1.25;
    if (sash?.vent) optionsPrice += grillePrice * 1.25;
  });

  if (options.hasLockingHandle) {
    optionsPrice += Number(pricing.lockingHandlePrice) || LOCKING_HANDLE_PRICE;
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

const calculateSimpleItemThermalMetrics = (item) => {
  const hasGlazingContext =
    item?.glazingOption && item?.sheetName && item?.widthMm && item?.heightMm;
  if (!hasGlazingContext) {
    return null;
  }

  const frameSystem = getFrameSystemForProduct(normalizeSheetName(item.sheetName));
  const glassAreas = calculateGlassAreas(
    Number(item.widthMm),
    Number(item.heightMm),
    frameSystem.frameWidthMm
  );
  const thermalAreas =
    glassAreas && item.glazingOption?.isThermalDataAvailable !== false
      ? calculateEffectiveThermalAreas({
          glassAreas,
          hasSousBassement: Boolean(item.hasSousBassement),
          sousBassementHeightMm: Number(item.sousBassementHeight || 0),
        })
      : null;

  if (!thermalAreas || item.glazingOption?.isThermalDataAvailable === false) {
    return null;
  }

  const thermalUw = calculateUw({
    Ag: thermalAreas.Ag,
    Af: thermalAreas.Af,
    Aw: thermalAreas.Aw,
    Lg: thermalAreas.Lg,
    Ug: item.glazingOption?.ug,
    Uf: frameSystem.uf,
  });
  const thermalSw = calculateSw({
    Ag: thermalAreas.Ag,
    Aw: thermalAreas.Aw,
    g: item.glazingOption?.g,
  });

  if (thermalUw === null || thermalSw === null) {
    return null;
  }

  return {
    thermalUw,
    thermalSw,
  };
};

export function getCompositeThermalMetrics(composition = [], legacyModules = null) {
  const compositePricing = getCompositePricing(composition, legacyModules);
  const eligibleModules = compositePricing.modulePricing.filter(
    (module) =>
      Number.isFinite(module.thermalUw) &&
      Number.isFinite(module.thermalSw) &&
      Number(module.widthMm) > 0 &&
      Number(module.heightMm) > 0
  );

  if (eligibleModules.length === 0) {
    return null;
  }

  const totalWeightedArea = eligibleModules.reduce(
    (sum, module) => sum + calculateSurface(module.widthMm, module.heightMm, 1),
    0
  );

  if (!Number.isFinite(totalWeightedArea) || totalWeightedArea <= 0) {
    return null;
  }

  const thermalUw = roundCurrency(
    eligibleModules.reduce(
      (sum, module) =>
        sum + module.thermalUw * calculateSurface(module.widthMm, module.heightMm, 1),
      0
    ) / totalWeightedArea
  );
  const thermalSw = roundCurrency(
    eligibleModules.reduce(
      (sum, module) =>
        sum + module.thermalSw * calculateSurface(module.widthMm, module.heightMm, 1),
      0
    ) / totalWeightedArea
  );

  return {
    thermalUw,
    thermalSw,
  };
}

export function getItemThermalMetrics(item) {
  if (!item) {
    return null;
  }

  if (item.isComposite) {
    return getCompositeThermalMetrics(item.composition, item.modules);
  }

  return calculateSimpleItemThermalMetrics(item);
}

export function getCompositeDimensions(composition = [], legacyModules = null) {
  const tree = normalizeCompositeComposition(composition, legacyModules);
  const layout = computeCompositeLayout(tree);
  return { width: layout.widthMm, height: layout.heightMm, tree, leaves: layout.leaves };
}

export function getCompositeTotalWidth(composition = [], legacyModules = null) {
  return getCompositeDimensions(composition, legacyModules).width;
}

export function getCompositeModuleCount(composition = [], legacyModules = null) {
  return collectLeaves(normalizeCompositeComposition(composition, legacyModules)).length;
}

export function getCompositePricing(composition = [], legacyModules = null) {
  const tree = normalizeCompositeComposition(composition, legacyModules);
  // Le prix est calculé PAR FEUILLE (logique module inchangée) ; le total reste
  // la somme des prix module -> parité garantie avec l'ancien modèle.
  const pricedTree = mapTree(tree, (leaf) =>
    makeLeaf(leaf.id, buildModulePricingData(leaf.module))
  );
  const layout = computeCompositeLayout(pricedTree);

  const modulePricing = layout.leaves.map((leaf) => ({
    ...leaf.module,
    leafId: leaf.id,
    xMm: leaf.xMm,
    yMm: leaf.yMm,
  }));

  const hasInvalidModule =
    modulePricing.length === 0 ||
    modulePricing.some(
      (module) =>
        parsePositiveNumber(module.widthMm) <= 0 ||
        parsePositiveNumber(module.heightMm) <= 0 ||
        module.unitPrice === null
    );

  return {
    compositionTree: pricedTree,
    // Rangées « héritées » dérivées (filet de sécurité pour lecteurs non migrés).
    composition: treeToRows(pricedTree),
    modulePricing,
    leaves: layout.leaves,
    totalWidth: layout.widthMm,
    totalHeight: layout.heightMm,
    totalPrice: hasInvalidModule
      ? null
      : roundCurrency(modulePricing.reduce((total, module) => total + module.unitPrice, 0)),
    hasInvalidModule,
  };
}

// ===================================================================
// Modèle « ossature » (v2) : prix = somme des châssis placés dans les
// ouvertures (chaque châssis chiffré aux dimensions de son ouverture).
// ===================================================================
export function getCompositeFrameModules(frame) {
  const solved = solveFrame(frame);
  if (!solved.ok) return [];
  const { openings } = computeFrameOpenings(frame, solved);
  const byId = new Map(openings.map((opening) => [opening.id, opening]));
  return Object.values(frame.placements || {})
    .filter((placement) => placement.productId && byId.has(placement.openingId))
    .map((placement) => {
      const opening = byId.get(placement.openingId);
      return createCompositeModule(placement.id, {
        id: placement.id,
        productId: placement.productId,
        widthMm: opening.wMm,
        heightMm: opening.hMm,
        options: placement.options,
      });
    });
}

export function getCompositeFramePricing(frame) {
  const solved = solveFrame(frame);
  const modules = getCompositeFrameModules(frame).map((module) => buildModulePricingData(module));
  // Un composé VIDE (aucun châssis placé) est INCOMPLET, pas « hors grille ».
  // `hasInvalidModule` = géométrie irrésoluble OU un châssis placé hors grille.
  const isEmpty = modules.length === 0;
  const hasOutOfGrid = modules.some((module) => module.unitPrice === null);
  const hasInvalidModule = !solved.ok || hasOutOfGrid;
  const openings = solved.ok ? computeFrameOpenings(frame, solved).openings : [];
  return {
    modules,
    openings,
    totalWidth: Math.round(Number(frame.overallWidthMm) || 0),
    totalHeight: Math.round(Number(frame.overallHeightMm) || 0),
    totalPrice:
      hasInvalidModule || isEmpty
        ? null
        : roundCurrency(modules.reduce((total, module) => total + module.unitPrice, 0)),
    isEmpty,
    hasOutOfGrid,
    hasInvalidModule,
    allEquipped: openings.length > 0 && openings.every((opening) => frame.placements?.[opening.id]),
  };
}

export function getCompositeFrameModuleCount(frame) {
  return getCompositeFrameModules(frame).length;
}

export function formatCompositeFrame(frame) {
  const solved = solveFrame(frame);
  if (!solved.ok) return 'Châssis composé';
  const cols = frame.columns.length;
  const rows = frame.rows.length;
  const placed = getCompositeFrameModuleCount(frame);
  return `Ossature ${cols}×${rows} — ${placed} châssis`;
}

export { normalizeCompositeFrame };

export function formatCompositeModules(composition = [], separator = ' / ', legacyModules = null) {
  const tree = normalizeCompositeComposition(composition, legacyModules);

  const formatNode = (node) => {
    if (isLeaf(node)) {
      const leafModule = node.module || {};
      const product = resolveCompositeProduct(
        leafModule.productId || leafModule.sheetName || leafModule.type
      );
      const widthMm = parsePositiveNumber(leafModule.widthMm ?? leafModule.largeur);
      const heightMm = parsePositiveNumber(leafModule.heightMm ?? leafModule.hauteur);
      return `${product.shortLabel || product.label} ${widthMm}x${heightMm}`;
    }
    if (isSplit(node)) {
      const sep = node.direction === 'v' ? separator : ' + ';
      return node.children
        .map((child) => {
          const text = formatNode(child);
          return isSplit(child) && child.direction !== node.direction ? `[ ${text} ]` : text;
        })
        .join(sep);
    }
    return '';
  };

  return formatNode(tree);
}

export function getHeights(sheetName) {
  const data = PRICING[normalizeSheetName(sheetName)];
  return data ? data.heights : [];
}

export function getWidths(sheetName, height) {
  const data = PRICING[normalizeSheetName(sheetName)];
  if (!data) return [];

  const available = data.prices
    .filter((entry) => entry.h === height)
    .map((entry) => entry.l);

  return [...new Set(available)].sort((left, right) => left - right);
}

export function getPriceForMm(sheetName, heightMm, widthMm) {
  const data = PRICING[normalizeSheetName(sheetName)];
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

export function calculateWasteManagementForItems(cartItems = []) {
  return cartItems.reduce(
    (accumulator, item) => {
      if (
        item.productId === 'gestion-dechets' ||
        item.productId === 'metrage-technique-validation' ||
        item.productId === 'forfait-deplacement' ||
        item.productId === 'text-only' ||
        item.productId === COMMERCIAL_DISCOUNT_PRODUCT_ID
      ) {
        return accumulator;
      }

      // Custom products with explicit dimensions contribute to waste calculation
      if (item.productId === 'custom-product') {
        if (item.customHasDimensions && item.widthMm > 0 && item.heightMm > 0) {
          const factor = WASTE_FACTORS['fenetres']; // default factor for custom items
          const surface = calculateSurface(item.widthMm, item.heightMm, item.quantity);
          const weight = surface * factor;
          accumulator.totalSurface += surface;
          accumulator.totalWeight += weight;
          accumulator.totalWastePrice += weight * WASTE_PRICE_PER_KG;
        }
        return accumulator;
      }

      if (item.isComposite) {
        const pricedComposition = getCompositePricing(item.composition, item.modules);

        pricedComposition.modulePricing.forEach((module) => {
          const factor = WASTE_FACTORS[module.categoryId];
          if (!factor) return;

          const surface = calculateSurface(module.widthMm, module.heightMm, item.quantity);
          const weight = surface * factor;
          accumulator.totalSurface += surface;
          accumulator.totalWeight += weight;
          accumulator.totalWastePrice += weight * WASTE_PRICE_PER_KG;
        });

        return accumulator;
      }

      const categoryId = getProductCategory(item.productId);
      const factor = WASTE_FACTORS[categoryId];
      if (!factor) return accumulator;

      const surface = calculateSurface(item.widthMm, item.heightMm, item.quantity);
      const weight = surface * factor;
      accumulator.totalSurface += surface;
      accumulator.totalWeight += weight;
      accumulator.totalWastePrice += weight * WASTE_PRICE_PER_KG;
      return accumulator;
    },
    { totalSurface: 0, totalWeight: 0, totalWastePrice: 0 }
  );
}

export function getProductType(sheetName) {
  const resolvedSheetName = normalizeSheetName(sheetName);
  if (!resolvedSheetName) return 'menuiserie';
  if (resolvedSheetName.startsWith('Volet')) return 'volet';
  if (resolvedSheetName.startsWith('Porte Entr')) return 'porte';
  return 'menuiserie';
}

const moduleIsPorte = (module = {}) =>
  /^porte-/.test(module.productId || '') ||
  /Porte Entr/.test(normalizeSheetName(module.sheetName || ''));

/**
 * Indique si un châssis composé contient au moins une porte d'entrée.
 * Sert à appliquer le tarif de pose « porte » (400 €) plutôt que
 * « menuiserie » (250 €) à l'ensemble du châssis.
 */
export function compositeIncludesPorte(item = {}) {
  const rows = Array.isArray(item.composition) ? item.composition : [];
  const fromRows = rows.flatMap((row) =>
    Array.isArray(row?.modules) ? row.modules : []
  );
  const modules = fromRows.length
    ? fromRows
    : Array.isArray(item.modules)
      ? item.modules
      : [];
  return modules.some(moduleIsPorte);
}

const resolveModuleColorLabel = (module = {}, item = {}) => {
  const colorId = module?.options?.colorOptionId;
  if (colorId && colorId !== 'blanc') {
    const color = COLOR_OPTIONS.find((option) => option.id === colorId);
    if (color) return color.label;
  }
  const finition = String(item?.marketingFinition || '')
    .replace(/^Finition\s*:\s*/i, '')
    .trim();
  return finition || 'Blanc';
};

/**
 * Énumère les portes à panneau décoratif d'un article, qu'elles soient
 * autonomes ou imbriquées dans un châssis composé (modèle « ossature » v2 ou
 * legacy). Chaque porte reçoit un `lineId` STABLE et UNIQUE, clé de jointure
 * partagée par le sélecteur de panneaux, la ligne « Panneau decoratif : … » du
 * PDF et son ancre de tampon. Pour un composé multi-portes : `${item.id}:${moduleId}`.
 *
 * @param {object} item
 * @returns {Array<{lineId, moduleId, productId, sheetName, productLabel, repere,
 *   widthMm, heightMm, options, colorOptionId, colorLabel, marketingFinition, module}>}
 */
export function getItemDecoDoors(item = {}) {
  const baseId = String(item?.id || item?.leafId || '').trim();

  if (!item?.isComposite) {
    const isDeco =
      item?.panneauDecoratif === true || item?.options?.panneauDecoratif === true;
    if (!isDeco) return [];
    return [
      {
        lineId: baseId,
        moduleId: null,
        productId: item.productId || '',
        sheetName: item.sheetName || '',
        productLabel: item.productLabel || item.sheetName || "Porte d'entrée",
        repere: item.repere || '',
        widthMm: Number(item.widthMm) || null,
        heightMm: Number(item.heightMm) || null,
        options: item.options || null,
        colorOptionId: item.colorOption?.id || item.colorOptionId || '',
        colorLabel: '',
        marketingFinition: item.marketingFinition || '',
        module: null,
      },
    ];
  }

  const modules = item.compositeFrame
    ? getCompositeFrameModules(normalizeCompositeFrame(item.compositeFrame))
    : flattenCompositeModules(item.compositionTree ?? item.composition, item.modules);

  const doors = [];
  modules.forEach((module, index) => {
    const options = module?.options || {};
    const isDeco = options.panneauDecoratif === true || module?.panneauDecoratif === true;
    if (!isDeco || !moduleIsPorte(module)) return;
    const moduleId = String(module?.id || module?.leafId || `mod-${index + 1}`).trim();
    const product = getProductById(module.productId);
    doors.push({
      lineId: baseId ? `${baseId}:${moduleId}` : moduleId,
      moduleId,
      productId: module.productId || '',
      sheetName: product?.sheet || '',
      productLabel: product?.label || product?.shortLabel || "Porte d'entrée",
      repere: item.repere || '',
      widthMm: Number(module.widthMm) || null,
      heightMm: Number(module.heightMm) || null,
      options,
      colorOptionId: options.colorOptionId || '',
      colorLabel: resolveModuleColorLabel(module, item),
      marketingFinition: item.marketingFinition || '',
      module,
    });
  });
  return doors;
}

export const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Libellé de la ligne de pose d'un article. Utilise le libellé personnalisé
 * (`poseLabel`) s'il a été saisi dans le récapitulatif, sinon « Pose <produit> ».
 */
/**
 * Libellé produit affiché côté client / devis.
 * La distinction Réno / Neuf des portes d'entrée n'est utile QU'AU configurateur
 * (choix de la bonne grille tarifaire). Partout ailleurs (panier, récapitulatif,
 * devis PDF, sélecteur de panneaux), on n'affiche que « Porte d'entrée ».
 * @param {string} label
 * @returns {string}
 */
export function getDisplayProductLabel(label = '') {
  const trimmed = String(label ?? '').trim();
  const stripped = trimmed
    .replace(/\s*[–-]?\s*(rénovation|renovation|réno|reno|neuf)\s*$/i, '')
    .trim();
  return stripped || trimmed;
}

export function getPoseLabel(item) {
  const custom = typeof item?.poseLabel === 'string' ? item.poseLabel.trim() : '';
  if (custom) return custom;
  const base = getDisplayProductLabel(item?.productLabel || item?.sheetName || '');
  return base ? `Pose ${base}` : 'Pose';
}

export function getPosePriceForType(productType) {
  const { posePrices = {} } = getCataloguePricing();
  if (!productType) return 0;
  const resolved = posePrices[productType];
  if (Number.isFinite(Number(resolved))) {
    return Number(resolved);
  }
  return POSE_PRICES[productType] || 0;
}

export function calculateItemPrice(item) {
  const compositePricing = item.isComposite
    ? getCompositePricing(item.composition, item.modules)
    : null;

  let basePrice = compositePricing?.totalPrice ?? item.unitPrice ?? 0;
  let optionsPrice = 0;
  const pricing = getCataloguePricing();

  if (!item.isComposite) {
    basePrice = applyProductCoefficient(
      basePrice,
      resolveCoefficientProductId(item.productId)
    );

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

    // Option « Volet roulant monobloc intégré » sur une menuiserie
    // (fenêtre / porte-fenêtre / coulissant). On facture le volet via la
    // grille « Volet Filaire » selon les dimensions de la menuiserie, plus le
    // surcoût de manœuvre (même barème que les volets seuls). La pose N'EST PAS
    // doublée : l'ensemble se pose en une fois (cf. calcul de posePrice plus bas).
    if (item.voletMonobloc) {
      const voletPriceData = getPriceForMm(
        'Volet Filaire',
        Number(item.heightMm),
        Number(item.widthMm)
      );
      let voletMonoblocPrice = Number(voletPriceData?.price || 0);

      if (item.voletMonoblocManoeuvre === 'radio') {
        voletMonoblocPrice += 50 * 1.25;
      } else if (item.voletMonoblocManoeuvre === 'solaire') {
        voletMonoblocPrice += 240 * 1.25;
      }

      optionsPrice += voletMonoblocPrice;
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
      const basePriceValue =
        Number(pricing.panneauDecoratifPrice) || PANNEAU_DECORATIF_PRICE;
      const multiplier =
        Number(pricing.panneauDecoratifMultiplier) || PANNEAU_DECORATIF_MULTIPLIER;
      optionsPrice += basePriceValue * multiplier;
    }

    Object.values(item.sashOptions || {}).forEach((sash) => {
      const obPrice = Number(pricing.obPrice) || OB_PRICE;
      const grillePrice = Number(pricing.grillePrice) || GRILLE_PRICE;
      if (sash?.ob) optionsPrice += obPrice * 1.25;
      if (sash?.vent) optionsPrice += grillePrice * 1.25;
    });

    if (item.hasLockingHandle) {
      optionsPrice += Number(pricing.lockingHandlePrice) || LOCKING_HANDLE_PRICE;
    }

    if (fillingPricing.totalExtra > 0) {
      optionsPrice += fillingPricing.totalExtra;
    }
  }

  // Option « Volet roulant monobloc » sur un châssis composé : un seul volet
  // couvrant la largeur totale, facturé sur les dimensions totales de l'ensemble
  // (grille « Volet Filaire ») + surcoût de manœuvre. La pose n'est pas doublée :
  // le composite garde une pose menuiserie unique (cf. posePrice plus bas).
  if (item.isComposite && item.voletMonobloc) {
    // Un seul volet couvrant l'ENSEMBLE : on facture sur les dimensions totales du
    // cadre. Modèle ossature -> item.widthMm/heightMm (largeur/hauteur d'ensemble) ;
    // repli sur l'ancienne géométrie pour les devis composés au format historique.
    const totalWidth =
      Number(item.widthMm) || getCompositeDimensions(item.composition, item.modules).width;
    const totalHeight =
      Number(item.heightMm) || getCompositeDimensions(item.composition, item.modules).height;
    const voletPriceData = getPriceForMm('Volet Filaire', totalHeight, totalWidth);
    let voletMonoblocPrice = Number(voletPriceData?.price || 0);

    if (item.voletMonoblocManoeuvre === 'radio') {
      voletMonoblocPrice += 50 * 1.25;
    } else if (item.voletMonoblocManoeuvre === 'solaire') {
      voletMonoblocPrice += 240 * 1.25;
    }

    optionsPrice += voletMonoblocPrice;
  }

  const grossMarginToAdd = calculateGrossAmountToAddForNetMargin(
    item.netMarginWanted,
    item.remise
  );
  const grossDiscountToSubtract = calculateGrossAmountToSubtractForNetDiscount(
    item.netDiscountWanted,
    item.remise
  );
  const totalPriceBeforeDiscount = Math.max(
    0,
    basePrice + optionsPrice + grossMarginToAdd - grossDiscountToSubtract
  );
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
    // Stabilité comptable : PU arrondi au centime D'ABORD, puis × quantité.
    // Garantit que « PU affiché × Qté = Total ligne » au centime près.
    const price = roundCurrency(item.customPrice);
    return {
      unitPriceBase: price,
      unitPriceWithOptions: price,
      unitPriceAfterDiscount: price,
      // Pose optionnelle à prix libre (ex. fenêtre de toit Velux) : affichée
      // en sous-ligne « Pose » comme pour les menuiseries catalogue.
      posePrice: item.includePose ? roundCurrency(item.customPoseHt) : 0,
      totalLine: roundCurrency(price * (item.quantity || 1)),
    };
  }

  if (item.productId === COMMERCIAL_DISCOUNT_PRODUCT_ID) {
    // Remise commerciale supplémentaire : ligne NÉGATIVE d'un montant fixe
    // (toujours quantité 1). Elle réduit le total HT et alimente la ligne
    // « Remise » de la synthèse via un original de ligne à 0 (cf.
    // getItemPricingSummary).
    const amount = roundCurrency(Math.abs(Number(item.customPrice) || 0));
    return {
      unitPriceBase: -amount,
      unitPriceWithOptions: -amount,
      unitPriceAfterDiscount: -amount,
      posePrice: 0,
      totalLine: -amount,
    };
  }

  if (item.productId === 'text-only') {
    return {
      unitPriceBase: 0,
      unitPriceWithOptions: 0,
      unitPriceAfterDiscount: 0,
      posePrice: 0,
      totalLine: 0,
    };
  }

  if (
    item.productId === 'metrage-technique-validation' ||
    item.productId === 'forfait-deplacement'
  ) {
    // Services catalogue (métrage, forfait déplacement) : prix HT fixe (0 =
    // offert), sans coefficient, remise, commission ni pose. PU arrondi au
    // centime PUIS multiplié par la quantité : « PU affiché × Qté = Total ».
    const price = roundCurrency(item.unitPrice);
    return {
      unitPriceBase: price,
      unitPriceWithOptions: price,
      unitPriceAfterDiscount: price,
      posePrice: 0,
      totalLine: roundCurrency(price * (item.quantity || 1)),
    };
  }

  const productType = item.isComposite
    ? compositeIncludesPorte(item)
      ? 'porte'
      : 'menuiserie'
    : getProductType(item.sheetName);
  let posePrice = item.includePose ? getPosePriceForType(productType) : 0;

  if (item.includePose && item.productId === 'volet-solaire') {
    posePrice = 100;
  }

  // Commission commerciale / apporteur d'affaires : majoration par unité déjà
  // répartie en amont (applyCommissionToCartItems), ajoutée APRÈS remise sur la
  // menuiserie uniquement. La pose n'est jamais impactée.
  const commissionUnit = Math.max(0, Number(item.commissionUnitHT) || 0);
  const unitAfterCommission = roundCurrency(priceAfterDiscount + commissionUnit);

  return {
    unitPriceBase: roundCurrency(basePrice),
    unitPriceWithOptions: roundCurrency(totalPriceBeforeDiscount),
    unitPriceAfterDiscount: unitAfterCommission,
    posePrice,
    totalLine: roundCurrency(unitAfterCommission * (item.quantity || 1)),
  };
}

/**
 * Redistribue une commission commerciale dans les prix des menuiseries.
 *
 * Base = total HT après remise (menuiseries + pose de tout le devis).
 * Montant commission = base × pourcentage. Ce montant est réparti AU PRORATA du
 * prix HT après remise de chaque ligne menuiserie éligible (pose et services
 * exclus), puis converti en majoration par unité stockée dans `commissionUnitHT`.
 * Le champ est éphémère (jamais persisté) : recalculé partout depuis le % du devis.
 *
 * @param {Array} cartItems
 * @param {number} commissionPercent
 * @returns {Array} nouvelle liste d'articles (avec `commissionUnitHT` posé/annulé)
 */
export function applyCommissionToCartItems(cartItems, commissionPercent) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const pct = Math.max(0, Math.min(100, Number(commissionPercent) || 0));

  const stripCommission = (item) =>
    item && item.commissionUnitHT ? { ...item, commissionUnitHT: 0 } : item;

  if (!(pct > 0)) return items.map(stripCommission);

  // 1) Prix de base (sans commission) de chaque ligne.
  const baseCalcs = items.map((item) => calculateItemPrice(stripCommission(item)));

  // 2) Base = total HT après remise (menuiseries + pose), tout le devis.
  let baseTotal = 0;
  items.forEach((item, index) => {
    const calc = baseCalcs[index];
    baseTotal += Number(calc.totalLine) || 0;
    if (item?.includePose) {
      baseTotal += roundCurrency((Number(calc.posePrice) || 0) * (item.quantity || 1));
    }
  });

  const commissionAmount = roundCurrency((baseTotal * pct) / 100);
  if (!(commissionAmount > 0)) return items.map(stripCommission);

  // 3) Lignes menuiserie éligibles (fourniture > 0, hors services).
  const NON_MENUISERIE = new Set([
    'gestion-dechets',
    'metrage-technique-validation',
    'forfait-deplacement',
    'text-only',
    'custom-product',
    COMMERCIAL_DISCOUNT_PRODUCT_ID,
  ]);
  const isEligible = (item, calc) =>
    (Number(calc.totalLine) || 0) > 0 && !NON_MENUISERIE.has(item?.productId);

  const eligibleIndexes = items
    .map((item, index) => (isEligible(item, baseCalcs[index]) ? index : -1))
    .filter((index) => index >= 0);
  const eligibleTotal = eligibleIndexes.reduce(
    (sum, index) => sum + (Number(baseCalcs[index].totalLine) || 0),
    0
  );
  if (!(eligibleTotal > 0)) return items.map(stripCommission);

  // 4) Répartition au prorata ; le résidu d'arrondi va sur la dernière ligne.
  const lineUpliftByIndex = {};
  let distributed = 0;
  eligibleIndexes.forEach((index, position) => {
    let lineUplift;
    if (position === eligibleIndexes.length - 1) {
      lineUplift = roundCurrency(commissionAmount - distributed);
    } else {
      lineUplift = roundCurrency(
        (commissionAmount * (Number(baseCalcs[index].totalLine) || 0)) / eligibleTotal
      );
      distributed = roundCurrency(distributed + lineUplift);
    }
    lineUpliftByIndex[index] = lineUplift;
  });

  // 5) Conversion en majoration par unité.
  return items.map((item, index) => {
    const lineUplift = lineUpliftByIndex[index] || 0;
    if (!(lineUplift > 0)) return stripCommission(item);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    return { ...item, commissionUnitHT: roundCurrency(lineUplift / quantity) };
  });
}

export const getItemPricingSummary = (item, calc) => {
  if (item?.productId === COMMERCIAL_DISCOUNT_PRODUCT_ID) {
    // La ligne remise n'a pas de « prix avant remise » : original à 0 pour que
    // le montant remonte dans la ligne « Remise » de la synthèse
    // (discountTotal = originalTotalHT - totalHT). hasDiscount reste false afin
    // de ne pas afficher un « 0.00 barré » sur la ligne elle-même.
    const amount = roundCurrency(Math.abs(Number(calc?.totalLine) || 0));
    return {
      discountPerUnit: 0,
      originalUnitHT: 0,
      originalLineHT: 0,
      discountLineHT: amount,
      hasDiscount: false,
    };
  }

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
