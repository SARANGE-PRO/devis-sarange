/**
 * Glazing options, frame systems, thermal performance, and filling pricing.
 */

import { getCataloguePricing } from './catalogue-pricing.js';
import {
  LEGACY_BASE_GLASS_PRICE_PER_M2,
  LEGACY_GLAZING_OPTIONS,
  MIN_BILLED_GLASS_AREA_M2,
  RIOU_ALU_DEFAULT_GLAZING_ID,
  RIOU_PVC_DEFAULT_GLAZING_ID,
  buildRiouGlazingOptions,
} from './glazing-tariff.mjs';

export {
  GLAZING_GROUP_LABELS,
  GLAZING_TARIFF_DATE,
  MIN_BILLED_GLASS_AREA_M2,
  RIOU_COMPOSITIONS,
  filterGlazingOptionsForMaterial,
  getGlazingGroupLabel,
  isLegacyGlazing,
} from './glazing-tariff.mjs';

// Ancien prix du vitrage de base (tarif précédent) : simple repli. La base
// courante des surcoûts est le prix du vitrage clair FE du matériau, voir
// getGlazingExtraBasePricePerM2 et lib/glazing-tariff.mjs.
export const BASE_GLASS_PRICE_PER_M2 = 37;
export const MARKUP_COEFFICIENT = 2.88;
export const PSI_G = 0.04;
export const PANEL_SANDWICH_GLAZING_ID = 'panel_sandwich_pvc_28';
export const PANEL_SANDWICH_PRICE_PER_M2 = 74.37;
export const PANEL_SANDWICH_COLOR_MULTIPLIER = 1.4;
// Panneau sandwich pour menuiseries aluminium : panneau alu (pas PVC), prix dédié.
// PANEL_SANDWICH_ALU_PRICE_PER_M2 est un prix D'ACHAT ; la revente applique le
// coefficient ci-dessous (x2,5, donc x2 net après une remise de -20 %).
export const PANEL_SANDWICH_ALU_GLAZING_ID = 'panel_sandwich_alu_28';
export const PANEL_SANDWICH_ALU_PRICE_PER_M2 = 68;
export const PANEL_SANDWICH_ALU_MARKUP_COEFFICIENT = 2.5;
export const SOUS_BASSEMENT_TRAVERSE_PRICE_PER_ML = 10;
const CUSTOM_GLAZING_STORAGE_KEY = 'sarange.catalogue.customGlazings';
const EMPTY_GLAZING_SNAPSHOT = Object.freeze([]);

let cachedCustomGlazingOptions = null;
let cachedGlazingOptionsSnapshot = null;
let cachedGlazingOptionsSource = null;
const glazingListeners = new Set();
let glazingStorageListenerBound = false;

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isBrowser = () => typeof window !== 'undefined';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const slugify = (value) =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toNumber = (value, fallback = null) => {
  const parsed =
    typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableRoundedNumber = (value, decimals = 2) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = toNumber(value, null);
  return parsed === null ? null : roundTo(parsed, decimals);
};

const emitGlazingChange = () => {
  glazingListeners.forEach((listener) => listener());
};

const bindGlazingStorageListener = () => {
  if (!isBrowser() || glazingStorageListenerBound) return;

  window.addEventListener('storage', (event) => {
    if (event.key !== CUSTOM_GLAZING_STORAGE_KEY) return;
    cachedCustomGlazingOptions = null;
    cachedGlazingOptionsSnapshot = null;
    cachedGlazingOptionsSource = null;
    emitGlazingChange();
  });

  glazingStorageListenerBound = true;
};

export function createCustomGlazingId(label = '') {
  const base = slugify(label) || 'vitrage';
  return `custom-glazing-${base}-${Math.random().toString(16).slice(2, 8)}`;
}

