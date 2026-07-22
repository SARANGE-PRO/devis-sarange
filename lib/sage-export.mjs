/**
 * sage-export.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Logique PURE de l'export Sage 50 (onglet Compta).
 *
 * Rôle : transformer un devis (lignes panier + TVA) en « modèle d'export »
 * contrôlé (document + lignes + ventilation TVA + anomalies), puis en fichier
 * CSV importable dans Sage 50 via un import paramétrable. Aucune écriture
 * directe dans Sage, aucune API Sage : uniquement des fichiers.
 *
 * Ce module n'importe AUCUN alias '@/' : les fonctions de calcul métier
 * (calculateItemPrice, computeQuoteTotals, générateur de désignation…) sont
 * INJECTÉES par l'appelant (lib/sage-export-service.js), ce qui le rend
 * testable en isolation par le runner Node du projet — et garantit que les
 * montants exportés sortent du MÊME moteur de calcul que le devis/PDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SAGE_EXPORT_FORMAT_VERSION = 1;
export const COMPTA_SETTINGS_SCHEMA_VERSION = 1;

const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/* ─── Régimes de TVA ─────────────────────────────────────────────────────── */
// Le taux 0 de l'application correspond aujourd'hui à l'AUTOLIQUIDATION
// (art. 283-2 du CGI — cf. mention légale du PDF). Le régime « exonération »
// est prévu pour un vrai 0 % futur : il ne doit jamais être confondu avec
// l'autoliquidation, d'où le réglage `zeroRateRegime`.
export const SAGE_VAT_REGIMES = Object.freeze([
  { id: 'tva-5.5', rate: 5.5, label: 'TVA 5,5 %' },
  { id: 'tva-10', rate: 10, label: 'TVA 10 %' },
  { id: 'tva-20', rate: 20, label: 'TVA 20 %' },
  { id: 'autoliquidation', rate: 0, label: 'Autoliquidation (art. 283-2 CGI)' },
  { id: 'exoneration', rate: 0, label: 'Exonération / TVA 0 %' },
]);

export const getSageVatRegime = (regimeId) =>
  SAGE_VAT_REGIMES.find((regime) => regime.id === regimeId) || null;

/* ─── Natures de ligne ───────────────────────────────────────────────────── */
export const SAGE_LINE_NATURES = Object.freeze({
  fourniture: 'Fourniture',
  pose: 'Pose',
  livraison: 'Livraison',
  metrage: 'Métrage',
  recyclage: 'Recyclage',
  remise: 'Remise',
  autre: 'Autre',
});

/* ─── Statuts d'export ───────────────────────────────────────────────────── */
// Statuts PERSISTÉS sur un enregistrement d'export. Les états « Non préparé »,
// « Prêt à exporter » et « Erreur de validation » sont DÉRIVÉS à l'écran
// (absence d'enregistrement + résultat de la validation) et ne sont pas stockés.
export const SAGE_EXPORT_STATUSES = Object.freeze({
  generated: {
    label: 'À importer dans Sage',
    className: 'bg-blue-100 text-blue-700',
  },
  imported: {
    label: 'Importé dans Sage',
    className: 'bg-green-100 text-green-700',
  },
  cancelled: {
    label: 'Annulé',
    className: 'bg-rose-100 text-rose-700',
  },
  replaced: {
    label: 'Remplacé',
    className: 'bg-slate-100 text-slate-500',
  },
});

export const getSageExportStatusMeta = (status) =>
  SAGE_EXPORT_STATUSES[status] || {
    label: status || 'Inconnu',
    className: 'bg-slate-100 text-slate-500',
  };

// Un export « actif » est celui qui fait foi pour un devis (ni annulé ni remplacé).
export const isActiveSageExportStatus = (status) =>
  status === 'generated' || status === 'imported';

