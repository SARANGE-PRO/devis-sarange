/**
 * door-composite.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Portes d'entrée avec tierce et/ou imposte.
 *
 * L'onglet « Portes d'entrée » propose trois produits préconfigurés
 * (porte-tierce, porte-imposte, porte-tierce-imposte, et leurs jumeaux alu,
 * voir lib/products.js). Dans le panier, chacun devient un châssis composé
 * « ossature » (lib/composite-frame.mjs) construit automatiquement :
 *
 *   - la porte sur la grille porte (Porte Entrée RENO, la seule grille porte,
 *     en neuf comme en rénovation) ;
 *   - la tierce et l'imposte sur la grille « Fenêtre Fixe » ;
 *   - chaque partie chiffrée comme un châssis d'un composé (coefficient,
 *     coloration, vitrage), prix = somme des parties, pose « porte ».
 *
 * Disposition : la tierce à gauche ou à droite de la porte, sur la hauteur de
 * la porte ; l'imposte au-dessus, sur toute la largeur (porte + tierce). Les
 * cotes saisies sont celles de la porte seule, les parties fixes s'ajoutent :
 * la même convention que le configurateur du site, dont les demandes (options
 * tierce / tierceWidthMm / imposte / imposteHeightMm) choisissent directement
 * le produit préconfiguré (lib/lead-quote-import.mjs). Sans cote, la
 * proportion par défaut du site (400 mm de tierce, 300 mm d'imposte).
 *
 * L'article du panier est un composé ordinaire (`isComposite`, `compositeFrame`,
 * `modules`) : dessin, PDF, panneau décoratif à la signature et pose suivent le
 * circuit des composés. Il porte en plus `doorComposite` (cotes des parties),
 * lu par la désignation, la pose et la TVA (règle « porte d'entrée »).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  FRAME_VERSION,
  computeOpenings,
  createBand,
  createDefaultFrame,
  makeId,
  normalizeCompositeFrame,
  placeChassis,
  vSegId,
} from '@/lib/composite-frame';
import {
  COLOR_OPTIONS,
  buildCompositeCartModules,
  getCompositeFramePricing,
  getItemThermalMetrics,
  getMaterialVariantId,
  getProductById,
} from '@/lib/products';
import { getDefaultGlazingId } from '@/lib/glazing';
import { getMarketingDetails } from '@/lib/marketing-details.mjs';

/** Cotes par défaut des parties fixes quand elles ne sont pas données (celles du site). */
export const DOOR_COMPOSITE_DEFAULTS = Object.freeze({ tierceWidthMm: 400, imposteHeightMm: 300 });

export const DOOR_BASE_PRODUCT_ID = 'porte-reno';
export const FIXE_BASE_PRODUCT_ID = 'fenetre-fixe';

const PRESET_ID_BY_PARTS = Object.freeze({
  'tierce': 'porte-tierce',
  'imposte': 'porte-imposte',
  'tierce+imposte': 'porte-tierce-imposte',
});

const positiveInt = (value, fallback = 0) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const normalizeSide = (side) => (side === 'left' ? 'left' : 'right');
const isDoorProductId = (productId) =>
  /^porte-/.test(String(productId || '')) && !getProductById(productId)?.doorComposite;
const isFixeProductId = (productId) => /^fenetre-fixe/.test(String(productId || ''));

/** `{ tierce, imposte }` du produit préconfiguré, ou null pour tout autre produit. */
export const getDoorCompositePreset = (productId) => getProductById(productId)?.doorComposite || null;

export const isDoorCompositeProductId = (productId) => Boolean(getDoorCompositePreset(productId));

/** Identifiant du produit préconfiguré pour ces parties fixes et ce matériau, ou null sans partie fixe. */
export const getDoorCompositePresetId = ({ tierce = false, imposte = false, material = 'pvc' } = {}) => {
  const key = [tierce ? 'tierce' : null, imposte ? 'imposte' : null].filter(Boolean).join('+');
  const base = PRESET_ID_BY_PARTS[key];
  return base ? getMaterialVariantId(base, material) : null;
};

/**
 * Résumé des parties (`item.doorComposite`) : cotes de la porte seule et des
 * parties fixes, côté de la tierce (vue intérieure).
 */
export const summarizeDoorComposite = (structure) => ({
  doorWidthMm: positiveInt(structure?.doorWidthMm),
  doorHeightMm: positiveInt(structure?.doorHeightMm),
  tierceWidthMm: positiveInt(structure?.tierceWidthMm),
  imposteHeightMm: positiveInt(structure?.imposteHeightMm),
  tierceSide: positiveInt(structure?.tierceWidthMm) ? normalizeSide(structure?.tierceSide) : null,
});