// Vitrages proposés : tarif Riou du 24/07/2026 décliné par matériau (voir
// lib/glazing-tariff.mjs), anciens vitrages conservés pour les devis antérieurs
// (jamais proposés sur un nouvel article), puis panneaux sandwich (remplissages
// opaques). Les panneaux gardent la base de comparaison historique de 37 €/m² :
// leur prix de vente ne dépend pas du changement de tarif vitrage.
export const DEFAULT_GLAZING_OPTIONS = [
  ...buildRiouGlazingOptions(),
  ...LEGACY_GLAZING_OPTIONS,
  {
    id: PANEL_SANDWICH_GLAZING_ID,
    label: 'Panneau sandwich isolant PVC (Ep. 28 mm)',
    shortLabel: 'Panneau sandwich PVC 28 mm',
    purchasePricePerM2: PANEL_SANDWICH_PRICE_PER_M2,
    extraBasePricePerM2: LEGACY_BASE_GLASS_PRICE_PER_M2,
    ug: null,
    g: null,
    thicknessMm: 28,
    category: 'remplissage',
    material: 'pvc',
    isBaseIncluded: false,
    isOpaqueFilling: true,
    isThermalDataAvailable: false,
    legacy: false,
  },
  {
    id: PANEL_SANDWICH_ALU_GLAZING_ID,
    label: 'Panneau sandwich isolant aluminium (Ep. 28 mm)',
    shortLabel: 'Panneau sandwich alu 28 mm',
    purchasePricePerM2: PANEL_SANDWICH_ALU_PRICE_PER_M2,
    ug: null,
    g: null,
    thicknessMm: 28,
    category: 'remplissage',
    material: 'alu',
    isBaseIncluded: false,
    isOpaqueFilling: true,
    isThermalDataAvailable: false,
    legacy: false,
  },
];

const BUILT_IN_GLAZING_IDS = new Set(DEFAULT_GLAZING_OPTIONS.map((glazing) => glazing.id));

export const sanitizeCustomGlazingOption = (value = {}) => {
  const fallbackLabel = normalizeText(value.shortLabel) || normalizeText(value.label);
  const rawId = normalizeText(value.id);

  return {
    id: rawId || createCustomGlazingId(fallbackLabel),
    label: normalizeText(value.label) || 'Vitrage personnalise',
    shortLabel: fallbackLabel || 'Vitrage perso',
    purchasePricePerM2: Math.max(0, toNumber(value.purchasePricePerM2, 0)),
    ug: toNullableRoundedNumber(value.ug, 2),
    g: toNullableRoundedNumber(value.g, 2),
    thicknessMm: Math.max(0, Math.round(toNumber(value.thicknessMm, 0))),
    category: normalizeText(value.category) || 'personnalise',
    isBaseIncluded: value.isBaseIncluded === true,
    isOpaqueFilling: value.isOpaqueFilling === true,
    isThermalDataAvailable:
      value.isThermalDataAvailable !== false &&
      (value.isOpaqueFilling === true
        ? Boolean(value.isThermalDataAvailable)
        : true),
  };
};

export const sanitizeCustomGlazingOptions = (value) => {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set();

  return value.reduce((accumulator, entry) => {
    const normalized = sanitizeCustomGlazingOption(entry);

    if (!normalized.id || BUILT_IN_GLAZING_IDS.has(normalized.id) || seenIds.has(normalized.id)) {
      return accumulator;
    }

    seenIds.add(normalized.id);
    accumulator.push(normalized);
    return accumulator;
  }, []);
};

const loadCustomGlazingOptions = () => {
  if (cachedCustomGlazingOptions) return cachedCustomGlazingOptions;
  if (!isBrowser()) {
    cachedCustomGlazingOptions = [];
    return cachedCustomGlazingOptions;
  }

  try {
    const rawValue = window.localStorage.getItem(CUSTOM_GLAZING_STORAGE_KEY);
    cachedCustomGlazingOptions = rawValue
      ? sanitizeCustomGlazingOptions(JSON.parse(rawValue))
      : [];
  } catch {
    cachedCustomGlazingOptions = [];
  }

  return cachedCustomGlazingOptions;
};

