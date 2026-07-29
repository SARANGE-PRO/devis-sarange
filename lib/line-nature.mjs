/**
 * line-nature.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Source de vérité UNIQUE des « natures » de ligne d'un devis, partagée entre
 * l'export Sage (lib/sage-export.mjs) et la ventilation des échéanciers
 * (lib/quote-totals.mjs, échéancier FABRICATION / POSE).
 *
 * La nature est dérivée du productId (données structurées, jamais de détection
 * par mots-clés) ; `natureOverride` permet une correction manuelle
 * exceptionnelle, ligne par ligne, avant validation du devis.
 *
 * Ce module n'importe RIEN : testable en isolation par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const LINE_NATURES = Object.freeze({
  fourniture: 'Fourniture',
  pose: 'Pose',
  livraison: 'Livraison',
  metrage: 'Métrage',
  recyclage: 'Recyclage',
  remise: 'Remise',
  autre: 'Autre',
});

export const LINE_NATURE_IDS = Object.freeze(Object.keys(LINE_NATURES));

// Natures rattachées aux PRESTATIONS_CHANTIER pour la ventilation de
// l'échéancier FABRICATION / POSE. Tout le reste (fourniture, métrage,
// remise, autre) relève de FABRICATION_FOURNITURES : produits, fabrication,
// accessoires, métrage/préparation technique et remises associées.
export const CHANTIER_NATURES = Object.freeze(['pose', 'livraison', 'recyclage']);

export const isChantierNature = (nature) => CHANTIER_NATURES.includes(nature);

export const normalizeNatureOverride = (value) =>
  typeof value === 'string' && LINE_NATURE_IDS.includes(value) ? value : '';

/**
 * Nature d'une ligne de devis. L'override manuel (exceptionnel) prime sur la
 * dérivation automatique par productId.
 */
export const resolveLineNature = (item) => {
  const override = normalizeNatureOverride(item?.natureOverride);
  if (override) return override;

  switch (item?.productId) {
    case 'gestion-dechets':
      return 'recyclage';
    case 'forfait-deplacement':
      return 'livraison';
    case 'metrage-technique-validation':
      return 'metrage';
    case 'remise-commerciale':
      return 'remise';
    case 'text-only':
      return 'autre';
    default:
      return 'fourniture';
  }
};

/* ─── Type de contrat ────────────────────────────────────────────────────── */
// AVEC_POSE dès qu'au moins une ligne de la variante inclut la pose (booléen
// structuré `includePose`, ou nature « pose » forcée manuellement). La
// livraison, le déplacement, l'évacuation ou le recyclage seuls ne qualifient
// PAS le contrat comme fourniture avec pose.

export const CONTRACT_TYPES = Object.freeze({
  AVEC_POSE: 'AVEC_POSE',
  FOURNITURE_SEULE: 'FOURNITURE_SEULE',
});

export const CONTRACT_TYPE_OVERRIDE_OPTIONS = Object.freeze([
  'auto',
  CONTRACT_TYPES.FOURNITURE_SEULE,
  CONTRACT_TYPES.AVEC_POSE,
]);

export const normalizeContractTypeOverride = (value) =>
  CONTRACT_TYPE_OVERRIDE_OPTIONS.includes(value) ? value : 'auto';

export const detectContractType = (cartItems = []) =>
  (Array.isArray(cartItems) ? cartItems : []).some(
    (item) =>
      item?.includePose === true ||
      normalizeNatureOverride(item?.natureOverride) === 'pose'
  )
    ? CONTRACT_TYPES.AVEC_POSE
    : CONTRACT_TYPES.FOURNITURE_SEULE;

/**
 * Type de contrat effectif d'une variante : détection automatique, sauf
 * correction manuelle exceptionnelle (`contractTypeOverride` des réglages).
 */
export const resolveContractType = (cartItems = [], override = 'auto') => {
  const normalized = normalizeContractTypeOverride(override);
  return normalized === 'auto' ? detectContractType(cartItems) : normalized;
};

export const getContractTypeLabel = (contractType) =>
  contractType === CONTRACT_TYPES.AVEC_POSE
    ? 'Fourniture avec pose'
    : 'Fourniture seule';

/* ─── Ventilation FABRICATION_FOURNITURES / PRESTATIONS_CHANTIER ─────────── */

const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Sous-totaux des deux catégories de la ventilation. La part chantier est
 * calculée par taux de TVA (TVA arrondie comme les buckets du devis), puis la
 * part fabrication est obtenue PAR DIFFÉRENCE avec les totaux globaux :
 * fabrication + chantier = totaux du devis, à l'euro-cent près, quels que
 * soient les arrondis.
 *
 * @param {object} input
 * @param {number} input.totalHT   total HT arrondi du devis
 * @param {number} input.totalTva  TVA totale arrondie du devis
 * @param {number} input.totalTTC  total TTC arrondi du devis
 * @param {Array<{rate:number, totalHT:number}>} input.chantierByRate
 *        HT « prestations chantier » accumulé par taux de TVA
 */
export const computeContractBreakdown = ({
  totalHT = 0,
  totalTva = 0,
  totalTTC = 0,
  chantierByRate = [],
} = {}) => {
  let chantierHT = 0;
  let chantierTva = 0;

  (Array.isArray(chantierByRate) ? chantierByRate : []).forEach((entry) => {
    const roundedHT = roundCurrency(entry?.totalHT);
    chantierHT += roundedHT;
    chantierTva += roundCurrency(roundedHT * (Number(entry?.rate || 0) / 100));
  });

  chantierHT = roundCurrency(chantierHT);
  chantierTva = roundCurrency(chantierTva);
  const chantierTTC = roundCurrency(chantierHT + chantierTva);

  return {
    fabrication: {
      totalHT: roundCurrency(totalHT - chantierHT),
      tva: roundCurrency(totalTva - chantierTva),
      totalTTC: roundCurrency(totalTTC - chantierTTC),
    },
    chantier: {
      totalHT: chantierHT,
      tva: chantierTva,
      totalTTC: chantierTTC,
    },
    hasChantier: chantierTTC > 0,
  };
};
