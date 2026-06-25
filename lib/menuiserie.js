import {
  PANEL_SANDWICH_GLAZING_ID,
  isOpaqueFilling,
} from '@/lib/glazing';
import {
  getProductById,
  getProductBySheetName,
  normalizeSheetName,
} from '@/lib/products';
import {
  getHandleHeightFraction,
  normalizeHandleHeightMm,
} from '@/lib/handle-height';

const FENETRE_1V = 'Fen\u00eatre 1V';
const FENETRE_2V = 'Fen\u00eatre 2V';
const FENETRE_3V = 'Fen\u00eatre 3V';
const FENETRE_4V = 'Fen\u00eatre 4V';
const FENETRE_2V1F = 'Fen\u00eatre 2V+1F';
const FENETRE_2V2F = 'Fen\u00eatre 2V+2F';
const FENETRE_FIXE = 'Fen\u00eatre Fixe';
const FENETRE_SOUFFLET = 'Fen\u00eatre Soufflet';
const PORTE_FENETRE_1V = 'Porte-Fen\u00eatre 1V';
const PORTE_FENETRE_2V = 'Porte-Fen\u00eatre 2V';
const PORTE_FENETRE_2V1F = 'Porte-Fen\u00eatre 2V+1F';
const PORTE_FENETRE_2V2F = 'Porte-Fen\u00eatre 2V+2F';
const COULISSANT_2V2R = 'Coulissant 2 vantaux 2 rails';
const COULISSANT_3V = 'Coulissant 3 vantaux';
const COULISSANT_4V = 'Coulissant 4 vantaux';
const GALANDAGE_1V = 'Galandage 1 vantail';
const GALANDAGE_2V = 'Galandage 2 vantaux';
const GALANDAGE_3V = 'Galandage 3 vantaux';
const GALANDAGE_4V = 'Galandage 4 vantaux';

const toDimension = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toCount = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const applySashOptions = (sashes, sashOptions) => {
  if (!sashOptions) return sashes;

  return sashes.map((sash, index) => {
    const opts = sashOptions[index];
    if (!opts) return sash;

    const nextSash = { ...sash };
    if (opts.ob && !nextSash.symbols.includes('triangle-up')) {
      nextSash.symbols = [...nextSash.symbols, 'triangle-up'];
    }
    if (opts.vent) {
      nextSash.hasVentilation = true;
    }
    return nextSash;
  });
};

const applyOpeningDirection = (sashes, openingDirection) => {
  if (openingDirection !== 'inverse') return sashes;

  return sashes.slice().reverse().map((sash) => {
    const nextSash = { ...sash };

    if (nextSash.handle === 'left') nextSash.handle = 'right';
    else if (nextSash.handle === 'right') nextSash.handle = 'left';

    nextSash.symbols = nextSash.symbols.map((symbol) => {
      if (symbol === 'triangle-left') return 'triangle-right';
      if (symbol === 'triangle-right') return 'triangle-left';
      if (symbol === 'arrow-left') return 'arrow-right';
      if (symbol === 'arrow-right-outline') return 'arrow-left-outline';
      return symbol;
    });

    return nextSash;
  });
};

