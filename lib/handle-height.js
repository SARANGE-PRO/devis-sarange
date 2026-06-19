/**
 * handle-height.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Choix de la hauteur de poignée pour les menuiseries (hors volets).
 *
 * La hauteur est exprimée en millimètres, mesurée depuis le BAS de la
 * menuiserie. Par défaut la poignée est centrée (au milieu de la hauteur) :
 * un champ vide / nul signifie « centrée ».
 *
 * La « fraction » correspond à la position verticale du centre de la poignée
 * dans le vantail, exprimée en proportion depuis le HAUT (0 = haut, 1 = bas),
 * pour le rendu graphique.
 *
 * Si la hauteur d'allège (du sol au bas de la menuiserie) est connue, la
 * poignée peut être placée automatiquement « aux normes », c'est-à-dire à
 * HANDLE_NORM_FROM_FLOOR_MM du sol fini (zone d'accessibilité PMR 0,90–1,30 m).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Hauteur normative de la poignée depuis le sol fini (mm).
export const HANDLE_NORM_FROM_FLOOR_MM = 1050;

/**
 * Renvoie une hauteur en mm valide (> 0) ou null si centrée / invalide.
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export const normalizeHandleHeightMm = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Hauteur effective en mm depuis le bas : la valeur choisie, ou la hauteur
 * centrée (moitié de la menuiserie) si aucune valeur n'est fournie.
 * @param {number|string|null|undefined} handleHeightMm
 * @param {number} totalHeightMm
 * @returns {number|null}
 */
export const getEffectiveHandleHeightMm = (handleHeightMm, totalHeightMm) => {
  const explicit = normalizeHandleHeightMm(handleHeightMm);
  if (explicit != null) return explicit;
  const height = Number(totalHeightMm);
  return Number.isFinite(height) && height > 0 ? Math.round(height / 2) : null;
};

/**
 * Indique si la poignée est centrée (aucune hauteur explicite choisie).
 * @param {number|string|null|undefined} handleHeightMm
 * @returns {boolean}
 */
export const isCenteredHandleHeight = (handleHeightMm) =>
  normalizeHandleHeightMm(handleHeightMm) == null;

/**
 * Fraction verticale (0 = haut, 1 = bas) du centre de la poignée dans la
 * menuiserie, déduite de la hauteur en mm mesurée depuis le bas.
 * @param {number|string|null|undefined} handleHeightMm
 * @param {number} totalHeightMm
 * @returns {number}
 */
export const getHandleHeightFraction = (handleHeightMm, totalHeightMm) => {
  const height = Number(totalHeightMm);
  if (!Number.isFinite(height) || height <= 0) return 0.5;

  const effective = getEffectiveHandleHeightMm(handleHeightMm, height);
  if (effective == null) return 0.5;

  const fractionFromTop = (height - effective) / height;
  return Math.min(1, Math.max(0, fractionFromTop));
};

/**
 * Hauteur de poignée (mm depuis le bas) calculée pour respecter la norme,
 * à partir de la hauteur d'allège. Null si l'allège n'est pas renseignée.
 * @param {number|string|null|undefined} allegeHeightMm
 * @param {number} totalHeightMm
 * @returns {number|null}
 */
export const getNormativeHandleHeightMm = (allegeHeightMm, totalHeightMm) => {
  const allege = normalizeHandleHeightMm(allegeHeightMm);
  if (allege == null) return null;

  const fromBottom = HANDLE_NORM_FROM_FLOOR_MM - allege;
  const height = Number(totalHeightMm);
  const maxFromBottom = Number.isFinite(height) && height > 0 ? height : fromBottom;
  return Math.min(maxFromBottom, Math.max(1, fromBottom));
};

/**
 * Libellé à insérer dans la désignation du devis.
 *   • sans allège  : « à 1100 mm » ou « à 625 mm (mi-hauteur) » si centrée
 *   • avec allège  : « à 1050 mm du sol (aux normes) » si la position respecte
 *                    la norme, sinon « à {x} mm du sol »
 * @param {number|string|null|undefined} handleHeightMm
 * @param {number} totalHeightMm
 * @param {number|string|null|undefined} [allegeHeightMm]
 * @returns {string}
 */
export const getHandleHeightDescription = (handleHeightMm, totalHeightMm, allegeHeightMm) => {
  const effective = getEffectiveHandleHeightMm(handleHeightMm, totalHeightMm);
  if (effective == null) return 'hauteur standard';

  const allege = normalizeHandleHeightMm(allegeHeightMm);
  if (allege != null) {
    const fromFloor = effective + allege;
    const norm = fromFloor === HANDLE_NORM_FROM_FLOOR_MM ? ' (aux normes)' : '';
    return `à ${fromFloor} mm du sol${norm}`;
  }

  if (isCenteredHandleHeight(handleHeightMm)) {
    return `à ${effective} mm (mi-hauteur)`;
  }
  return `à ${effective} mm`;
};