const persistCustomGlazingOptions = (glazings) => {
  cachedCustomGlazingOptions = sanitizeCustomGlazingOptions(glazings);
  cachedGlazingOptionsSnapshot = null;
  cachedGlazingOptionsSource = null;

  if (!isBrowser()) return cachedCustomGlazingOptions;

  try {
    window.localStorage.setItem(
      CUSTOM_GLAZING_STORAGE_KEY,
      JSON.stringify(cachedCustomGlazingOptions)
    );
  } catch {
    return cachedCustomGlazingOptions;
  }

  emitGlazingChange();
  return cachedCustomGlazingOptions;
};

export function getCustomGlazingOptions() {
  return [...loadCustomGlazingOptions()];
}

export function getCustomGlazingOptionsSnapshot() {
  return loadCustomGlazingOptions();
}

export function setCustomGlazingOptions(glazings) {
  return persistCustomGlazingOptions(glazings);
}

export function resetCustomGlazingOptions() {
  return persistCustomGlazingOptions([]);
}

export function hydrateCustomGlazingOptions(glazings) {
  return persistCustomGlazingOptions(glazings);
}

export function subscribeToGlazingOptions(listener) {
  if (!isBrowser()) {
    return () => {};
  }

  bindGlazingStorageListener();
  glazingListeners.add(listener);

  return () => {
    glazingListeners.delete(listener);
  };
}

export function getGlazingOptions() {
  return getGlazingOptionsSnapshot();
}

export function getGlazingOptionsSnapshot() {
  const customGlazingOptions = loadCustomGlazingOptions();

  if (
    cachedGlazingOptionsSnapshot &&
    cachedGlazingOptionsSource === customGlazingOptions
  ) {
    return cachedGlazingOptionsSnapshot;
  }

  cachedGlazingOptionsSource = customGlazingOptions;
  cachedGlazingOptionsSnapshot = [
    ...DEFAULT_GLAZING_OPTIONS,
    ...customGlazingOptions,
  ];

  return cachedGlazingOptionsSnapshot;
}

export function getGlazingOptionsServerSnapshot() {
  return EMPTY_GLAZING_SNAPSHOT;
}

export const FRAME_SYSTEMS = [
  {
    id: 'ct70',
    label: 'Fenetre Schuco CT70',
    frameWidthMm: 112,
    uf: 1.3,
    psi: PSI_G,
  },
  {
    id: 'softslide',
    label: 'Coulissant Schuco SoftSlide',
    frameWidthMm: 118,
    uf: 1.4,
    psi: PSI_G,
  },
  // Systèmes aluminium Schüco (à rupture de pont thermique).
  {
    id: 'aws60',
    label: 'Fenetre Schuco AWS 60',
    frameWidthMm: 105,
    // Uf = 1,80 : valeur d'estimation interne destinée à reproduire notre
    // estimation AWS 60 (analyse du 07/08/2026). Ce n'est pas une valeur
    // contractuelle à présenter comme certification fabricant.
    uf: 1.8,
    // Intercalaire Warm Edge alu.
    psi: 0.049,
  },
  {
    id: 'ass41sc',
    label: 'Coulissant Schuco ASS 41 SC',
    frameWidthMm: 100,
    uf: 2.4,
    psi: PSI_G,
  },
];

const FRAME_SYSTEM_BY_ID = new Map(FRAME_SYSTEMS.map((system) => [system.id, system]));

// Détecte une menuiserie aluminium à partir du nom de feuille (suffixe « ALU »).
const isAluminiumSheet = (sheetName) =>
  typeof sheetName === 'string' && /\bALU\b/i.test(sheetName);

export const PVC_DEFAULT_GLAZING_ID = RIOU_PVC_DEFAULT_GLAZING_ID;
export const ALU_DEFAULT_GLAZING_ID = RIOU_ALU_DEFAULT_GLAZING_ID;

// Vitrage standard inclus par défaut selon le matériau : clair FE 4/20/4 en
// PVC 28 mm, 4/16/4 en aluminium 24 mm (tarif Riou du 24/07/2026).
export const getDefaultGlazingId = (material) =>
  material === 'alu' ? ALU_DEFAULT_GLAZING_ID : PVC_DEFAULT_GLAZING_ID;

