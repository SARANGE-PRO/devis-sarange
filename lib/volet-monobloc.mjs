/**
 * volet-monobloc.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Couleur du volet roulant monobloc intégré, sur le modèle de l'app de métrage
 * (COULEURS.VR) : optionnelle, elle ne se choisit que si le volet diffère de
 * la menuiserie. Vide = « ton menuiserie » (coffre et tablier prennent la
 * couleur du profilé, comme aujourd'hui). Couleurs proposées, ou texte libre
 * (« Autre » : RAL, teinte spéciale…). Sans incidence sur le prix.
 *
 * Module pur (aucun import) : testable par le runner Node, importable par
 * les rendus écran, PDF et la désignation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const VOLET_MONOBLOC_COULEURS = Object.freeze(['Blanc', 'Gris 7016', 'Chêne doré', 'Noir']);

export const VOLET_MONOBLOC_TON_MENUISERIE = '';

// Texte libre borné : il finit sur le devis et dans la base.
export const VOLET_MONOBLOC_COULEUR_MAX_LENGTH = 60;

/**
 * Couleur enregistrée : une des couleurs proposées ou un texte libre nettoyé
 * (espaces repliés, longueur bornée) ; vide = « ton menuiserie ».
 */
export const normalizeVoletMonoblocCouleur = (value) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, VOLET_MONOBLOC_COULEUR_MAX_LENGTH)
    : VOLET_MONOBLOC_TON_MENUISERIE;

/** La couleur fait-elle partie de la liste proposée (sinon : « Autre ») ? */
export const isPresetVoletMonoblocCouleur = (value) =>
  VOLET_MONOBLOC_COULEURS.includes(normalizeVoletMonoblocCouleur(value));

/** Libellé lisible (désignation, récapitulatif). */
export const getVoletMonoblocCouleurLabel = (value) =>
  normalizeVoletMonoblocCouleur(value) || 'ton menuiserie';

/**
 * Teinte de dessin du coffre et du tablier, ou null pour reprendre celle du
 * profilé. Mêmes correspondances que le croquis de l'app de métrage ; une
 * couleur libre sans mot-clé reconnu garde la teinte du profilé.
 */
export const getVoletMonoblocCouleurHex = (value) => {
  const couleur = normalizeVoletMonoblocCouleur(value);
  if (!couleur) return null;

  const key = couleur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (key.includes('blanc') || key.includes('9016') || key.includes('9010')) return '#FFFFFF';
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
