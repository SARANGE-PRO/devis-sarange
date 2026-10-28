/**
 * petits-bois-layout.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Dessin des petits bois intégrés au vitrage : chaque barre est un vrai
 * profilé (rectangle plein + liseré fin), de la couleur du type choisi et
 * d'une largeur liée au profil (26×8, 18×8, 9×5,5), arrêtée au bord du vitrage.
 * Les verticales sont posées d'abord, les horizontales par-dessus (assemblage
 * à mi-bois) ; les types « avec croix » ajoutent un connecteur carré à chaque
 * croisement.
 *
 * Partagé par l'aperçu écran (SVG, châssis composés) et le canvas (menuiserie
 * simple et image du PDF) : c'est la seule façon d'obtenir le même dessin des
 * deux côtés. Module pur : repères et échelle sont ceux de l'appelant
 * (1 mm = 1 unité, traits proportionnels à `scaleFactor`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getPetitsBoisType, normalizePetitsBoisTypeId } from './petits-bois.mjs';

/** Liseré des barres : le même gris que les profilés du cadre. */
export const PETITS_BOIS_BORDER_COLOR = '#4A4A4A';

/**
 * Couleur de face vue de l'intérieur. Les bicolores et l'« extérieur blanc »
 * sont blancs côté pièce ; `null` = teinte du profilé (RAL au choix).
 */
const FILL_BY_TYPE = Object.freeze({
  '26x8-blanc': '#FFFFFF',
  '26x8-marron': '#4A3526', // RAL 8014
  '26x8-beige': '#E6D2B5', // RAL 1015
  '26x8-chene-dore': '#B97A3A',
  '26x8-bicolore-blanc-chene': '#FFFFFF',
  '26x8-bicolore-blanc-acajou': '#FFFFFF',
  '9x5-laiton-croix': '#C9A227',
  '9x5-blanc-croix': '#FFFFFF',
  '18x8-exterieur-blanc': '#FFFFFF',
  '26x8-teinte-hors-standard': null,
});

// Le montant d'ouvrant est dessiné 18 unités × échelle pour ~80 mm réels :
// les barres suivent la même réduction pour rester proportionnées au cadre.
const MM_TO_DRAW = 18 / 80;
const MIN_BAR_WIDTH = 2;
const JOINT_RATIO = 1.8;

const toCount = (value) => Math.max(0, Number.parseInt(value, 10) || 0);

/** Largeur réelle du profil en mm, lue dans l'identifiant (« 26x8-… » → 26). */
export const getPetitsBoisWidthMm = (typeId) => {
  const match = /^(\d+)x/.exec(normalizePetitsBoisTypeId(typeId));
  return match ? Number(match[1]) : 26;
};

/** Couleur de face du type ; teinte hors standard = couleur du profilé. */
export const getPetitsBoisFillColor = (typeId, frameColor) =>
  FILL_BY_TYPE[normalizePetitsBoisTypeId(typeId)] ?? (frameColor || '#FFFFFF');

/** Types livrés avec des connecteurs en croix aux croisements. */
export const hasPetitsBoisCrossJoints = (typeId) =>
  /-croix$/.test(normalizePetitsBoisTypeId(typeId));

/**
 * Rectangles à dessiner sur une zone vitrée (x, y, width, height).
 * Renvoie null sans barre ou sans surface.
 *
 * @returns {{ fill, border, barWidth, borderWidth, bars, joints } | null}
 *   `bars` : verticales puis horizontales, dans l'ordre de dessin ;
 *   `joints` : carrés de croisement (types « avec croix » seulement).
 */
export const buildPetitsBoisLayout = ({
  x = 0,
  y = 0,
  width,
  height,
  petitsBoisH = 0,
  petitsBoisV = 0,
  petitsBoisType,
  frameColor,
  scaleFactor = 1,
} = {}) => {
  const horizontalCount = toCount(petitsBoisH);
  const verticalCount = toCount(petitsBoisV);
  if (!(width > 0) || !(height > 0)) return null;
  if (horizontalCount === 0 && verticalCount === 0) return null;

  const typeId = normalizePetitsBoisTypeId(petitsBoisType);
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const barWidth = Math.max(MIN_BAR_WIDTH, getPetitsBoisWidthMm(typeId) * MM_TO_DRAW * scale);
  const borderWidth = Math.max(0.5, Math.min(scale, barWidth / 4));

  const verticalStep = width / (verticalCount + 1);
  const horizontalStep = height / (horizontalCount + 1);
  const verticalCenters = Array.from({ length: verticalCount }, (_, index) => x + verticalStep * (index + 1));
  const horizontalCenters = Array.from(
    { length: horizontalCount },
    (_, index) => y + horizontalStep * (index + 1)
  );

  const bars = [
    ...verticalCenters.map((centerX) => ({
      orientation: 'vertical',
      x: centerX - barWidth / 2,
      y,
      width: barWidth,
      height,
    })),
    ...horizontalCenters.map((centerY) => ({
      orientation: 'horizontal',
      x,
      y: centerY - barWidth / 2,
      width,
      height: barWidth,
    })),
  ];

  const jointSize = barWidth * JOINT_RATIO;
  const joints = hasPetitsBoisCrossJoints(typeId)
    ? verticalCenters.flatMap((centerX) =>
        horizontalCenters.map((centerY) => ({
          x: centerX - jointSize / 2,
          y: centerY - jointSize / 2,
          width: jointSize,
          height: jointSize,
        }))
      )
    : [];

  return {
    fill: getPetitsBoisFillColor(typeId, frameColor),
    border: PETITS_BOIS_BORDER_COLOR,
    barWidth,
    borderWidth,
    bars,
    joints,
  };
};

/** Type retenu pour le dessin : celui du type, sinon celui du 26×8 blanc. */
export const describePetitsBoisType = (typeId) => getPetitsBoisType(normalizePetitsBoisTypeId(typeId));
