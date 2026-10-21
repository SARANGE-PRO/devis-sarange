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

// ─── Prix du volet ───────────────────────────────────────────────────────────
// Le volet monobloc est chiffré sur la grille « Volet Filaire » aux dimensions
// de la menuiserie, plus un surcoût de manœuvre (même barème que les volets
// seuls, prix catalogue × 1,25). Un prix peut être SAISI sur la ligne
// (`voletMonoblocPriceOverride`) : indispensable en aluminium ou hors grille,
// où le tarif automatique vaut 0. Et le volet peut être AFFICHÉ SÉPARÉMENT
// (`voletMonoblocSeparate`) : la ligne du devis se partage alors entre la
// menuiserie et une sous-ligne « volet », sans changer le total de la ligne.

export const VOLET_MONOBLOC_MANOEUVRE_SURCHARGE_HT = Object.freeze({
  manuel: 0,
  filaire: 0,
  radio: 50 * 1.25,
  solaire: 240 * 1.25,
});

export const getVoletMonoblocManoeuvreSurcharge = (manoeuvre) =>
  VOLET_MONOBLOC_MANOEUVRE_SURCHARGE_HT[manoeuvre] || 0;

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Prix du volet saisi sur la ligne (HT, par unité, avant remise) : null = tarif
 * automatique ; 0 accepté (volet offert) ; jamais négatif ; arrondi au centime.
 */
export const normalizeVoletMonoblocPriceOverride = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) return null;
  return roundCurrency(number);
};

// ─── Désignation du volet ────────────────────────────────────────────────────

export const VOLET_MONOBLOC_LINE_TITLE = 'Volet roulant monobloc intégré';

export const VOLET_MONOBLOC_MANOEUVRE_LABELS = Object.freeze({
  manuel: 'manuelle (manivelle)',
  filaire: 'filaire (commande murale)',
  radio: 'radio (télécommande)',
  solaire: 'solaire (sans raccordement)',
});

/**
 * Lignes de désignation du volet (manœuvre, coloris s'il diffère de la
 * menuiserie, coffre et tablier) : dans la désignation de la menuiserie, ou
 * dans sa propre sous-ligne quand le prix est séparé.
 */
export const buildVoletMonoblocDesignationLines = (item) => {
  if (!item?.voletMonobloc) return [];
  const manoeuvre =
    VOLET_MONOBLOC_MANOEUVRE_LABELS[item.voletMonoblocManoeuvre] || VOLET_MONOBLOC_MANOEUVRE_LABELS.manuel;
  const couleur = normalizeVoletMonoblocCouleur(item.voletMonoblocCouleur);
  return [
    `${VOLET_MONOBLOC_LINE_TITLE} – manœuvre ${manoeuvre}${couleur ? ` – coloris ${couleur}` : ''}`,
    'Coffre isolé intégré – tablier aluminium double paroi isolé mousse PU',
  ];
};

/** Désignation de la sous-ligne « volet » : le titre seul en 1re ligne (en gras sur le PDF), puis le détail. */
export const getVoletMonoblocLineDesignation = (item) => {
  const [first, ...rest] = buildVoletMonoblocDesignationLines(item);
  if (!first) return '';
  const detail = first.slice(VOLET_MONOBLOC_LINE_TITLE.length).replace(/^\s*–\s*/, '');
  return [VOLET_MONOBLOC_LINE_TITLE, detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : '', ...rest]
    .filter(Boolean)
    .join('\n');
};

// ─── Prix séparé : répartition d'une ligne entre menuiserie et volet ─────────

/**
 * Quand le prix du volet est séparé, répartit les montants d'une ligne de devis
 * entre la menuiserie et le volet, à partir du calcul de la ligne (`calc`, dont
 * `voletMonoblocUnitPrice` = prix du volet HT par unité avant remise) et de son
 * résumé (`pricing` : prix avant remise). Le total de la ligne ne change pas :
 * la remise s'applique aux deux parts au même pourcentage, la marge nette et la
 * commission restent sur la menuiserie (part = ligne − volet, au centime près).
 * null quand rien n'est à séparer (pas de volet, option non cochée, ligne sans
 * calcul de volet).
 */
export const splitVoletMonoblocPricing = (item, calc, pricing) => {
  if (!item?.voletMonobloc || !item?.voletMonoblocSeparate) return null;
  const unit = Number(calc?.voletMonoblocUnitPrice);
  if (!Number.isFinite(unit)) return null;

  const quantity = Math.max(1, Number(item.quantity) || 1);
  const remise = Number(item.remise) || 0;
  const rate = remise > 0 && remise < 100 ? remise / 100 : 0;
  const lineUnit = Math.max(0, roundCurrency(calc.unitPriceAfterDiscount));
  const lineOriginalUnit = Math.max(0, roundCurrency(pricing?.originalUnitHT ?? lineUnit));
  const lineTotal = roundCurrency(calc.totalLine);
  const lineOriginalTotal = roundCurrency(pricing?.originalLineHT ?? lineTotal);

  // Le volet ne peut pas valoir plus que la ligne (prix saisi aberrant).
  const voletUnitAfterDiscount = Math.min(roundCurrency(unit * (1 - rate)), lineUnit);
  const voletOriginalUnit = Math.min(roundCurrency(unit), lineOriginalUnit);
  const volet = {
    unitPriceAfterDiscount: voletUnitAfterDiscount,
    originalUnitHT: voletOriginalUnit,
    totalLine: roundCurrency(voletUnitAfterDiscount * quantity),
    originalLineHT: roundCurrency(voletOriginalUnit * quantity),
  };
  volet.discountLineHT = roundCurrency(volet.originalLineHT - volet.totalLine);
  volet.hasDiscount = volet.discountLineHT > 0;

  const menuiserie = {
    unitPriceAfterDiscount: roundCurrency(lineUnit - volet.unitPriceAfterDiscount),
    originalUnitHT: roundCurrency(lineOriginalUnit - volet.originalUnitHT),
    totalLine: roundCurrency(lineTotal - volet.totalLine),
    originalLineHT: roundCurrency(lineOriginalTotal - volet.originalLineHT),
  };
  menuiserie.discountLineHT = roundCurrency(menuiserie.originalLineHT - menuiserie.totalLine);
  menuiserie.hasDiscount = menuiserie.discountLineHT > 0;

  return { unitPrice: unit, volet, menuiserie };
};
