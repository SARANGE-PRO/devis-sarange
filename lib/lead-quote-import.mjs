/**
 * lead-quote-import.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Une demande du configurateur du site (`project_json`, relayée par le script
 * Google à /api/leads) devient un devis brouillon : une ligne de panier par
 * menuiserie, fabriquée EXACTEMENT comme le sélecteur de produits la fabrique
 * (components/ProductSelector.jsx, handleAddToCart), pour que le bureau ouvre
 * le devis, vérifie, ajuste et envoie, sans ressaisir.
 *
 * Ce que porte une ligne du site (src/features/configurateur/payload.js, côté
 * site) : familleId, quantity, title (la phrase du client), productId
 * (référence de ce catalogue, ou 'custom-product'), glazingId (tarif Riou),
 * colorOptionId, couleur (libellé), widthMm / heightMm, horsCatalogue,
 * designation (lignes libres), notes[], options { oscilloBattant,
 * grilleVentilation, cintre, petitsBois, petitsBoisH, petitsBoisV,
 * petitsBoisType, tierce, tierceWidthMm, imposte, imposteHeightMm }, voletLie
 * { manoeuvre }, velux { opening, finish, sizeCode, range, flashing,
 * accessory }, panneau, extraLines ['volet-box-domotique'], photoCount.
 *
 * Règles :
 *   - le prix vient de la grille (getPriceForMm) comme au bureau ; sans cotes
 *     ou hors grille, la ligne existe quand même, à 0 ou au tarif de repli,
 *     et une note le dit ;
 *   - rien n'est deviné : panneau de porte, tierce, imposte, cintrage, pièce
 *     détachée, Velux restent des notes ou des lignes libres à chiffrer ;
 *   - les notes du site (`leadNotes`) et la phrase du client (`leadTitle`)
 *     voyagent sur la ligne, affichées dans le panier, jamais sur le PDF.
 *
 * Module pur (imports du catalogue seulement) : testable par le runner Node
 * avec le chargeur d'alias (tests/lead-quote-import.test.mjs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  COLOR_OPTIONS,
  SPARE_PART_PRODUCT_IDS,
  VOLET_COLOR_OPTIONS,
  createDefaultColorState,
  getDefaultProductVariant,
  getFallbackPriceForMm,
  getItemThermalMetrics,
  getPriceForMm,
  getProductById,
  getProductVariants,
} from '@/lib/products';
import { getDefaultGlazingId, getSelectedGlazing, isGlazedProduct } from '@/lib/glazing';
import { normalizePetitsBoisTypeId } from '@/lib/petits-bois.mjs';
import { buildMenuiserieConfig } from '@/lib/menuiserie';
import { createVeluxConfiguration, formatVeluxThermal } from '@/lib/velux-config';
import { getClientFullName } from '@/lib/client-cloud';
import { getMarketingDetails } from '@/lib/marketing-details.mjs';

export const LEAD_SOURCE = 'configurateur';
export const BOX_DOMOTIQUE_PRODUCT_ID = 'volet-box-domotique';

const VOLET_PRODUCT_MANOEUVRE = Object.freeze({
  'volet-solaire': 'SOLAIRE',
  'volet-radio': 'RADIO',
  'volet-filaire': 'FILAIRE',
  'volet-manuel': 'MANUEL',
});

/** Manœuvre du volet lié (site) → manœuvre du volet monobloc (ce catalogue). */
const MONOBLOC_MANOEUVRE = Object.freeze({
  SOLAIRE: 'solaire',
  RADIO: 'radio',
  FILAIRE: 'filaire',
  MANUEL: 'manuel',
});

/** Box domotique : la marque suit la motorisation des volets demandés. */
const BOX_VARIANT_BY_MANOEUVRE = Object.freeze({
  SOLAIRE: 'box_domotique_gaposa_rollappx',
  RADIO: 'box_domotique_cherubini_metahome',
});

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const toQuantity = (value) => Math.max(1, Math.min(99, toInt(value) || 1));
const text = (value, max = 400) => String(value ?? '').trim().slice(0, max);
const notesOf = (line) =>
  (Array.isArray(line?.notes) ? line.notes : []).map((note) => text(note, 200)).filter(Boolean);

/** JSON à clés triées : deux objets égaux donnent la même chaîne, quel que soit l'ordre des champs. */
export const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

/* ------------------------------------------------------------------------- */
/* Coloration                                                                */
/* ------------------------------------------------------------------------- */