const resolveGlazingOption = (glazingOrId) => {
  const availableGlazings = getGlazingOptions();

  if (!glazingOrId) return availableGlazings[0] || null;
  if (typeof glazingOrId === 'string') {
    return (
      availableGlazings.find((glazing) => glazing.id === glazingOrId) ||
      availableGlazings[0] ||
      null
    );
  }
  return (
    availableGlazings.find((glazing) => glazing.id === glazingOrId.id) || glazingOrId
  );
};

export function getSelectedGlazing(glazingId) {
  return resolveGlazingOption(glazingId);
}

export function getFrameSystemForProduct(sheetName) {
  if (!sheetName) return FRAME_SYSTEMS[0];

  const isAlu = isAluminiumSheet(sheetName);
  const isSliding =
    sheetName.includes('Coulissant') || sheetName.includes('Galandage');
  if (isSliding) {
    return isAlu ? FRAME_SYSTEM_BY_ID.get('ass41sc') : FRAME_SYSTEMS[1];
  }
  if (isAlu) return FRAME_SYSTEM_BY_ID.get('aws60');
  return FRAME_SYSTEMS[0];
}

export function isGlazedProduct(product) {
  if (!product || !product.sheet) return false;
  const sheet = product.sheet;
  if (sheet.startsWith('Volet')) return false;
  if (sheet.startsWith('Porte Entr')) return false;
  if (sheet.startsWith('Gestion D') || sheet === 'Custom') return false;
  if (sheet.startsWith('Piece D')) return false;
  return true;
}

export function isOpaqueFilling(glazingOrId) {
  return Boolean(resolveGlazingOption(glazingOrId)?.isOpaqueFilling);
}

export function getFillingPricePerM2(glazingOrId, colorOptionId = 'blanc') {
  const pricing = getCataloguePricing();
  const glazing = resolveGlazingOption(glazingOrId);
  if (!glazing) return pricing.baseGlassPricePerM2 ?? BASE_GLASS_PRICE_PER_M2;

  if (glazing.id === PANEL_SANDWICH_GLAZING_ID) {
    const multiplier =
      colorOptionId && colorOptionId !== 'blanc'
        ? pricing.panelSandwichColorMultiplier ?? PANEL_SANDWICH_COLOR_MULTIPLIER
        : 1;
    const panelPrice =
      pricing.panelSandwichPricePerM2 ?? glazing.purchasePricePerM2 ?? PANEL_SANDWICH_PRICE_PER_M2;
    return roundTo(panelPrice * multiplier, 2);
  }

  const override = pricing.glazingPrices?.[glazing.id];
  return Number.isFinite(Number(override))
    ? Number(override)
    : glazing.purchasePricePerM2;
}