/** « avec tierce et imposte », « avec tierce », « avec imposte », ou '' sans partie fixe. */
export const doorCompositeSuffix = (marker) => {
  const tierce = positiveInt(marker?.tierceWidthMm) > 0;
  const imposte = positiveInt(marker?.imposteHeightMm) > 0;
  if (tierce && imposte) return 'avec tierce et imposte';
  if (tierce) return 'avec tierce';
  if (imposte) return 'avec imposte';
  return '';
};

/**
 * « porte 900 x 2150 mm, tierce de 400 mm à droite, imposte de 300 mm » (la
 * porte seulement sur demande : la désignation la nomme déjà).
 */
export const describeDoorCompositeParts = (marker, { withDoor = false } = {}) => {
  const parts = [];
  const doorWidthMm = positiveInt(marker?.doorWidthMm);
  const doorHeightMm = positiveInt(marker?.doorHeightMm);
  const tierceWidthMm = positiveInt(marker?.tierceWidthMm);
  const imposteHeightMm = positiveInt(marker?.imposteHeightMm);
  if (withDoor && doorWidthMm && doorHeightMm) parts.push(`porte ${doorWidthMm} x ${doorHeightMm} mm`);
  if (tierceWidthMm) {
    parts.push(`tierce de ${tierceWidthMm} mm à ${normalizeSide(marker?.tierceSide) === 'left' ? 'gauche' : 'droite'}`);
  }
  if (imposteHeightMm) parts.push(`imposte de ${imposteHeightMm} mm`);
  return parts.join(', ');
};

/* ------------------------------------------------------------------------- */
/* Ossature                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Ossature d'une porte avec parties fixes : colonnes [porte, tierce] (ou
 * l'inverse à gauche), lignes [imposte, porte], l'imposte sur toute la largeur.
 * Toutes les bandes sont fixes : la géométrie est exactement celle demandée.
 * @returns {object|null} frame, ou null sans cotes de porte
 */
export function buildDoorCompositeFrame({
  doorWidthMm,
  doorHeightMm,
  tierceWidthMm = 0,
  imposteHeightMm = 0,
  tierceSide = 'right',
  material = 'pvc',
  doorProductId,
  fixeProductId,
  doorOptions = {},
  fixeOptions = {},
  colorOptionId = 'blanc',
  rawColorState = null,
  idFactory,
} = {}) {
  const doorW = positiveInt(doorWidthMm);
  const doorH = positiveInt(doorHeightMm);
  if (!doorW || !doorH) return null;
  const tierceW = positiveInt(tierceWidthMm);
  const imposteH = positiveInt(imposteHeightMm);
  const side = normalizeSide(tierceSide);
  const make = typeof idFactory === 'function' ? idFactory : makeId;

  const doorBand = createBand({ id: make('band'), mode: 'fixed', value: doorW });
  const tierceBand = tierceW ? createBand({ id: make('band'), mode: 'fixed', value: tierceW }) : null;
  const columns = tierceBand ? (side === 'left' ? [tierceBand, doorBand] : [doorBand, tierceBand]) : [doorBand];
  const doorRow = createBand({ id: make('band'), mode: 'fixed', value: doorH });
  const rows = imposteH
    ? [createBand({ id: make('band'), mode: 'fixed', value: imposteH }), doorRow]
    : [doorRow];

  const frame = {
    ...createDefaultFrame(doorW + tierceW, doorH + imposteH, 0, 0, { idFactory: make }),
    columns,
    rows,
    // Imposte d'un seul tenant au-dessus de la porte et de la tierce.
    removedVerticalSegments:
      tierceBand && imposteH ? [vSegId(rows[0].id, columns[0].id, columns[1].id)] : [],
    removedHorizontalSegments: [],
    placements: {},
    colorOptionId: colorOptionId || 'blanc',
    rawColorState: rawColorState && typeof rawColorState === 'object' ? { ...rawColorState } : null,
  };

  const opened = computeOpenings(frame);
  if (!opened.ok) return null;
  const bottomRow = rows.length - 1;
  const doorCol = tierceBand && side === 'left' ? 1 : 0;
  const findOpening = (r, c) => opened.openings.find((opening) => opening.rMin === r && opening.cMin === c);
  const doorOpening = findOpening(bottomRow, doorCol);
  if (!doorOpening) return null;

  const resolvedDoorId = doorProductId || getMaterialVariantId(DOOR_BASE_PRODUCT_ID, material);
  const resolvedFixeId = fixeProductId || getMaterialVariantId(FIXE_BASE_PRODUCT_ID, material);
  const color = { colorOptionId: frame.colorOptionId, rawColorState: frame.rawColorState };

  let next = placeChassis(frame, doorOpening.id, doorOpening, {
    productId: resolvedDoorId,
    options: { ...color, ...doorOptions },
    idFactory: make,
  });
  if (tierceBand) {
    const opening = findOpening(bottomRow, doorCol === 0 ? 1 : 0);
    if (!opening) return null;
    next = placeChassis(next, opening.id, opening, {
      productId: resolvedFixeId,
      options: { ...color, ...fixeOptions },
      idFactory: make,
    });
  }
  if (imposteH) {
    const opening = findOpening(0, 0);
    if (!opening) return null;
    next = placeChassis(next, opening.id, opening, {
      productId: resolvedFixeId,
      options: { ...color, ...fixeOptions },
      idFactory: make,
    });
  }
  return next;
}