/**
 * État de couleur du formulaire à partir de la catégorie tarifaire et du
 * libellé choisi sur le site (« Gris 7016 2 faces », « Blanc 9016 int / Chêne
 * doré ext », « Noir 2100 sablé », « autre : bleu »…).
 */
export const colorStateFromLead = (colorOptionId, couleur = '') => {
  const label = String(couleur || '').trim();
  const l = label.toLowerCase();
  if (colorOptionId === 'bicoloration') {
    if (/7016|anthracite/.test(l)) return createDefaultColorState({ bicoType: 'standard_7016' });
    if (/ch[eê]ne/.test(l)) return createDefaultColorState({ bicoType: 'standard_chene' });
    return createDefaultColorState({
      bicoType: 'custom',
      customColorIntText: 'Blanc',
      customColorExtText: label.replace(/^blanc[^/]*\/\s*/i, '').replace(/\s*ext$/i, '') || 'A definir',
    });
  }
  if (colorOptionId === 'coloration-2f') {
    if (/7016|anthracite/.test(l)) return createDefaultColorState({ color2fType: 'standard_7016' });
    if (/ch[eê]ne/.test(l)) return createDefaultColorState({ color2fType: 'standard_chene' });
    return createDefaultColorState({
      color2fType: 'custom',
      customColor2fText: label.replace(/^autre\s*:\s*/i, '') || 'A definir',
      customColor2fHex: /noir/.test(l) ? '#1A1A1A' : /anodis/.test(l) ? '#C0C0C0' : '#4A4A4A',
    });
  }
  return createDefaultColorState();
};

/* ------------------------------------------------------------------------- */
/* Lignes                                                                    */
/* ------------------------------------------------------------------------- */

/** Vantail principal (celui de la poignée) : c'est lui qui porte l'OB et la grille. */
export const principalSashIndex = (sheetName, widthMm, heightMm) => {
  const config = buildMenuiserieConfig({
    sheetName,
    width: widthMm || 1200,
    height: heightMm || 1250,
  });
  const sashes = Array.isArray(config?.sashes) ? config.sashes : [];
  const index = sashes.findIndex((sash) => sash?.handle);
  return index >= 0 ? index : 0;
};

/** Le produit « cintré » du site vise le produit de base : le cintrage se saisit au bureau (Formes spéciales). */
const baseProductId = (productId) => String(productId || '').replace(/-cintre(-alu)?$/, '$1');

const buildCustomItem = (line, ctx, extraNotes = []) => {
  const widthMm = toInt(line.widthMm);
  const heightMm = toInt(line.heightMm);
  const hasDims = widthMm > 0 && heightMm > 0;
  const designation = text(line.designation || line.title || 'Demande du site', 400);
  return {
    id: ctx.id,
    productId: 'custom-product',
    productLabel: designation.split('\n')[0].slice(0, 120),
    customDescription: designation,
    customPrice: 0,
    customImage: null,
    customHasDimensions: hasDims,
    widthMm: hasDims ? widthMm : 0,
    heightMm: hasDims ? heightMm : 0,
    repere: '',
    quantity: toQuantity(line.quantity),
    unitPrice: 0,
    includePose: false,
    customPoseHt: 0,
    remise: 0,
    netMarginWanted: 0,
    netDiscountWanted: 0,
    leadTitle: text(line.title, 300),
    leadNotes: [...extraNotes, ...notesOf(line), 'Prix HT à saisir'],
  };
};