const resolveSashes = (sheetName, options) => {
  const resolvedSheetName = normalizeSheetName(sheetName);
  if (!resolvedSheetName) return [];

  if (resolvedSheetName.startsWith('Porte Entr\u00e9e')) {
    return [{ ratio: 1, symbols: ['triangle-right'], handle: 'right' }];
  }

  if (resolvedSheetName === FENETRE_1V || resolvedSheetName === PORTE_FENETRE_1V) {
    return [{ ratio: 1, symbols: ['triangle-left'], handle: 'left' }];
  }

  if (resolvedSheetName === FENETRE_2V || resolvedSheetName === PORTE_FENETRE_2V) {
    return [
      { ratio: 0.5, symbols: ['triangle-right'], handle: null },
      { ratio: 0.5, symbols: ['triangle-left'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === FENETRE_3V) {
    return [
      { ratio: 0.33, symbols: ['triangle-right'], handle: null },
      { ratio: 0.33, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === FENETRE_4V) {
    return [
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === FENETRE_2V1F || resolvedSheetName === PORTE_FENETRE_2V1F) {
    return [
      { ratio: 0.33, symbols: [], handle: null },
      { ratio: 0.33, symbols: ['triangle-right'], handle: null },
      { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === FENETRE_2V2F || resolvedSheetName === PORTE_FENETRE_2V2F) {
    return [
      { ratio: 0.25, symbols: [], handle: null },
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.25, symbols: [], handle: null },
    ];
  }

  if (resolvedSheetName === FENETRE_FIXE) {
    return [{ ratio: 1, symbols: [], handle: null }];
  }

  if (resolvedSheetName === FENETRE_SOUFFLET) {
    return [{ ratio: 1, symbols: ['triangle-up'], handle: 'top' }];
  }

  if (resolvedSheetName === COULISSANT_2V2R) {
    return [
      { ratio: 0.5, symbols: ['arrow-right-outline'], handle: 'left' },
      { ratio: 0.5, symbols: ['arrow-left'], handle: 'right' },
    ];
  }

  if (resolvedSheetName === COULISSANT_3V) {
    return [
      { ratio: 1 / 3, symbols: ['arrow-right-outline'], handle: 'left' },
      { ratio: 1 / 3, symbols: ['arrow-right'], handle: 'left' },
      { ratio: 1 / 3, symbols: ['arrow-left'], handle: 'right' },
    ];
  }

  if (resolvedSheetName === COULISSANT_4V) {
    return [
      { ratio: 0.25, symbols: ['arrow-right-outline'], handle: 'left' },
      { ratio: 0.25, symbols: ['arrow-right'], handle: 'left' },
      { ratio: 0.25, symbols: ['arrow-left'], handle: 'right' },
      { ratio: 0.25, symbols: ['arrow-left-outline'], handle: 'right' },
    ];
  }

  // Galandage : les vantaux s'escamotent dans la cloison (flèches vers les côtés).
  if (resolvedSheetName === GALANDAGE_1V) {
    return [{ ratio: 1, symbols: ['arrow-right'], handle: 'left' }];
  }

  if (resolvedSheetName === GALANDAGE_2V) {
    return [
      { ratio: 0.5, symbols: ['arrow-left'], handle: 'right' },
      { ratio: 0.5, symbols: ['arrow-right'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === GALANDAGE_3V) {
    return [
      { ratio: 1 / 3, symbols: ['arrow-left'], handle: 'right' },
      { ratio: 1 / 3, symbols: ['arrow-right'], handle: 'left' },
      { ratio: 1 / 3, symbols: ['arrow-right-outline'], handle: 'left' },
    ];
  }

  if (resolvedSheetName === GALANDAGE_4V) {
    return [
      { ratio: 0.25, symbols: ['arrow-left-outline'], handle: 'right' },
      { ratio: 0.25, symbols: ['arrow-left'], handle: 'right' },
      { ratio: 0.25, symbols: ['arrow-right'], handle: 'left' },
      { ratio: 0.25, symbols: ['arrow-right-outline'], handle: 'left' },
    ];
  }

  return [];
};

export const buildMenuiserieConfig = ({ sheetName, width, height, options = {} }) => {
  const resolvedSheetName = normalizeSheetName(sheetName);
  if (!resolvedSheetName) return null;

  const resolvedWidth = toDimension(width, 1200);
  const resolvedHeight = toDimension(height, 1250);
  const type = resolvedSheetName.startsWith('Volet')
    ? 'volet'
    : resolvedSheetName.includes('Coulissant') ||
        resolvedSheetName.includes('Galandage')
      ? 'coulissant'
      : 'frappe';

  // La géométrie (vantaux, symboles) est identique en PVC et en aluminium :
  // on retire le suffixe « ALU » pour retrouver le gabarit de référence.
  const geometrySheetName = resolvedSheetName.replace(/\s*ALU\s*$/i, '');

  let sashes = resolveSashes(geometrySheetName, options);
  let panelType = null;
  let solarPanel = false;

  if (type === 'volet') {
    solarPanel = options.productId === 'volet-solaire';
  } else if (resolvedSheetName.startsWith('Porte Entr\u00e9e') && options.panneauDecoratif) {
    panelType = 'deco';
  } else if (
    options.glazingId === PANEL_SANDWICH_GLAZING_ID ||
    isOpaqueFilling(options.glazingId)
  ) {
    panelType = 'sandwich';
  }

  sashes = applySashOptions(sashes, options.sashOptions);
  sashes = applyOpeningDirection(sashes, options.openingDirection);

  // Volet roulant monobloc intégré : uniquement pertinent sur une menuiserie
  // (fenêtre / porte-fenêtre / coulissant), jamais sur un volet seul.
  const voletMonobloc = type !== 'volet' && Boolean(options.voletMonobloc);

  // Hauteur de poignée en mm (depuis le bas) : pertinente sur toutes les
  // menuiseries sauf les volets. Null => poignée centrée.
  const handleHeightMm = type === 'volet' ? null : normalizeHandleHeightMm(options.handleHeightMm);

  return {
    width: resolvedWidth,
    height: resolvedHeight,
    type,
    sashes,
    panelType,
    solarPanel,
    handleHeightMm,
    handleHeightFraction: getHandleHeightFraction(handleHeightMm, resolvedHeight),
    voletMonobloc,
    voletMonoblocManoeuvre: voletMonobloc ? options.voletMonoblocManoeuvre || 'manuel' : null,
    frameColor: options.svgColor || '#FFFFFF',
    sousBassement: options.hasSousBassement ? options.sousBassementHeight : 0,
    petitsBoisH: toCount(options.petitsBoisH),
    petitsBoisV: toCount(
      options.petitsBoisV ?? (options.petitsBoisH == null ? options.petitsBois : 0)
    ),
  };
};

export const buildCompositeModuleConfig = ({ module, height, options = {} }) => {
  // Repli sur un châssis FIXE (sans poignée) si le produit n'est pas résolu :
  // une cellule indéterminée ne doit jamais afficher de poignée.
  const product =
    getProductById(module?.productId) ||
    getProductBySheetName(module?.sheetName) ||
    getProductById('fenetre-fixe');

  return buildMenuiserieConfig({
    sheetName: product?.sheet,
    width: module?.widthMm ?? module?.largeur,
    height: module?.heightMm ?? height,
    options: {
      ...module?.options,
      ...options,
      productId: product?.id,
      svgColor: options.svgColor,
      panneauDecoratif:
        module?.options?.panneauDecoratif ?? options.panneauDecoratif,
      hasSousBassement:
        module?.options?.hasSousBassement ?? options.hasSousBassement,
      sousBassementHeight:
        module?.options?.sousBassementHeight ?? options.sousBassementHeight,
      sashOptions: module?.options?.sashOptions ?? options.sashOptions,
      openingDirection:
        module?.options?.openingDirection ?? options.openingDirection,
      handleHeightMm: module?.options?.handleHeightMm ?? options.handleHeightMm,
    },
  });
};