/* ─── Paramètres Compta ──────────────────────────────────────────────────── */
export const DEFAULT_COMPTA_SETTINGS = Object.freeze({
  schemaVersion: COMPTA_SETTINGS_SCHEMA_VERSION,
  // Client provisoire Sage : la pièce est importée sur ce compte puis le vrai
  // client est choisi manuellement dans Sage AVANT toute validation/facturation.
  placeholderClientCode: 'ZZZIMPORT',
  placeholderClientLabel: 'CLIENT À COMPLÉTER',
  pieceType: 'COMMANDE',
  // 'quote' = date d'émission du devis, 'export' = date de génération du fichier.
  dateSource: 'quote',
  dateFormat: 'DD/MM/YYYY',
  // Délai de livraison par défaut en JOURS CALENDAIRES : la date de livraison
  // exportée vers Sage = date de la pièce + ce délai (requise par l'import :
  // « La date de livraison de la ligne client n'est pas renseignée »).
  deliveryDelayDays: 14,
  columnSeparator: ';',
  decimalSeparator: ',',
  // 'windows-1252' (ANSI, attendu par Sage 50), 'utf8' ou 'utf8-bom'.
  encoding: 'windows-1252',
  includeHeaderRow: true,
  // Représentation des pièces. Seul 'sage-e-l' (lignes E/L) existe en v1 ;
  // le champ est prévu pour brancher d'autres layouts sans casser l'existant.
  layout: 'sage-e-l',
  filePrefix: 'SAGE_',
  // Tokens disponibles : {prefix} {numero} {date} {version}
  fileNamePattern: '{prefix}{numero}_v{version}',
  // Limite CONSTATÉE du champ désignation de Sage 50 : 250 caractères (au-delà,
  // Sage tronque lui-même brutalement, en plein mot, et les infos de fin —
  // Uw/Sw notamment — sont perdues). Quand une désignation dépasse, une
  // compression par étapes retire d'abord les détails sans valeur facture
  // (hauteur de poignée, descriptif marketing du profilé…) ; la troncature
  // n'intervient qu'en dernier recours. 0 = illimité (déconseillé avec Sage).
  maxDesignationLength: 250,
  includeTextOnlyLines: true,
  zeroRateRegime: 'autoliquidation',
  // 'block' : un 2e export identique est refusé tant que l'utilisateur ne
  // demande pas explicitement une régénération. 'version' : chaque génération
  // crée une nouvelle version sans blocage (l'historique est conservé).
  duplicateBehavior: 'block',
  // Mode local uniquement par défaut : l'onglet Compta fonctionne sans
  // Firestore (paramètres + historique en localStorage). Quand ce réglage est
  // activé, un MIROIR best-effort est écrit dans Firestore — toute erreur y est
  // interceptée et n'empêche jamais la génération/le téléchargement du CSV.
  firestoreSync: false,
  // Article Sage par régime de TVA (repli commun à toutes les natures).
  vatArticles: Object.freeze({
    'tva-5.5': 'IMP055',
    'tva-10': 'IMP100',
    'tva-20': 'IMP200',
    autoliquidation: 'IMPAUTO',
    exoneration: '',
  }),
  // Surcharges optionnelles par nature de ligne, pour distinguer plus tard
  // fournitures et pose (ex. { pose: { 'tva-10': 'POSE100' } }).
  natureArticles: Object.freeze({}),
});

const sanitizeCode = (value, fallback = '') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const sanitizeText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const sanitizeChoice = (value, choices, fallback) =>
  choices.includes(value) ? value : fallback;

const sanitizeArticleMap = (raw, fallbackMap) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  return SAGE_VAT_REGIMES.reduce((accumulator, regime) => {
    const rawValue = source[regime.id];
    accumulator[regime.id] =
      typeof rawValue === 'string' ? rawValue.trim() : fallbackMap?.[regime.id] || '';
    return accumulator;
  }, {});
};

export const normalizeComptaSettings = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaults = DEFAULT_COMPTA_SETTINGS;

  const natureSource =
    source.natureArticles && typeof source.natureArticles === 'object'
      ? source.natureArticles
      : {};
  const natureArticles = Object.keys(SAGE_LINE_NATURES).reduce((accumulator, nature) => {
    const map = natureSource[nature];
    if (map && typeof map === 'object') {
      const cleaned = sanitizeArticleMap(map, {});
      // On ne conserve que les surcharges réellement renseignées.
      const hasValue = Object.values(cleaned).some(Boolean);
      if (hasValue) accumulator[nature] = cleaned;
    }
    return accumulator;
  }, {});

  const maxDesignationLength = Number.parseInt(source.maxDesignationLength, 10);
  const deliveryDelayDays = Number.parseInt(source.deliveryDelayDays, 10);

  return {
    schemaVersion: COMPTA_SETTINGS_SCHEMA_VERSION,
    placeholderClientCode: sanitizeCode(
      source.placeholderClientCode,
      defaults.placeholderClientCode
    ),
    placeholderClientLabel: sanitizeText(
      source.placeholderClientLabel,
      defaults.placeholderClientLabel
    ),
    pieceType: sanitizeCode(source.pieceType, defaults.pieceType),
    dateSource: sanitizeChoice(source.dateSource, ['quote', 'export'], defaults.dateSource),
    dateFormat: sanitizeText(source.dateFormat, defaults.dateFormat),
    deliveryDelayDays:
      Number.isFinite(deliveryDelayDays) && deliveryDelayDays >= 0 && deliveryDelayDays <= 365
        ? deliveryDelayDays
        : defaults.deliveryDelayDays,
    columnSeparator: sanitizeChoice(source.columnSeparator, [';', ',', '\t'], defaults.columnSeparator),
    decimalSeparator: sanitizeChoice(source.decimalSeparator, [',', '.'], defaults.decimalSeparator),
    encoding: sanitizeChoice(
      source.encoding,
      ['windows-1252', 'utf8', 'utf8-bom'],
      defaults.encoding
    ),
    includeHeaderRow:
      typeof source.includeHeaderRow === 'boolean'
        ? source.includeHeaderRow
        : defaults.includeHeaderRow,
    layout: sanitizeChoice(source.layout, ['sage-e-l'], defaults.layout),
    filePrefix: typeof source.filePrefix === 'string' ? source.filePrefix.trim() : defaults.filePrefix,
    fileNamePattern: sanitizeText(source.fileNamePattern, defaults.fileNamePattern),
    // Vide, 0 ou négatif = choix EXPLICITE d'illimité ; valeur positive
    // appliquée telle quelle (bornée à 1000) ; absente/illisible → défaut 250.
    maxDesignationLength:
      source.maxDesignationLength === '' || source.maxDesignationLength === null
        ? 0
        : Number.isFinite(maxDesignationLength)
          ? maxDesignationLength > 0
            ? Math.min(maxDesignationLength, 1000)
            : 0
          : defaults.maxDesignationLength,
    includeTextOnlyLines:
      typeof source.includeTextOnlyLines === 'boolean'
        ? source.includeTextOnlyLines
        : defaults.includeTextOnlyLines,
    zeroRateRegime: sanitizeChoice(
      source.zeroRateRegime,
      ['autoliquidation', 'exoneration'],
      defaults.zeroRateRegime
    ),
    duplicateBehavior: sanitizeChoice(
      source.duplicateBehavior,
      ['block', 'version'],
      defaults.duplicateBehavior
    ),
    firestoreSync:
      typeof source.firestoreSync === 'boolean' ? source.firestoreSync : defaults.firestoreSync,
    vatArticles: sanitizeArticleMap(source.vatArticles, defaults.vatArticles),
    natureArticles,
  };
};