const buildVeluxItem = (line, ctx) => {
  const selection = line.velux || {};
  const configuration = createVeluxConfiguration({
    opening: selection.opening,
    finish: selection.finish,
    sizeCode: selection.sizeCode,
    range: selection.range,
    flashing: selection.flashing,
    accessory: selection.accessory,
  });
  if (!configuration) {
    const known = ['opening', 'finish', 'sizeCode', 'range', 'flashing', 'accessory']
      .map((key) => (selection[key] && selection[key] !== '?' ? `${key} : ${selection[key]}` : null))
      .filter(Boolean);
    return buildCustomItem(
      { ...line, designation: 'Fenêtre de toit Velux (configuration à compléter)' },
      ctx,
      [`Velux : ${known.join(', ') || 'rien de précisé'}, taille à lire sur la photo de l'étiquette`]
    );
  }

  const { labels } = configuration;
  // Même description que le configurateur Velux de l'app (handleVeluxValidate).
  const detailLines = [
    configuration.designation,
    `Type d'ouverture : ${labels.opening}`,
    `Finition intérieure : ${labels.finish} (${labels.finishCommercialName})`,
    `Dimensions : ${labels.size}`,
    `Gamme : ${labels.range}`,
    `Raccord d'étanchéité : ${labels.flashing}`,
  ];
  if (configuration.accessory !== 'aucun') detailLines.push(`Équipement : ${labels.accessory}`);
  const thermalLine = formatVeluxThermal(configuration.range);
  if (thermalLine) detailLines.push(thermalLine);

  return {
    id: ctx.id,
    productId: 'custom-product',
    productLabel: configuration.designation,
    customDescription: detailLines.join('\n'),
    customPrice: 0,
    customImage: configuration.imageSrc,
    customHasDimensions: true,
    widthMm: configuration.widthCm * 10,
    heightMm: configuration.heightCm * 10,
    repere: '',
    quantity: toQuantity(line.quantity),
    unitPrice: 0,
    includePose: false,
    customPoseHt: 0,
    veluxRange: configuration.range,
    veluxPrefix: configuration.prefix,
    thermalUw: configuration.thermalUw,
    thermalSw: configuration.thermalSw,
    remise: 0,
    netMarginWanted: 0,
    netDiscountWanted: 0,
    leadTitle: text(line.title, 300),
    leadNotes: [...notesOf(line), 'Prix HT à saisir', ctx.includePose ? 'Pose demandée : prix de pose à saisir' : 'Fourniture seule'],
  };
};

const buildCatalogItem = (line, ctx) => {
  const productId = baseProductId(line.productId);
  const product = getProductById(productId);
  if (!product) {
    return buildCustomItem(line, ctx, [`Référence « ${line.productId} » inconnue du catalogue`]);
  }

  const isVolet = product.sheet.startsWith('Volet');
  const isPorte = product.sheet.startsWith('Porte Entr');
  const isAlu = product.material === 'alu' || /\bALU\b/i.test(product.sheet);
  const widthMm = toInt(line.widthMm);
  const heightMm = toInt(line.heightMm);
  const hasDims = widthMm > 0 && heightMm > 0;
  const notes = notesOf(line);

  // Prix : la grille, sinon le tarif de repli hors grille (double validation
  // au bureau remplacée par une note), sinon 0 en attendant les cotes.
  let priceData = hasDims ? getPriceForMm(product.sheet, heightMm, widthMm) : null;
  let outOfGridPricing = false;
  if (hasDims && !priceData) {
    priceData = getFallbackPriceForMm(product.sheet, heightMm, widthMm);
    outOfGridPricing = Boolean(priceData);
  }
  const unitPrice = Number(priceData?.price || 0);
  if (!hasDims) notes.push('Cotes à relever : prix à calculer après métré');
  else if (outOfGridPricing) notes.push('Cotes hors grille : prix de repli, à vérifier');
  else if (!unitPrice) notes.push('Pas de prix en grille pour ces cotes : à chiffrer');

  const colorOptions = isVolet ? VOLET_COLOR_OPTIONS : COLOR_OPTIONS;
  const colorOption =
    colorOptions.find((option) => option.id === line.colorOptionId) || colorOptions[0];
  const rawColorState = colorStateFromLead(colorOption.id, line.couleur);

  const options = line.options || {};
  const petitsBois =
    !isVolet && options.petitsBois
      ? {
          petitsBoisH: toInt(options.petitsBoisH),
          petitsBoisV: toInt(options.petitsBoisV),
          petitsBoisType: normalizePetitsBoisTypeId(options.petitsBoisType),
        }
      : { petitsBoisH: 0, petitsBoisV: 0, petitsBoisType: normalizePetitsBoisTypeId(undefined) };

  // Une porte sans panneau décoratif est vitrée pour le formulaire (panneau
  // sandwich ou vitrage) : même règle qu'au bureau.
  const isGlazed = !isVolet && (isGlazedProduct(product) || isPorte);
  const material = isAlu ? 'alu' : 'pvc';
  let glazingOption = null;
  if (isGlazed) {
    glazingOption = line.glazingId ? getSelectedGlazing(line.glazingId) : null;
    if (line.glazingId && !glazingOption) notes.push(`Vitrage « ${line.glazingId} » inconnu : vitrage standard appliqué`);
    if (!glazingOption) glazingOption = getSelectedGlazing(getDefaultGlazingId(material)) || null;
  }

  const sashOptions = {};
  if (!isVolet && (options.oscilloBattant || options.grilleVentilation)) {
    sashOptions[principalSashIndex(product.sheet, widthMm, heightMm)] = {
      ob: Boolean(options.oscilloBattant),
      vent: Boolean(options.grilleVentilation),
    };
  }

  const voletLie = !isVolet && line.voletLie && typeof line.voletLie === 'object' ? line.voletLie : null;
  if (line.panneau) notes.push(`Panneau choisi sur le site : ${text(line.panneau, 120)} (à sélectionner au catalogue)`);
  if (/-cintre/.test(String(line.productId || ''))) notes.push('Forme arrondie demandée : à passer en « Formes spéciales »');

  const marketing = getMarketingDetails({
    product,
    colorOptionId: colorOption.id,
    colorState: rawColorState,
    hasLockingHandle: false,
    panneauDecoratif: false,
  });

  const item = {
    id: ctx.id,
    productId,
    productLabel: product.label,
    sheetName: product.sheet,
    material: product.material ?? null,
    widthMm,
    heightMm,
    billedHeightCm: priceData?.billedHeight ?? null,
    billedWidthCm: priceData?.billedWidth ?? null,
    quantity: toQuantity(line.quantity),
    unitPrice,
    outOfGridPricing,
    colorOption,
    ...petitsBois,
    includePose: ctx.includePose,
    posePriceOverride: null,
    remise: 0,
    netAdjustmentMode: 'margin',
    netMarginWanted: 0,
    netDiscountWanted: 0,
    panneauDecoratif: false,
    manualUd: null,
    hasSousBassement: false,
    sousBassementHeight: 0,
    hasTraverse: false,
    traverseHeights: [],
    traverseHeight: 0,
    sashOptions,
    openingDirection: 'standard',
    glazingOption,
    glazingExtra: 0,
    marketingBase: marketing.marketingBase,
    marketingFinition: marketing.marketingFinition,
    svgColor: marketing.svgColor,
    hasLockingHandle: false,
    handleHeightMm: null,
    allegeHeightMm: null,
    voletMonobloc: Boolean(voletLie),
    voletMonoblocManoeuvre: voletLie ? MONOBLOC_MANOEUVRE[voletLie.manoeuvre] || 'manuel' : 'manuel',
    voletMonoblocCouleur: '',
    rawColorState,
    repere: '',
    showThermalData: !isAlu,
    leadTitle: text(line.title, 300),
    leadNotes: notes,
  };
  const thermal = hasDims ? getItemThermalMetrics(item) : null;
  return {
    ...item,
    thermalUw: thermal?.thermalUw ?? null,
    thermalSw: thermal?.thermalSw ?? null,
  };
};

