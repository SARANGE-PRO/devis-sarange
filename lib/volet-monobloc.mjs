/**
 * volet-monobloc.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Couleur du volet roulant monobloc intégré, sur le modèle de l'app de métrage
 * (COULEURS.VR) : optionnelle, elle ne se choisit que si le volet diffère de
 * la menuiserie. Vide = « ton menuiserie » (coffre et tablier prennent la
 * couleur du profilé, comme aujourd'hui). Sans incidence sur le prix.
 *
 * Module pur (aucun import) : testable par le runner Node, importable par
 * les rendus écran, PDF et la désignation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const VOLET_MONOBLOC_COULEURS = Object.freeze(['Blanc', 'Gris 7016', 'Chêne doré', 'Noir']);

export const VOLET_MONOBLOC_TON_MENUISERIE = '';

/** Couleur enregistrée : une des couleurs proposées, sinon « ton menuiserie ». */
export const normalizeVoletMonoblocCouleur = (value) =>
  VOLET_MONOBLOC_COULEURS.includes(value) ? value : VOLET_MONOBLOC_TON_MENUISERIE;

/** Libellé lisible (désignation, récapitulatif). */
export const getVoletMonoblocCouleurLabel = (value) =>
  normalizeVoletMonoblocCouleur(value) || 'ton menuiserie';

/**
 * Teinte de dessin du coffre et du tablier, ou null pour reprendre celle du
 * profilé. Mêmes correspondances que le croquis de l'app de métrage.
 */
export const getVoletMonoblocCouleurHex = (value) => {
  const couleur = normalizeVoletMonoblocCouleur(value);
  if (!couleur) return null;

  const key = couleur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (key.includes('blanc') || key.includes('9016')) return '#FFFFFF';
  if (key.includes('chene')) return '#8B5A2B';
  if (key.includes('noir') || key.includes('9005')) return '#2F2F2F';
  if (key.includes('7016') || key.includes('anthracite') || key.includes('gris')) return '#4A4A4A';
  return null;
};

/** Options du sélecteur : « ton menuiserie » puis les couleurs proposées. */
export const getVoletMonoblocCouleurOptions = () => [
  { id: VOLET_MONOBLOC_TON_MENUISERIE, label: 'Ton menuiserie', hex: null },
  ...VOLET_MONOBLOC_COULEURS.map((couleur) => ({
    id: couleur,
    label: couleur,
    hex: getVoletMonoblocCouleurHex(couleur),
  })),
];