/**
 * Relit une ossature comme « porte avec parties fixes » : exactement une porte
 * en bas, au plus un fixe à côté (même hauteur) et un fixe au-dessus (toute la
 * largeur), rien d'autre. Null pour toute autre composition : le composé est
 * alors traité comme un châssis composé ordinaire.
 */
export function describeDoorCompositeFrame(frameInput) {
  if (!frameInput || typeof frameInput !== 'object') return null;
  const frame =
    frameInput.version === FRAME_VERSION && Array.isArray(frameInput.columns) && Array.isArray(frameInput.rows)
      ? frameInput
      : normalizeCompositeFrame(frameInput);
  if (!frame?.columns?.length || !frame?.rows?.length) return null;
  if (frame.columns.length > 2 || frame.rows.length > 2) return null;

  const opened = computeOpenings(frame);
  if (!opened.ok) return null;
  const openingById = new Map(opened.openings.map((opening) => [opening.id, opening]));
  const placements = Object.values(frame.placements || {}).filter(
    (placement) => placement?.productId && openingById.has(placement.openingId)
  );
  if (!placements.length || placements.length !== opened.openings.length) return null;

  const doors = placements.filter((placement) => isDoorProductId(placement.productId));
  if (doors.length !== 1) return null;
  const fixes = placements.filter((placement) => placement !== doors[0]);
  if (!fixes.every((placement) => isFixeProductId(placement.productId))) return null;

  const door = doors[0];
  const doorOpening = openingById.get(door.openingId);
  const bottomRow = frame.rows.length - 1;
  if (doorOpening.rMin !== bottomRow || doorOpening.rMax !== bottomRow || doorOpening.cMin !== doorOpening.cMax) {
    return null;
  }

  let tierce = null;
  let imposte = null;
  for (const placement of fixes) {
    const opening = openingById.get(placement.openingId);
    const besideDoor =
      opening.rMin === bottomRow &&
      opening.rMax === bottomRow &&
      opening.cMin === opening.cMax &&
      opening.cMin !== doorOpening.cMin;
    const aboveAll =
      bottomRow === 1 &&
      opening.rMin === 0 &&
      opening.rMax === 0 &&
      opening.cMin === 0 &&
      opening.cMax === frame.columns.length - 1;
    if (besideDoor && !tierce) tierce = { placement, opening };
    else if (aboveAll && !imposte) imposte = { placement, opening };
    else return null;
  }
  if (frame.rows.length === 2 && !imposte) return null;
  if (frame.columns.length === 2 && !tierce) return null;

  const material = /-alu$/i.test(door.productId) ? 'alu' : 'pvc';
  const tierceSide = tierce ? (tierce.opening.cMin < doorOpening.cMin ? 'left' : 'right') : null;
  return {
    door,
    doorOpening,
    tierce: tierce?.placement || null,
    imposte: imposte?.placement || null,
    doorWidthMm: doorOpening.wMm,
    doorHeightMm: doorOpening.hMm,
    tierceWidthMm: tierce ? tierce.opening.wMm : 0,
    imposteHeightMm: imposte ? imposte.opening.hMm : 0,
    tierceSide,
    overallWidthMm: frame.overallWidthMm,
    overallHeightMm: frame.overallHeightMm,
    material,
    presetId: getDoorCompositePresetId({ tierce: Boolean(tierce), imposte: Boolean(imposte), material }),
  };
}

/* ------------------------------------------------------------------------- */
/* Article du panier                                                         */
/* ------------------------------------------------------------------------- */

/**
 * L'article du panier d'une porte avec parties fixes, fabriqué comme le
 * constructeur de composés le ferait (ProductSelector, mode composé), plus le
 * résumé `doorComposite`. Partagé par le formulaire et l'import des demandes.
 *
 * @returns {{ item: object, pricing: object, frame: object } | null}
 *   `pricing` = getCompositeFramePricing(frame) : `totalPrice` null quand une
 *   partie est hors grille (l'appelant décide de forcer au tarif de repli).
 */