const buildBoxItem = (ctx, manoeuvre) => {
  const product = getProductById(BOX_DOMOTIQUE_PRODUCT_ID);
  if (!product) return null;
  const wantedId = BOX_VARIANT_BY_MANOEUVRE[manoeuvre];
  const variant =
    (wantedId && getProductVariants(product).find((entry) => entry.id === wantedId)) ||
    getDefaultProductVariant(product);
  if (!variant) return null;
  // Même forme qu'un produit à prix fixe ajouté au bureau (handleAddToCart).
  return {
    id: ctx.id,
    productId: product.id,
    productVariantId: variant.id,
    productLabel: variant.label,
    sheetName: product.sheet,
    widthMm: 0,
    heightMm: 0,
    billedHeightCm: null,
    billedWidthCm: null,
    quantity: 1,
    unitPrice: variant.priceHt,
    includePose: false,
    remise: 0,
    netAdjustmentMode: 'margin',
    netMarginWanted: 0,
    netDiscountWanted: 0,
    customDescription: variant.designation,
    customDescriptionManual: false,
    customImage: variant.imageSrc,
    hasDimensions: false,
    dimensionLabel: 'Accessoire',
    repere: '',
    showThermalData: false,
    leadTitle: 'Pilotage des volets depuis le smartphone',
    leadNotes: wantedId ? [] : ['Marque de la box à confirmer selon les moteurs'],
  };
};

/* ------------------------------------------------------------------------- */
/* Demande complète                                                          */
/* ------------------------------------------------------------------------- */

/** La pose est demandée sauf « Fourniture seule ». */
export const leadIncludesPose = (project) => !/seule/i.test(String(project?.pose || ''));