/* ─── Résolution régime / article ────────────────────────────────────────── */
export const resolveVatRegimeId = (tvaRate, settings) => {
  const rate = Number(tvaRate);
  if (rate === 5.5) return 'tva-5.5';
  if (rate === 10) return 'tva-10';
  if (rate === 20) return 'tva-20';
  if (rate === 0) return settings?.zeroRateRegime === 'exoneration' ? 'exoneration' : 'autoliquidation';
  return null;
};

export const resolveSageArticle = (regimeId, nature, settings) => {
  if (!regimeId) return '';
  const natureOverride = settings?.natureArticles?.[nature]?.[regimeId];
  if (typeof natureOverride === 'string' && natureOverride.trim()) {
    return natureOverride.trim();
  }
  const base = settings?.vatArticles?.[regimeId];
  return typeof base === 'string' ? base.trim() : '';
};

/* ─── Désignation exportée ───────────────────────────────────────────────── */
// Mentions COMMERCIALES de remise retirées de la désignation (le prix exporté
// est déjà NET) : « Remise : -20% (gain -182,03 €) », « Avant remise 910,14 € »
// (prix initial barré) ou une ligne « gain » isolée. RIEN d'autre n'est
// supprimé : toutes les caractéristiques techniques sont conservées.
const DISCOUNT_LINE_PATTERN = /^(remise\s*:|avant remise|gain\s*[-−])/i;

// Aplatissement : part de la désignation complète du devis (customDescription
// ou générateur), retire les mentions de remise, remplace les retours à la
// ligne par des espaces simples et nettoie les espaces multiples. AUCUN
// résumé, AUCUNE reformulation, AUCUNE troncature ici.
export const flattenSageDesignation = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter((line) => line && !DISCOUNT_LINE_PATTERN.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

// Étapes de compression, de la MOINS utile à la plus utile pour une facture.
// Appliquées une à une, uniquement quand la désignation dépasse la limite, en
// s'arrêtant dès que ça tient. Les informations essentielles (repère, type,
// dimensions, finition, vitrage, ventilation, Uw/Sw) ne sont JAMAIS retirées :
// si tout cela ne suffit pas, on retombe sur la troncature (avec avertissement).
// Tolérant aux deux graphies du générateur (tiret « – » ou « - », accents).
const SAGE_DESIGNATION_TRIMS = [
  // 1. Hauteur de pose de la poignée : « – à 600 mm (mi-hauteur) » — sans
  //    incidence sur la facture.
  { pattern: /\s*[–-]\s*à\s*\d+\s*mm\s*(\([^)]*\))?/g, replacement: '' },
  // 2. Descriptif marketing du profilé : « – 5 chambres – renforts acier –
  //    double joint » (bloc entier puis morceaux résiduels).
  {
    pattern: /\s*[–-]\s*5 chambres\s*[–-]\s*renforts acier\s*[–-]\s*double joint/gi,
    replacement: '',
  },
  { pattern: /\s*[–-]\s*double joint/gi, replacement: '' },
  { pattern: /\s*[–-]\s*renforts acier/gi, replacement: '' },
  { pattern: /\s*[–-]\s*5 chambres/gi, replacement: '' },
  // 3. Redondances sans perte de sens.
  { pattern: /Double vitrage isolant/gi, replacement: 'Double vitrage' },
  { pattern: /\s*L\*H\s*mm/g, replacement: ' mm' },
  // 4. Marque de la poignée (l'option « verrouillable à clé » est conservée).
  { pattern: /Poignée Schüco Euro verrouillable/gi, replacement: 'Poignée verrouillable' },
  { pattern: /Poignée Schüco Euro/gi, replacement: 'Poignée' },
];

const cleanCompressedText = (text) =>
  text
    .replace(/(\s*[–-]\s*){2,}/g, ' – ')
    .replace(/\s+/g, ' ')
    .replace(/\s+[–-]\s*$/g, '')
    .trim();