export function buildDoorCompositeCartItem({
  id,
  productId,
  doorWidthMm,
  doorHeightMm,
  tierceWidthMm,
  imposteHeightMm,
  tierceSide = 'right',
  material,
  doorOptions = {},
  fixesGlazingId = null,
  colorOptionId = 'blanc',
  rawColorState = null,
  quantity = 1,
  includePose = false,
  posePriceOverride = null,
  remise = 0,
  netAdjustmentMode = 'margin',
  netMarginWanted = 0,
  netDiscountWanted = 0,
  repere = '',
  showThermalData,
  manualUd = null,
  panelChoice = null,
  forceOutOfGrid = false,
  idFactory,
} = {}) {
  const product = getProductById(productId);
  const preset = product?.doorComposite;
  if (!product || !preset) return null;
  const resolvedMaterial = material === 'alu' || material === 'pvc' ? material : product.material || 'pvc';
  const resolvedProductId = getMaterialVariantId(product.id, resolvedMaterial);

  const tierceW = preset.tierce ? positiveInt(tierceWidthMm, DOOR_COMPOSITE_DEFAULTS.tierceWidthMm) : 0;
  const imposteH = preset.imposte ? positiveInt(imposteHeightMm, DOOR_COMPOSITE_DEFAULTS.imposteHeightMm) : 0;
  const panneauDecoratif = Boolean(doorOptions.panneauDecoratif);
  const doorGlazingId = doorOptions.glazingId || getDefaultGlazingId(resolvedMaterial);
  // Parties fixes : vitrage choisi, sinon celui de la porte vitrée, sinon le
  // vitrage standard du matériau (porte à panneau décoratif).
  const fixeGlazingId = fixesGlazingId || (!panneauDecoratif && doorOptions.glazingId) || getDefaultGlazingId(resolvedMaterial);

  const frame = buildDoorCompositeFrame({
    doorWidthMm,
    doorHeightMm,
    tierceWidthMm: tierceW,
    imposteHeightMm: imposteH,
    tierceSide,
    material: resolvedMaterial,
    doorOptions: {
      ...doorOptions,
      panneauDecoratif,
      glazingId: doorGlazingId,
      ...(panelChoice ? { panelChoice } : {}),
    },
    fixeOptions: { glazingId: fixeGlazingId },
    colorOptionId,
    rawColorState,
    idFactory,
  });
  if (!frame) return null;

  const pricing = getCompositeFramePricing(frame);
  const unitPrice = forceOutOfGrid ? pricing.forcedTotalPrice : pricing.totalPrice;
  const modules = buildCompositeCartModules(frame);
  const doorProduct = getProductById(getMaterialVariantId(DOOR_BASE_PRODUCT_ID, resolvedMaterial));
  const marketing = getMarketingDetails({
    product: doorProduct,
    colorOptionId: colorOptionId || 'blanc',
    colorState: rawColorState || {},
    hasLockingHandle: false,
    panneauDecoratif,
  });
  const colorOption = COLOR_OPTIONS.find((option) => option.id === (colorOptionId || 'blanc')) || COLOR_OPTIONS[0];

  const item = {
    id,
    productId: resolvedProductId,
    productLabel: getProductById(resolvedProductId)?.label || product.label,
    sheetName: 'Châssis composé',
    material: resolvedMaterial,
    widthMm: pricing.totalWidth,
    heightMm: pricing.totalHeight,
    quantity,
    unitPrice: unitPrice ?? 0,
    outOfGridPricing: Boolean(forceOutOfGrid),
    includePose,
    posePriceOverride,
    remise,
    netAdjustmentMode,
    netMarginWanted,
    netDiscountWanted,
    repere,
    showThermalData: showThermalData === undefined ? resolvedMaterial !== 'alu' : Boolean(showThermalData),
    isComposite: true,
    compositeFrame: frame,
    doorComposite: summarizeDoorComposite({
      doorWidthMm,
      doorHeightMm,
      tierceWidthMm: tierceW,
      imposteHeightMm: imposteH,
      tierceSide,
    }),
    voletMonobloc: false,
    voletMonoblocManoeuvre: 'manuel',
    voletMonoblocCouleur: '',
    voletMonoblocSeparate: false,
    voletMonoblocPriceOverride: null,
    modules,
    modulePricing: modules,
    // Repères de la porte au niveau de la ligne (panier, TVA, signature).
    panneauDecoratif,
    panelChoice: panneauDecoratif ? panelChoice || null : null,
    manualUd: Number.isFinite(manualUd) ? manualUd : null,
    colorOption,
    rawColorState: rawColorState || null,
    marketingBase: marketing.marketingBase,
    marketingFinition: marketing.marketingFinition,
    svgColor: marketing.svgColor,
  };
  const thermal = getItemThermalMetrics(item);
  return {
    item: { ...item, thermalUw: thermal?.thermalUw ?? null, thermalSw: thermal?.thermalSw ?? null },
    pricing,
    frame,
  };
}
