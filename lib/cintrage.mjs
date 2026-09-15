/**
 * cintrage.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Menuiseries cintrées (catégorie « Formes spéciales ») : géométrie de l'arc,
 * règles de prix et libellés. Module PUR (aucun import applicatif) pour rester
 * testable en Node, partagé par le moteur de prix, le rendu et la désignation.
 *
 * Deux cas métier :
 *   • `imposte`  : fixe cintré en imposte, fabrication interne. La partie basse
 *                  (L × H saisies) est tarifée sur la grille comme d'habitude ;
 *                  le prix du fixe cintré est saisi et AJOUTÉ à la ligne.
 *   • `integre`  : cintrage plein cintre / intégré à l'ouvrant, sous-traité.
 *                  Le calcul automatique est désactivé : le prix total et
 *                  complet de la menuiserie est saisi manuellement.
 *
 * Géométrie : l'arc est un segment de cercle de corde L (largeur) et de
 * flèche f (hauteur de l'arc, de la naissance au sommet). f ≤ L/2 ; f = L/2
 * correspond au plein cintre (demi-cercle). Rayon R = (f² + (L/2)²) / (2f).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CINTRAGE_TYPES = Object.freeze({
  IMPOSTE: 'imposte',
  INTEGRE: 'integre',
});

export const CINTRAGE_TYPE_OPTIONS = Object.freeze([
  {
    id: CINTRAGE_TYPES.IMPOSTE,
    label: 'Fixe cintré en imposte',
    description:
      'Fabrication interne : partie basse au tarif grille, prix du fixe cintré ajouté.',
  },
  {
    id: CINTRAGE_TYPES.INTEGRE,
    label: 'Cintrage plein cintre / intégré à la fenêtre',
    description:
      'Sous-traitance : calcul automatique désactivé, prix total saisi manuellement.',
  },
]);

// Flèche minimale acceptée (mm) : en dessous, l'arc n'est plus fabricable.
export const MIN_FLECHE_MM = 20;

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toNonNegativeAmount = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

export const normalizeCintrageType = (value) =>
  value === CINTRAGE_TYPES.IMPOSTE || value === CINTRAGE_TYPES.INTEGRE ? value : null;

/**
 * Flèche maximale (mm) : L/2 (plein cintre). En cintrage intégré, l'arc est
 * compris dans la hauteur hors tout : la flèche ne peut pas dépasser H.
 */
export const getMaxFlecheMm = (type, widthMm, heightMm) => {
  const width = toPositiveInt(widthMm);
  if (!width) return 0;
  let max = Math.floor(width / 2);
  const height = toPositiveInt(heightMm);
  if (normalizeCintrageType(type) === CINTRAGE_TYPES.INTEGRE && height) {
    max = Math.min(max, height);
  }
  return max >= MIN_FLECHE_MM ? max : 0;
};

/**
 * Flèche proposée quand rien n'est saisi : plein cintre (L/2) pour le cintre
 * intégré, arc surbaissé (L/4) pour l'imposte.
 */
export const getDefaultFlecheMm = (type, widthMm, heightMm) => {
  const max = getMaxFlecheMm(type, widthMm, heightMm);
  if (!max) return 0;
  if (normalizeCintrageType(type) === CINTRAGE_TYPES.INTEGRE) return max;
  const width = toPositiveInt(widthMm);
  return Math.min(max, Math.max(MIN_FLECHE_MM, Math.round(width / 4)));
};

/** Flèche saisie bornée à [MIN_FLECHE_MM, max] ; null si vide / invalide. */
export const clampFlecheMm = (value, type, widthMm, heightMm) => {
  const parsed = toPositiveInt(value);
  if (!parsed) return null;
  const max = getMaxFlecheMm(type, widthMm, heightMm);
  if (!max) return null;
  return Math.min(max, Math.max(MIN_FLECHE_MM, parsed));
};

/** Flèche effective : valeur saisie bornée, sinon flèche par défaut. */
export const resolveFlecheMm = (value, type, widthMm, heightMm) =>
  clampFlecheMm(value, type, widthMm, heightMm) ?? getDefaultFlecheMm(type, widthMm, heightMm);

export const computeArchRadiusMm = (widthMm, flecheMm) => {
  const width = Number(widthMm);
  const fleche = Number(flecheMm);
  if (!(width > 0) || !(fleche > 0)) return 0;
  const halfWidth = width / 2;
  return (fleche * fleche + halfWidth * halfWidth) / (2 * fleche);
};

export const isPleinCintre = (widthMm, flecheMm) =>
  Number(widthMm) > 0 && Math.abs(Number(flecheMm) - Number(widthMm) / 2) < 1;

/**
 * Géométrie complète du cintrage pour une menuiserie L × H.
 *   • imposte : H = partie basse, hauteur totale = H + flèche.
 *   • integre : H = hauteur hors tout, l'arc est compris dedans.
 * Renvoie null si le type est absent/inconnu ou si les dimensions manquent.
 */
export const resolveCintrageGeometry = ({ type, flecheMm, widthMm, heightMm } = {}) => {
  const normalizedType = normalizeCintrageType(type);
  const width = toPositiveInt(widthMm);
  const height = toPositiveInt(heightMm);
  if (!normalizedType || !width || !height) return null;

  const fleche = resolveFlecheMm(flecheMm, normalizedType, width, height);
  if (!(fleche > 0)) return null;

  return {
    type: normalizedType,
    widthMm: width,
    flecheMm: fleche,
    radiusMm: Math.round(computeArchRadiusMm(width, fleche) * 100) / 100,
    bodyHeightMm: height,
    totalHeightMm: normalizedType === CINTRAGE_TYPES.IMPOSTE ? height + fleche : height,
    isPleinCintre: isPleinCintre(width, fleche),
  };
};