/**
 * Raccourcit une désignation trop longue pour Sage SANS perdre les infos
 * utiles à la facture : les détails secondaires sont retirés par étapes
 * (hauteur de poignée, marketing profilé…) jusqu'à tenir dans la limite ; la
 * troncature « … » n'intervient qu'en dernier recours.
 */
export const compressSageDesignation = (flattened, maxLength = 0) => {
  let text = String(flattened || '');
  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
    return text;
  }

  for (const stage of SAGE_DESIGNATION_TRIMS) {
    text = cleanCompressedText(text.replace(stage.pattern, stage.replacement));
    if (text.length <= maxLength) return text;
  }

  return truncateSageDesignation(text, maxLength);
};

// Troncature : dernier recours de compressSageDesignation, ou limite manuelle.
// Ne concerne que la valeur envoyée dans le CSV Sage — la donnée source reste
// intacte (0 / vide = pas de troncature).
export const truncateSageDesignation = (flattened, maxLength = 0) => {
  const text = String(flattened || '');
  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trim()}…`;
};

export const simplifySageDesignation = (text, maxLength = 0) =>
  truncateSageDesignation(flattenSageDesignation(text), maxLength);

/* ─── Formats CSV ────────────────────────────────────────────────────────── */
/**
 * Parse STRICT d'une date (Date, Timestamp Firestore, chaîne, nombre).
 * Renvoie `null` si la valeur est absente ou illisible — JAMAIS de repli
 * silencieux sur la date du jour : une pièce sans date valide doit être
 * bloquée avant export, pas datée d'aujourd'hui à l'insu de l'utilisateur.
 */
export const parseSageDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const asDate =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
};

/**
 * Ajoute des jours CALENDAIRES à une date (passages de mois, d'année et années
 * bissextiles gérés par le calendrier natif ; insensible aux changements
 * d'heure été/hiver car on travaille sur année/mois/jour).
 * Renvoie `null` si la date d'entrée est absente ou invalide.
 */
export const addCalendarDays = (value, days) => {
  const base = parseSageDate(value);
  if (!base) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + (Number(days) || 0));
};

// Date absente/illisible → chaîne vide (jamais « Invalid Date » ni la date du jour).
export const formatSageDate = (value, format = 'DD/MM/YYYY') => {
  const safeDate = parseSageDate(value);
  if (!safeDate) return '';

  const day = String(safeDate.getDate()).padStart(2, '0');
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const year = String(safeDate.getFullYear());

  return String(format || 'DD/MM/YYYY')
    .replace(/YYYY/g, year)
    .replace(/YY/g, year.slice(-2))
    .replace(/MM/g, month)
    .replace(/DD/g, day);
};

export const formatSageDecimal = (value, decimalSeparator = ',', decimals = 2) => {
  const numeric = Number(value || 0);
  const fixed = numeric.toFixed(decimals);
  return decimalSeparator === ',' ? fixed.replace('.', ',') : fixed;
};

// Quantités et taux : pas de décimales inutiles (2 → « 2 », 5.5 → « 5,5 »).
export const formatSageNumber = (value, decimalSeparator = ',') => {
  const numeric = Number(value || 0);
  if (Number.isInteger(numeric)) return String(numeric);
  const text = String(numeric);
  return decimalSeparator === ',' ? text.replace('.', ',') : text;
};

const escapeCsvField = (value, separator) => {
  const text = String(value ?? '');
  if (
    text.includes(separator) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/* ─── Construction du modèle d'export ────────────────────────────────────── */
const TEXT_ONLY_PRODUCT_ID = 'text-only';

const resolveLineNature = (item) => {
  switch (item?.productId) {
    case 'gestion-dechets':
      return 'recyclage';
    case 'forfait-deplacement':
      return 'livraison';
    case 'metrage-technique-validation':
      return 'metrage';
    case 'remise-commerciale':
      return 'remise';
    case TEXT_ONLY_PRODUCT_ID:
      return 'autre';
    default:
      return 'fourniture';
  }
};

const FIXED_QUANTITY_PRODUCT_IDS = new Set([
  'gestion-dechets',
  'remise-commerciale',
  TEXT_ONLY_PRODUCT_ID,
]);

/**
 * Construit le modèle d'export Sage d'un devis : document, lignes contrôlées,
 * ventilation TVA et anomalies. Les montants proviennent des dépendances
 * injectées (moteur de calcul de l'application) — jamais recalculés ici.
 *
 * @param {object} input
 * @param {string}  input.quoteId          identifiant Firestore du devis
 * @param {string}  input.quoteNumber      numéro de devis (DV-…) — identifiant externe
 * @param {string}  input.referenceDevis   référence chantier/client éventuelle
 * @param {string}  input.clientName       nom du client (informatif)
 * @param {*}       input.issueDate        date d'émission du devis
 * @param {Array}   input.cartItems        lignes de la variante à exporter
 * @param {number}  input.tvaRate          TVA par défaut de la variante
 * @param {number}  input.commissionPercent commission du devis (quoteSettings)
 * @param {object}  input.settings         paramètres Compta normalisés
 * @param {*}       input.exportDate       date de génération du fichier
 * @param {object}  deps  { applyCommissionToCartItems, calculateItemPrice,
 *                          getItemPricingSummary, computeQuoteTotals,
 *                          getItemTvaRate, generateDesignation?, getPoseLabel? }
 */
export const buildSageExportModel = (input, deps) => {
  const settings = normalizeComptaSettings(input?.settings);
  // Avertissements calculés en amont par l'appelant (ex. « variante signée
  // exportée ») : intégrés au modèle pour un rendu homogène des anomalies.
  const issues = Array.isArray(input?.extraIssues) ? [...input.extraIssues] : [];
  const lines = [];

  const {
    applyCommissionToCartItems,
    calculateItemPrice,
    getItemPricingSummary,
    computeQuoteTotals,
    getItemTvaRate,
    generateDesignation,
    getPoseLabel,
  } = deps || {};

  const rawItems = Array.isArray(input?.cartItems) ? input.cartItems : [];
  const commissionPercent = Number(input?.commissionPercent) || 0;
  const items =
    typeof applyCommissionToCartItems === 'function'
      ? applyCommissionToCartItems(rawItems, commissionPercent)
      : rawItems;

  const defaultTvaRate = input?.tvaRate;
  const externalId = sanitizeCode(input?.quoteNumber, input?.quoteId ? `Q-${input.quoteId}` : '');

  if (!externalId) {
    issues.push({
      level: 'error',
      code: 'external-id-missing',
      message: "Le devis n'a ni numéro ni identifiant : impossible de créer la référence Sage.",
    });
  }

  let order = 0;

  const pushLine = ({ item, nature, rawDesignation, quantity, unitPriceHT, lineHT, tvaRate }) => {
    order += 1;
    const regimeId = resolveVatRegimeId(tvaRate, settings);
    const sageArticle = resolveSageArticle(regimeId, nature, settings);
    // designationFull = désignation technique COMPLÈTE (aplatie, sans mentions
    // de remise), conservée dans le modèle et l'historique. `designation` est
    // la valeur réellement exportée dans le CSV : identique à la complète si
    // elle tient dans la limite, sinon compressée par étapes (détails sans
    // valeur facture retirés en premier), tronquée en tout dernier recours.
    const designationFull = flattenSageDesignation(rawDesignation);
    const designation = compressSageDesignation(designationFull, settings.maxDesignationLength);
    const line = {
      order,
      itemId: item?.id ?? null,
      nature,
      natureLabel: SAGE_LINE_NATURES[nature] || SAGE_LINE_NATURES.autre,
      designation,
      designationFull,
      quantity,
      unitPriceHT: roundCurrency(unitPriceHT),
      lineHT: roundCurrency(lineHT),
      tvaRate: Number(tvaRate) || 0,
      regimeId,
      regimeLabel: getSageVatRegime(regimeId)?.label || 'Régime inconnu',
      sageArticle,
    };
    lines.push(line);

    if (!designationFull) {
      issues.push({
        level: 'error',
        code: 'missing-designation',
        order,
        message: `Ligne ${order} : désignation absente.`,
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({
        level: 'error',
        code: 'invalid-quantity',
        order,
        message: `Ligne ${order} : quantité invalide (${quantity}).`,
      });
    }
    if (!Number.isFinite(line.unitPriceHT)) {
      issues.push({
        level: 'error',
        code: 'invalid-price',
        order,
        message: `Ligne ${order} : prix unitaire HT invalide.`,
      });
    }
    if (!regimeId) {
      issues.push({
        level: 'error',
        code: 'unknown-vat',
        order,
        message: `Ligne ${order} : taux de TVA non reconnu (${tvaRate}).`,
      });
    } else if (!sageArticle) {
      issues.push({
        level: 'error',
        code: 'missing-article',
        order,
        message: `Ligne ${order} : aucun code article Sage configuré pour « ${line.regimeLabel} » (${line.natureLabel}).`,
      });
    }
    return line;
  };

  items.forEach((item) => {
    if (item?.productId === TEXT_ONLY_PRODUCT_ID && !settings.includeTextOnlyLines) {
      return;
    }

    const calc = calculateItemPrice(item);
    const pricingSummary =
      typeof getItemPricingSummary === 'function' ? getItemPricingSummary(item, calc) : null;
    const tvaRate =
      typeof getItemTvaRate === 'function'
        ? getItemTvaRate(item, defaultTvaRate)
        : Number(item?.tvaRate ?? defaultTvaRate) || 0;

    const rawDesignation =
      item?.customDescription ||
      (typeof generateDesignation === 'function'
        ? generateDesignation(item, calc, pricingSummary)
        : null) ||
      item?.productLabel ||
      '';

    const quantity = FIXED_QUANTITY_PRODUCT_IDS.has(item?.productId)
      ? 1
      : Number(item?.quantity || 1);

    pushLine({
      item,
      nature: resolveLineNature(item),
      rawDesignation,
      quantity,
      unitPriceHT: calc.unitPriceAfterDiscount,
      lineHT: calc.totalLine,
      tvaRate,
    });

    // Sous-ligne de pose : même logique que computeQuoteTotals / le PDF
    // (pose facturée par unité, au même taux de TVA que la fourniture).
    // Une pose à 0 € (offerte) reste exportée : ligne gratuite assumée.
    if (item?.includePose) {
      const poseUnit = roundCurrency(calc.posePrice);
      const poseLabel =
        typeof getPoseLabel === 'function'
          ? getPoseLabel(item)
          : `Pose ${item?.productLabel || ''}`.trim();
      pushLine({
        item,
        nature: 'pose',
        rawDesignation: poseLabel,
        quantity,
        unitPriceHT: poseUnit,
        lineHT: roundCurrency(poseUnit * quantity),
        tvaRate,
      });
    }
  });

  if (!lines.length) {
    issues.push({
      level: 'error',
      code: 'no-lines',
      message: 'Le devis ne contient aucune ligne exportable.',
    });
  }

  // Avertissements VISIBLES quand la limite de désignation raccourcit des
  // lignes (la version complète reste dans le modèle et l'historique) :
  //  • compression : seuls des détails secondaires ont été retirés ;
  //  • troncature « … » : la compression n'a pas suffi, du contenu est coupé.
  if (settings.maxDesignationLength > 0) {
    const shortened = lines.filter((line) => line.designation !== line.designationFull);
    const truncatedLines = shortened.filter((line) => line.designation.endsWith('…'));
    const compressedLines = shortened.filter((line) => !line.designation.endsWith('…'));

    if (compressedLines.length > 0) {
      issues.push({
        level: 'warning',
        code: 'designation-compressed',
        message: `Limite Sage de ${settings.maxDesignationLength} caractères : ${
          compressedLines.length
        } désignation(s) compactée(s) sans perte d'info facture — détails secondaires retirés (hauteur de poignée, descriptif profilé…) sur la ligne${
          compressedLines.length > 1 ? 's' : ''
        } ${compressedLines.map((line) => line.order).join(', ')}. Texte complet conservé dans l'historique.`,
      });
    }
    if (truncatedLines.length > 0) {
      issues.push({
        level: 'warning',
        code: 'designation-truncated',
        message: `Limite de désignation active (${settings.maxDesignationLength} caractères) : ${
          truncatedLines.length
        } ligne(s) raccourcie(s) dans le CSV Sage (ligne${
          truncatedLines.length > 1 ? 's' : ''
        } ${truncatedLines.map((line) => line.order).join(', ')}).`,
      });
    }
  }

  // Totaux de contrôle : le devis fait foi (même moteur que l'affichage/PDF).
  const totals = computeQuoteTotals(items, defaultTvaRate);
  const exportedHT = roundCurrency(lines.reduce((sum, line) => sum + line.lineHT, 0));
  if (Math.abs(exportedHT - roundCurrency(totals.totalHT)) > 0.01) {
    issues.push({
      level: 'error',
      code: 'totals-mismatch',
      message: `Total HT exporté (${exportedHT.toFixed(2)} €) différent du total du devis (${Number(
        totals.totalHT
      ).toFixed(2)} €).`,
    });
  }

  // Ventilation par régime (contrôle avant import + récapitulatif à l'écran).
  const vatBreakdown = [];
  lines.forEach((line) => {
    if (!line.regimeId) return;
    let bucket = vatBreakdown.find((entry) => entry.regimeId === line.regimeId);
    if (!bucket) {
      bucket = {
        regimeId: line.regimeId,
        regimeLabel: line.regimeLabel,
        rate: line.tvaRate,
        totalHT: 0,
        tva: 0,
      };
      vatBreakdown.push(bucket);
    }
    bucket.totalHT = roundCurrency(bucket.totalHT + line.lineHT);
  });
  vatBreakdown.forEach((bucket) => {
    bucket.tva = roundCurrency(bucket.totalHT * (bucket.rate / 100));
  });

  const exportedTva = roundCurrency(vatBreakdown.reduce((sum, bucket) => sum + bucket.tva, 0));

  // Encodage Windows-1252 : rien n'est perdu en silence. Les caractères encore
  // incompatibles APRÈS la normalisation contrôlée sont signalés ici, AVANT la
  // génération (ils seraient remplacés par « ? » dans le fichier).
  if (settings.encoding === 'windows-1252') {
    const csvBoundText = [
      settings.pieceType,
      settings.placeholderClientCode,
      externalId,
      sanitizeText(input?.referenceDevis, ''),
      ...lines.map((line) => `${line.sageArticle} ${line.designation}`),
    ].join(' ');
    const unsupportedChars = getCp1252UnsupportedChars(csvBoundText);
    if (unsupportedChars.length > 0) {
      issues.push({
        level: 'warning',
        code: 'encoding-incompatible',
        message: `Caractères non pris en charge par l'encodage Windows-1252 : ${unsupportedChars
          .map((char) => `« ${char} »`)
          .join(', ')} — ils seront remplacés par « ? » dans le fichier. Corrigez la désignation ou passez l'encodage en UTF-8.`,
      });
    }
  }

  // Date de pièce : STRICTEMENT validée. Absente ou illisible → erreur
  // bloquante, jamais de repli silencieux sur la date du jour.
  const rawDocumentDate =
    settings.dateSource === 'export'
      ? input?.exportDate
      : input?.issueDate ?? input?.exportDate;
  const documentDate = parseSageDate(rawDocumentDate);
  if (!documentDate) {
    issues.push({
      level: 'error',
      code: 'invalid-piece-date',
      message: 'Date de pièce absente ou invalide.',
    });
  }
  // Date de livraison exigée par l'import Sage : date de la pièce + délai
  // calendaire configuré, calculée UNIQUEMENT depuis une date de pièce valide.
  // Renseignée sur chaque ligne L (Lg Date Liv. article).
  const deliveryDate = documentDate
    ? addCalendarDays(documentDate, settings.deliveryDelayDays)
    : null;

  const model = {
    formatVersion: SAGE_EXPORT_FORMAT_VERSION,
    settings,
    document: {
      quoteId: input?.quoteId || null,
      externalId,
      pieceType: settings.pieceType,
      clientCode: settings.placeholderClientCode,
      clientLabel: settings.placeholderClientLabel,
      clientName: sanitizeText(input?.clientName, ''),
      // Aplatie : aucun champ du CSV ne doit contenir de retour à la ligne
      // (même correctement échappé, un enregistrement multi-lignes est fragile
      // pour un import Sage).
      referenceDevis: sanitizeText(input?.referenceDevis, '').replace(/\s+/g, ' '),
      date: documentDate,
      dateLabel: formatSageDate(documentDate, settings.dateFormat),
      deliveryDate,
      deliveryDelayDays: settings.deliveryDelayDays,
      // Même format STRICT que la colonne CSV (JJ/MM/AAAA) : la prévisualisation
      // affiche exactement ce que Sage recevra.
      deliveryDateLabel: formatSageDate(deliveryDate, 'DD/MM/YYYY'),
    },
    lines,
    totals: {
      totalHT: roundCurrency(totals.totalHT),
      totalTva: roundCurrency(totals.tva),
      totalTTC: roundCurrency(totals.totalTTC),
      exportedHT,
      exportedTva,
      exportedTTC: roundCurrency(exportedHT + exportedTva),
    },
    vatBreakdown,
    issues,
    errors: issues.filter((issue) => issue.level === 'error'),
    warnings: issues.filter((issue) => issue.level === 'warning'),
  };
  model.isValid = model.errors.length === 0;

  return model;
};