/**
 * Les lignes de panier d'une demande du site, dans l'ordre de la demande, la
 * box domotique (une seule) en dernier.
 * @param {object} project  `project_json` relayé par le script Google
 * @param {{now?: number}} [options]  horodatage des identifiants de ligne
 * @returns {object[]}
 */
export function buildLeadCartItems(project, { now = Date.now(), leadId = '' } = {}) {
  const lines = Array.isArray(project?.items) ? project.items : [];
  const includePose = leadIncludesPose(project);
  let sequence = 0;
  const nextId = () => `lead-${now}-${(sequence += 1)}`;
  const normalizedLeadId = String(leadId || project?.leadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

  const cartItems = [];
  let boxWanted = false;
  let boxManoeuvre = null;
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const ctx = { id: nextId(), includePose };
    const productId = String(line.productId || '');
    let item;
    if (productId === 'velux-configurateur') item = buildVeluxItem(line, ctx);
    else if (productId === 'custom-product' || line.horsCatalogue) item = buildCustomItem(line, ctx);
    else if (SPARE_PART_PRODUCT_IDS.has(productId) || /^piece-/.test(productId)) {
      item = buildCustomItem(line, ctx, ['Pièce détachée : référence et prix à choisir dans « Pièces détachées »']);
    } else item = buildCatalogItem(line, ctx);
    // Les photos de la ligne, par identifiant de dépôt (site : photos.js),
    // quand le script Google les a relayées ; sinon attachLeadPhotos() les
    // retrouve toutes par le leadId.
    const photoIds = (Array.isArray(line.photos) ? line.photos : [])
      .map((photo) => String(photo?.uploadId || '').trim())
      .filter((id) => /^lp_[a-f0-9]{32}$/.test(id));
    const declared = toInt(line.photoCount);
    if (declared > photoIds.length && photoIds.length > 0) {
      item.leadNotes = [...item.leadNotes, `${declared - photoIds.length} photo(s) non transmise(s) par le site`];
    }
    item.leadId = normalizedLeadId || null;
    item.leadPhotos = photoIds;
    cartItems.push(item);

    if ((Array.isArray(line.extraLines) ? line.extraLines : []).includes(BOX_DOMOTIQUE_PRODUCT_ID)) {
      boxWanted = true;
      boxManoeuvre = boxManoeuvre || line.voletLie?.manoeuvre || VOLET_PRODUCT_MANOEUVRE[productId] || null;
    }
  }
  if (boxWanted) {
    const box = buildBoxItem({ id: nextId() }, boxManoeuvre);
    if (box) cartItems.push({ ...box, leadId: normalizedLeadId || null, leadPhotos: [] });
  }
  return cartItems;
}

/**
 * Rapproche les photos reçues dans Storage (lib/lead-photo-service.js) des
 * lignes : celles dont la ligne est connue restent sur leur ligne ; s'il n'y
 * a aucune correspondance (script Google sans `photos`, ou photos envoyées
 * après coup), la première ligne de la demande les montre toutes.
 * @param {object[]} cartItems  lignes de buildLeadCartItems, modifiées en place
 * @param {Array<{uploadId: string}>} storedPhotos
 * @returns {{known: number, orphans: number}}
 */
export function attachLeadPhotos(cartItems, storedPhotos) {
  const stored = new Set((storedPhotos || []).map((photo) => photo.uploadId));
  let known = 0;
  for (const item of cartItems) {
    item.leadPhotos = (item.leadPhotos || []).filter((id) => stored.has(id));
    known += item.leadPhotos.length;
    delete item.leadShowAllPhotos;
  }
  const orphans = stored.size - known;
  if (orphans > 0 && cartItems.length) {
    const first = cartItems.find((item) => item.leadId) || cartItems[0];
    first.leadShowAllPhotos = true;
    if (known === 0) first.leadNotes = [...(first.leadNotes || []), `${stored.size} photo(s) de la demande, toutes menuiseries confondues`];
  }
  return { known, orphans };
}

/** Nombre de photos annoncées par la demande (elles restent à récupérer, lot suivant). */
export const leadPhotoCount = (project) =>
  (Array.isArray(project?.items) ? project.items : []).reduce(
    (sum, line) => sum + (toInt(line?.photoCount) || 0),
    0
  );

/** « Site · Marie Martin » : la demande du site se repère dans la liste des devis. */
export const buildLeadQuoteTitle = (clientData) => {
  const fullName = getClientFullName(clientData);
  return `Site · ${fullName || 'Demande sans nom'}`;
};