function calculateUniformBorderGlassAreas(widthMm, heightMm, frameWidthMm) {
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

// Géométrie AWS 60 (alu, hors coulissant) : profilé périphérique 105 mm,
// traverse basse 225 mm sur porte-fenêtre 1 vantail, battement central 60 mm
// entre les deux vitrages d'une menuiserie 2 vantaux. Analyse du 07/08/2026 ;
// valeurs d'estimation internes, non contractuelles.
const AWS60_PERIPHERAL_PROFILE_M = 0.105;
const AWS60_CENTRAL_MULLION_M = 0.06;
const AWS60_PORTE_FENETRE_SILL_M = 0.225;

// Nombre de sections vitrées (vantaux + fixes) d'après le nom de feuille,
// ex. « Fenêtre 2V » → 2, « Porte-Fenêtre 2V+1F ALU » → 3. Repli à 1 pour les
// feuilles sans marquage NV (« Fenêtre Fixe », « Fenêtre Soufflet »).
function countGlazedSections(sheetName) {
  if (typeof sheetName !== 'string') return 1;

  const vantauxMatch = sheetName.match(/(\d+)\s*V\b/i);
  const fixesMatch = sheetName.match(/\+\s*(\d+)\s*F\b/i);
  const total =
    (vantauxMatch ? Number(vantauxMatch[1]) : 0) +
    (fixesMatch ? Number(fixesMatch[1]) : 0);

  return total > 0 ? total : 1;
}

// Formule précise réservée aux menuiseries AWS 60 à 1 ou 2 sections vitrées
// (3V/4V/+F ALU restent sur l'approximation à bordure unique en attendant les
// cotes exactes de meneaux). `Wg` renvoyé est la largeur totale vitrée
// (meneau central inclus) : c'est cette largeur "pleine" qu'utilisent les
// calculs de sous-bassement (panneau opaque en allège), pas la largeur d'un
// seul vantail.
function calculateAws60GlassAreas(widthMm, heightMm, sheetName, sections) {
  const W = widthMm / 1000;
  const H = heightMm / 1000;
  const B = AWS60_PERIPHERAL_PROFILE_M;
  const isPorteFenetre = typeof sheetName === 'string' && sheetName.startsWith('Porte-Fen');

  let sectionWidth;
  let Hg;
  let totalWidth;

  if (sections === 2) {
    Hg = H - 2 * B;
    sectionWidth = (W - 2 * B - AWS60_CENTRAL_MULLION_M) / 2;
    totalWidth = 2 * sectionWidth + AWS60_CENTRAL_MULLION_M;
  } else {
    const sillHeight = isPorteFenetre ? AWS60_PORTE_FENETRE_SILL_M : B;
    Hg = H - B - sillHeight;
    sectionWidth = W - 2 * B;
    totalWidth = sectionWidth;
  }

  if (sectionWidth <= 0 || Hg <= 0) return null;

  const Aw = W * H;
  const Ag = sections * sectionWidth * Hg;
  const Af = Aw - Ag;
  const Lg = 2 * sections * (sectionWidth + Hg);

  return { Aw, Ag, Af, Lg, Wg: totalWidth, Hg };
}

/**
 * Calcule les surfaces de vitrage à partir des dimensions hors-tout de la
 * menuiserie et du système de profilé. Pour l'AWS 60 (alu, hors coulissant)
 * à 1 ou 2 vantaux, la géométrie tient compte de la traverse basse
 * porte-fenêtre et du battement central (cf. calculateAws60GlassAreas). Pour
 * les autres profilés (PVC, coulissants), et pour l'AWS 60 à 3 vantaux ou
 * plus, on garde l'approximation historique à bordure unique.
 */
export function calculateGlassAreas(widthMm, heightMm, frameSystem, sheetName) {
  const sections = countGlazedSections(sheetName);

  if (frameSystem?.id === 'aws60' && sections <= 2) {
    return calculateAws60GlassAreas(widthMm, heightMm, sheetName, sections);
  }

  return calculateUniformBorderGlassAreas(widthMm, heightMm, frameSystem?.frameWidthMm);
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

export function calculateEffectiveThermalAreas({
  glassAreas,
  hasSousBassement = false,
  sousBassementHeightMm = 0,
}) {
  if (!glassAreas) {
    return null;
  }

  if (!hasSousBassement) {
    return {
      Aw: roundTo(glassAreas.Aw, 4),
      Ag: roundTo(glassAreas.Ag, 4),
      Af: roundTo(glassAreas.Af, 4),
      Lg: roundTo(glassAreas.Lg, 4),
      Wg: roundTo(glassAreas.Wg, 4),
      Hg: roundTo(glassAreas.Hg, 4),
    };
  }

  const visibleHeightMm = clamp(
    Number(sousBassementHeightMm || 0),
    0,
    Math.max(0, Number(glassAreas.Hg || 0) * 1000)
  );
  const remainingGlassHeightM = Math.max(
    0,
    Number(glassAreas.Hg || 0) - visibleHeightMm / 1000
  );
  const remainingGlassAreaM2 = Math.max(
    0,
    Number(glassAreas.Wg || 0) * remainingGlassHeightM
  );

  if (remainingGlassAreaM2 <= 0) {
    return null;
  }

  return {
    Aw: roundTo(glassAreas.Aw, 4),
    Ag: roundTo(remainingGlassAreaM2, 4),
    Af: roundTo(Math.max(0, Number(glassAreas.Aw || 0) - remainingGlassAreaM2), 4),
    Lg: roundTo(2 * (Number(glassAreas.Wg || 0) + remainingGlassHeightM), 4),
    Wg: roundTo(glassAreas.Wg, 4),
    Hg: roundTo(remainingGlassHeightM, 4),
  };
}

/**
 * Base de comparaison des surcoûts de vitrage : prix d'achat du vitrage inclus
 * dans la menuiserie du matériau (clair FE, surcharge du catalogue comprise).
 * Les anciens vitrages et le panneau sandwich PVC portent leur base
 * historique (37 €/m²) : leur surcoût ne bouge pas sur les devis existants.
 */
export function getGlazingExtraBasePricePerM2(glazingOrId, material = 'pvc') {
  const glazing = resolveGlazingOption(glazingOrId);
  const explicitBase = glazing?.extraBasePricePerM2;
  if (explicitBase !== null && explicitBase !== undefined && Number.isFinite(Number(explicitBase))) {
    return Number(explicitBase);
  }
  return getFillingPricePerM2(getDefaultGlazingId(material));
}

/**
 * Surcoût de vente d'un vitrage : (prix d'achat au m² − base) × surface × 2,88.
 * `billedAreaM2` permet d'appliquer le minimum de facturation Riou (0,45 m² par
 * volume) ; sans base explicite, repli sur l'ancien réglage du catalogue.
 */
export function calculateGlazingExtra({
  selectedGlassPricePerM2,
  Ag,
  baseGlassPricePerM2 = null,
  billedAreaM2 = null,
}) {
  if (!Number.isFinite(selectedGlassPricePerM2) || !Number.isFinite(Ag) || Ag <= 0) {
    return 0;
  }

  const pricing = getCataloguePricing();
  const explicitBase =
    baseGlassPricePerM2 === null || baseGlassPricePerM2 === undefined
      ? null
      : Number(baseGlassPricePerM2);
  const baseGlassPrice = Number.isFinite(explicitBase)
    ? explicitBase
    : pricing.baseGlassPricePerM2 ?? BASE_GLASS_PRICE_PER_M2;
  const extraPerM2 = Math.max(0, selectedGlassPricePerM2 - baseGlassPrice);
  const areaM2 = Number.isFinite(billedAreaM2) && billedAreaM2 > 0 ? billedAreaM2 : Ag;
  return roundTo(extraPerM2 * areaM2 * MARKUP_COEFFICIENT, 2);
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
  hasTraverse = false,
  traverseCount = 0,
  colorOptionId = 'blanc',
  isAlu = false,
  // Nom de feuille : nombre de volumes vitrés, pour le minimum de facturation
  // Riou (0,45 m² par volume). Absent = un volume.
  sheetName = '',
}) {
  const glazing = resolveGlazingOption(selectedGlazing);
  const material = isAlu ? 'alu' : 'pvc';
  const sections = countGlazedSections(sheetName);
  const sousBassement = calculateSoubassementMetrics({
    glassAreas,
    widthMm,
    hasSousBassement,
    sousBassementHeightMm,
  });

  const glazingAreaM2 = hasSousBassement
    ? sousBassement.remainingGlassAreaM2
    : glassAreas?.Ag || 0;

  // Panneau sandwich aluminium : prix d'achat marqué directement (x2,5) plutôt
  // que via la formule générique « delta au-dessus du vitrage de base x2,88 »,
  // qui suppose un simple surclassement de vitrage — pas pertinent pour un
  // panneau opaque en matériau différent.
  const computeOpaquePanelExtra = (glazingIdForPanel, areaM2) => {
    if (areaM2 <= 0) return 0;
    const pricePerM2 = getFillingPricePerM2(glazingIdForPanel, colorOptionId);
    if (glazingIdForPanel === PANEL_SANDWICH_ALU_GLAZING_ID) {
      return roundTo(pricePerM2 * PANEL_SANDWICH_ALU_MARKUP_COEFFICIENT * areaM2, 2);
    }
    return calculateGlazingExtra({
      selectedGlassPricePerM2: pricePerM2,
      Ag: areaM2,
      baseGlassPricePerM2: getGlazingExtraBasePricePerM2(glazingIdForPanel, material),
    });
  };

  // Vitrage (hors panneau) : minimum de facturation Riou de 0,45 m² par volume
  // sur le verre, sauf pour les anciens vitrages (devis antérieurs inchangés).
  const computeGlassExtra = (glazingOption, areaM2) => {
    if (areaM2 <= 0) return 0;
    const billedAreaM2 = glazingOption.legacy
      ? areaM2
      : Math.max(areaM2, MIN_BILLED_GLASS_AREA_M2 * sections);
    return calculateGlazingExtra({
      selectedGlassPricePerM2: getFillingPricePerM2(glazingOption.id, colorOptionId),
      Ag: areaM2,
      baseGlassPricePerM2: getGlazingExtraBasePricePerM2(glazingOption, material),
      billedAreaM2,
    });
  };

  const glazingExtra =
    glazing && !glazing.isBaseIncluded
      ? glazing.isOpaqueFilling
        ? computeOpaquePanelExtra(glazing.id, glazingAreaM2)
        : computeGlassExtra(glazing, glazingAreaM2)
      : 0;

  const sousBassementPanelExtra = computeOpaquePanelExtra(
    isAlu ? PANEL_SANDWICH_ALU_GLAZING_ID : PANEL_SANDWICH_GLAZING_ID,
    sousBassement.panelAreaM2
  );

  const traversePricePerMl =
    getCataloguePricing().sousBassementTraversePricePerMl ?? SOUS_BASSEMENT_TRAVERSE_PRICE_PER_ML;

  const sousBassementTraversePrice =
    sousBassement.traverseLengthMl > 0
      ? roundTo(sousBassement.traverseLengthMl * traversePricePerMl, 2)
      : 0;

  // Traverses ajoutées : chacune est facturée au ml comme celle d'un
  // soubassement, mais la partie qu'elle sépare reste vitrée (aucun panneau,
  // surface vitrée inchangée). Elles s'AJOUTENT à celle du soubassement quand
  // les deux sont demandés (30/09/2026 : les options ne s'excluent plus).
  // `traverseCount` absent = une traverse, comportement du champ unique d'avant
  // le 25/09/2026.
  const traverseSeuleCount =
    hasTraverse && glassAreas && (glassAreas.Ag || 0) > 0
      ? Math.max(1, Math.round(Number(traverseCount) || 0))
      : 0;
  const traverseSeuleMl =
    (traverseSeuleCount * Math.max(0, Number(widthMm || 0))) / 1000;
  const traverseSeulePrice = traverseSeuleMl > 0 ? roundTo(traverseSeuleMl * traversePricePerMl, 2) : 0;

  return {
    selectedGlazing: glazing,
    glazingAreaM2: roundTo(glazingAreaM2, 4),
    glazingExtra: roundTo(glazingExtra, 2),
    sousBassementVisibleHeightMm: sousBassement.visibleHeightMm,
    sousBassementTraverseMl: roundTo(sousBassement.traverseLengthMl, 3),
    sousBassementTraversePrice,
    sousBassementPanelAreaM2: sousBassement.panelAreaM2,
    sousBassementPanelExtra: roundTo(sousBassementPanelExtra, 2),
    traverseSeuleCount,
    traverseSeuleMl: roundTo(traverseSeuleMl, 3),
    traverseSeulePrice,
    totalExtra: roundTo(
      glazingExtra + sousBassementPanelExtra + sousBassementTraversePrice + traverseSeulePrice,
      2
    ),
  };
}