/* ─── Rendu CSV ──────────────────────────────────────────────────────────── */
export const SAGE_CSV_COLUMNS = Object.freeze([
  'Type',
  'TypePiece',
  'Date',
  'Client',
  'Reference',
  'RefChantier',
  'Article',
  'Designation',
  'Quantite',
  'PrixUnitaireHT',
  'MontantHT',
  'TauxTVA',
  // Correspondance Sage : DateLivraisonLigne → « Lg Date Liv. article ».
  // Vide sur la ligne E, renseignée sur CHAQUE ligne L, toujours au format
  // strict JJ/MM/AAAA (jamais ISO, ni heure, ni Date sérialisée).
  'DateLivraisonLigne',
]);

/**
 * Rend le CSV du modèle. Layout v1 « sage-e-l » : une ligne E (en-tête de
 * pièce) suivie des lignes L (détail). Fins de ligne CRLF (Windows / Sage).
 */
export const buildSageCsv = (model, overrideSettings = null) => {
  const settings = overrideSettings
    ? normalizeComptaSettings(overrideSettings)
    : model.settings;
  const separator = settings.columnSeparator;
  const rows = [];

  if (settings.includeHeaderRow) {
    rows.push([...SAGE_CSV_COLUMNS]);
  }

  const { document } = model;
  // Garde-fou : aucun CSV ne peut être produit sans date de pièce valide
  // (le modèle porte déjà l'erreur bloquante `invalid-piece-date`).
  const pieceDate = parseSageDate(document.date);
  if (!pieceDate) {
    throw new Error('Date de pièce absente ou invalide — export impossible.');
  }
  const deliveryDate =
    parseSageDate(document.deliveryDate) ??
    addCalendarDays(pieceDate, settings.deliveryDelayDays);
  // Format STRICT JJ/MM/AAAA exigé par Sage, volontairement indépendant du
  // « Format de date » configurable (jamais d'ISO, d'heure, de null ni
  // d'« Invalid Date » dans cette colonne).
  const deliveryLabel = formatSageDate(deliveryDate, 'DD/MM/YYYY');

  rows.push([
    'E',
    document.pieceType,
    formatSageDate(pieceDate, settings.dateFormat),
    document.clientCode,
    document.externalId,
    document.referenceDevis,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  model.lines.forEach((line) => {
    rows.push([
      'L',
      '',
      '',
      '',
      '',
      '',
      line.sageArticle,
      line.designation,
      formatSageNumber(line.quantity, settings.decimalSeparator),
      formatSageDecimal(line.unitPriceHT, settings.decimalSeparator),
      formatSageDecimal(line.lineHT, settings.decimalSeparator),
      formatSageNumber(line.tvaRate, settings.decimalSeparator),
      deliveryLabel,
    ]);
  });

  return `${rows
    .map((row) => row.map((field) => escapeCsvField(field, separator)).join(separator))
    .join('\r\n')}\r\n`;
};

/* ─── Nom de fichier ─────────────────────────────────────────────────────── */
const sanitizeFileNamePart = (value) =>
  String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-{2,}/g, '-');

export const buildSageExportFilename = (model, version = 1) => {
  const settings = model.settings;
  const name = settings.fileNamePattern
    .replace(/\{prefix\}/g, settings.filePrefix || '')
    .replace(/\{numero\}/g, model.document.externalId || 'devis')
    .replace(/\{date\}/g, formatSageDate(model.document.date, 'YYYYMMDD'))
    .replace(/\{version\}/g, String(version));
  const base = sanitizeFileNamePart(name) || 'export-sage';
  return base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`;
};

/* ─── Empreinte de contenu (anti-doublon) ────────────────────────────────── */
// djb2 — suffisant pour détecter « même contenu » sans dépendance crypto.
export const hashSageContent = (content) => {
  const text = String(content || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length}`;
};

/**
 * Cherche parmi les exports existants d'un devis celui qui rendrait une
 * nouvelle génération redondante (même contenu, export encore actif).
 */
export const findDuplicateSageExport = (existingExports, contentHash) =>
  (Array.isArray(existingExports) ? existingExports : []).find(
    (record) =>
      record &&
      record.contentHash === contentHash &&
      isActiveSageExportStatus(record.status)
  ) || null;

/* ─── Encodage du fichier ────────────────────────────────────────────────── */
// Caractères 0x80–0x9F de Windows-1252 (le reste est identique à Latin-1).
// Les typographiques courants (’ “ ” – — … œ €) et les symboles ° × sont donc
// nativement couverts : aucun remplacement pour le français usuel.
const CP1252_OVERRIDES = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91,
  '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
  '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// Normalisation CONTRÔLÉE avant encodage CP1252 : équivalents sans perte de
// sens pour des caractères Unicode proches mais absents de la table.
// Volontairement courte et documentée — tout le reste est SIGNALÉ, jamais
// remplacé en silence (cf. getCp1252UnsupportedChars + warning du modèle).
const CP1252_FALLBACKS = {
  '‐': '-', // trait d'union Unicode
  '‑': '-', // trait d'union insécable
  '‒': '-', // tiret numérique
  '―': '—', // barre horizontale → tiret cadratin
  '′': "'", // prime (minutes)
  '″': '"', // double prime (secondes)
  'ʼ': "'", // lettre apostrophe
  ' ': ' ', // espace insécable (0xA0 existe mais Sage préfère l'espace simple)
  ' ': ' ', // espace fine insécable
  ' ': ' ', // espace fine
  ' ': ' ', // espace ultra-fine
  '​': '',  // espace de largeur nulle
  'ﬁ': 'fi', // ligature fi
  'ﬂ': 'fl', // ligature fl
  '⁄': '/', // barre de fraction
};

// Pattern dérivé des clés : impossible de désynchroniser table et regex.
const CP1252_FALLBACK_PATTERN = new RegExp('[' + Object.keys(CP1252_FALLBACKS).join('') + ']', 'g');

const isCp1252Encodable = (char) => {
  const codePoint = char.charCodeAt(0);
  return (
    codePoint < 0x80 ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    CP1252_OVERRIDES[char] !== undefined
  );
};

/** Applique la table d'équivalents contrôlés (aucune autre transformation). */
export const normalizeForCp1252 = (text) =>
  String(text || '').replace(CP1252_FALLBACK_PATTERN, (char) => CP1252_FALLBACKS[char] ?? char);

/**
 * Caractères qui resteraient incompatibles Windows-1252 APRÈS la normalisation
 * contrôlée (donc réellement remplacés par « ? » à l'encodage). Sert à
 * avertir l'utilisateur AVANT la génération — jamais de perte silencieuse.
 * @returns {string[]} caractères uniques, dans l'ordre d'apparition
 */
export const getCp1252UnsupportedChars = (text) => {
  const normalized = normalizeForCp1252(text);
  const unsupported = [];
  for (const char of normalized) {
    if (!isCp1252Encodable(char) && !unsupported.includes(char)) {
      unsupported.push(char);
    }
  }
  return unsupported;
};

/**
 * Encode le contenu CSV en octets selon l'encodage configuré.
 * Windows-1252 : encodeur maison (TextEncoder ne gère que l'UTF-8) —
 * normalisation contrôlée d'abord, puis « ? » pour les caractères restants
 * (déjà signalés en avertissement par le modèle : rien n'est perdu en silence).
 * @returns {Uint8Array}
 */
export const encodeSageCsv = (content, encoding = 'windows-1252') => {
  const text = String(content || '');

  if (encoding === 'utf8' || encoding === 'utf8-bom') {
    const encoded = new TextEncoder().encode(text);
    if (encoding === 'utf8') return encoded;
    const withBom = new Uint8Array(encoded.length + 3);
    withBom.set([0xef, 0xbb, 0xbf], 0);
    withBom.set(encoded, 3);
    return withBom;
  }

  const normalized = normalizeForCp1252(text);
  const bytes = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const codePoint = normalized.charCodeAt(index);
    if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes[index] = codePoint;
    } else if (CP1252_OVERRIDES[char] !== undefined) {
      bytes[index] = CP1252_OVERRIDES[char];
    } else {
      bytes[index] = 0x3f; // '?'
    }
  }
  return bytes;
};