/**
 * Contour cintré décalé vers l'intérieur de `inset` (dormant, vantail,
 * vitrage…). Repère : origine en haut à gauche, y vers le bas, sommet de
 * l'arc en y = 0, centre du cercle en (L/2, R).
 * Renvoie l'arc intérieur concentrique (rayon R − inset) et le point où il
 * rejoint les montants verticaux (x = inset et x = L − inset).
 */
export const getArchInsetGeometry = ({ widthMm, radiusMm }, inset = 0) => {
  const width = Number(widthMm);
  const radius = Number(radiusMm);
  const cx = width / 2;
  const cy = radius;
  const r = Math.max(0, radius - inset);
  const halfSpan = Math.max(0, width / 2 - inset);
  const yJoin = cy - Math.sqrt(Math.max(0, r * r - halfSpan * halfSpan));
  return {
    cx,
    cy,
    r,
    left: inset,
    right: width - inset,
    yJoin,
    startAngle: Math.atan2(yJoin - cy, inset - cx),
    endAngle: Math.atan2(yJoin - cy, width - inset - cx),
  };
};

/**
 * Segment de cercle (fixe cintré en imposte) : arc intérieur de rayon
 * R − inset coupé par la corde horizontale y = chordY.
 */
export const getArchSegmentGeometry = ({ widthMm, radiusMm }, inset = 0, chordY) => {
  const width = Number(widthMm);
  const radius = Number(radiusMm);
  const cx = width / 2;
  const cy = radius;
  const r = Math.max(0, radius - inset);
  const dy = Number(chordY) - cy;
  const halfChord = Math.sqrt(Math.max(0, r * r - dy * dy));
  return {
    cx,
    cy,
    r,
    left: cx - halfChord,
    right: cx + halfChord,
    chordY: Number(chordY),
    startAngle: Math.atan2(dy, -halfChord),
    endAngle: Math.atan2(dy, halfChord),
  };
};

/**
 * Champs cintrage d'un article de panier (champs à plat, comme les autres
 * options). null si l'article n'est pas cintré.
 */
export const normalizeCintrage = (source = {}) => {
  const type = normalizeCintrageType(source?.cintrageType);
  if (!type) return null;
  return {
    type,
    flecheMm: toPositiveInt(source.cintrageFlecheMm) || null,
    impostePriceHt: type === CINTRAGE_TYPES.IMPOSTE ? toNonNegativeAmount(source.cintrageImpostePriceHt) : 0,
    manualPriceHt: type === CINTRAGE_TYPES.INTEGRE ? toNonNegativeAmount(source.cintrageManualPriceHt) : 0,
  };
};

/**
 * Applique la règle de prix du cintrage au couple (prix de base, options)
 * calculé automatiquement pour la menuiserie.
 *   • imposte : prix du fixe cintré ajouté aux options (avant remise).
 *   • integre : tarification automatique désactivée, le prix manuel remplace
 *               tout (base + options) ; remise, pose et commission restent
 *               gérées en aval comme pour toute menuiserie.
 */
export const applyCintrageToPricing = ({ cintrage, basePrice = 0, optionsPrice = 0 } = {}) => {
  if (!cintrage) {
    return { basePrice, optionsPrice, isManualPrice: false };
  }
  if (cintrage.type === CINTRAGE_TYPES.INTEGRE) {
    return { basePrice: cintrage.manualPriceHt, optionsPrice: 0, isManualPrice: true };
  }
  return {
    basePrice,
    optionsPrice: optionsPrice + cintrage.impostePriceHt,
    isManualPrice: false,
  };
};

const describeArc = (geometry) =>
  geometry.isPleinCintre ? 'plein cintre' : `arc surbaissé, flèche ${geometry.flecheMm} mm`;

/**
 * Lignes de désignation (devis PDF) décrivant le cintrage. Vide si l'article
 * n'est pas cintré ou si la géométrie ne peut pas être résolue.
 */
export const describeCintrageLines = (item = {}) => {
  const cintrage = normalizeCintrage(item);
  if (!cintrage) return [];
  const geometry = resolveCintrageGeometry({
    type: cintrage.type,
    flecheMm: cintrage.flecheMm,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
  });
  if (!geometry) return [];

  if (geometry.type === CINTRAGE_TYPES.IMPOSTE) {
    return [
      `Fixe cintré en imposte – ${describeArc(geometry)}`,
      `Hauteur totale hors tout ${geometry.totalHeightMm} mm (partie basse ${geometry.bodyHeightMm} mm)`,
    ];
  }
  return [`Cintrage intégré à l'ouvrant – ${describeArc(geometry)}`];
};

/** Libellé court (panier, récapitulatif). */
export const formatCintrageShortLabel = (item = {}) => {
  const cintrage = normalizeCintrage(item);
  if (!cintrage) return '';
  const geometry = resolveCintrageGeometry({
    type: cintrage.type,
    flecheMm: cintrage.flecheMm,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
  });
  const flecheLabel = geometry ? ` (flèche ${geometry.flecheMm} mm)` : '';
  if (cintrage.type === CINTRAGE_TYPES.IMPOSTE) {
    return `Fixe cintré en imposte${flecheLabel}`;
  }
  return geometry?.isPleinCintre ? 'Plein cintre intégré' : `Cintre intégré${flecheLabel}`;
};
