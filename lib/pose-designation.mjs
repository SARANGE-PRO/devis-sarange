/**
 * pose-designation.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Désignation de la sous-ligne « Pose » de chaque poste du devis : sous le
 * libellé (« Pose fenêtre 1 vantail », renommable), un texte qui dit ce que
 * la pose comprend, selon le poste :
 *  - menuiserie (fenêtre, porte-fenêtre, coulissant) : pose et fixation,
 *    calfeutrement et étanchéité, réglage des ouvrants, contrôle ;
 *  - avec volet roulant monobloc intégré : ensemble posé en une seule
 *    intervention + mise en service du volet selon la manœuvre. Quand le
 *    volet est chiffré séparément, la pose rappelle qu'elle couvre les deux ;
 *  - volet roulant seul : coffre et coulisses, raccordement selon la
 *    manœuvre, fins de course ;
 *  - porte d'entrée : rénovation sur dormant existant ou dormant neuf,
 *    paumelles et serrure ;
 *  - châssis composé : l'ensemble (N châssis) en une seule intervention ;
 *  - produit libre (fenêtre de toit…) : dépose éventuelle, pose, étanchéité.
 *
 * Le texte se modifie dans le récapitulatif (`poseDescription` sur l'article,
 * null = texte automatique). Même vocabulaire que le service « Pose des
 * menuiseries » du catalogue. Module pur (aucun import) : testable par le
 * runner Node, importable par le PDF, le récapitulatif et l'export Sage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Texte libre borné : il finit sur le devis, dans la base et dans Sage.
export const POSE_DESCRIPTION_MAX_LENGTH = 600;

const CONTROL = 'contrôle du bon fonctionnement';

/** Mise en service d'un volet roulant selon sa manœuvre (phrase sans majuscule initiale). */
export const VOLET_MANOEUVRE_WORKS = Object.freeze({
  manuel: 'réglage de la manœuvre manuelle',
  filaire: 'raccordement de la commande filaire sur alimentation en attente, réglage des fins de course',
  radio: 'raccordement du moteur sur alimentation en attente, appairage de la télécommande, réglage des fins de course',
  solaire: 'mise en service de la motorisation solaire (sans raccordement électrique), réglage des fins de course',
});

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

const voletWorks = (manoeuvre) => VOLET_MANOEUVRE_WORKS[manoeuvre] || VOLET_MANOEUVRE_WORKS.manuel;

/** Manœuvre d'un volet seul, d'après son produit (volet-filaire, volet-radio…). */
const standaloneVoletManoeuvre = (item) => {
  const id = String(item?.productId || '').toLowerCase();
  const label = String(item?.productLabel || '').toLowerCase();
  for (const manoeuvre of ['solaire', 'radio', 'filaire', 'manuel']) {
    if (id.includes(manoeuvre) || label.includes(manoeuvre)) return manoeuvre;
  }
  return 'manuel';
};

/** Nature du poste pour la pose. */
export const resolvePoseKind = (item) => {
  if (item?.isComposite) return 'composite';
  const id = String(item?.productId || '').toLowerCase();
  const sheet = String(item?.sheetName || '');
  if (id === 'custom-product') return 'custom';
  if (id === 'volet-box-domotique' || /^Volet Box/i.test(sheet)) return 'box-domotique';
  if (id.startsWith('volet-') || /^Volet/i.test(sheet)) return 'volet';
  if (/^porte-(reno|neuf)/.test(id) || /^Porte Entr/i.test(sheet)) return 'porte';
  return 'menuiserie';
};

/** Lignes de pose d'une menuiserie ou d'un ensemble composé, avec ou sans volet monobloc. */
const menuiserieLines = (item, subject) => {
  if (!item?.voletMonobloc) {
    return [
      `Pose et fixation ${subject}, calfeutrement et étanchéité.`,
      `Réglage des ouvrants, ${CONTROL}.`,
    ];
  }
  const separate = Boolean(item.voletMonoblocSeparate);
  return [
    `Pose et fixation ${subject} et du volet roulant monobloc intégré en une seule intervention${
      separate ? ' (menuiserie et volet chiffrés séparément ci-dessus)' : ''
    }, calfeutrement et étanchéité.`,
    'Réglage des ouvrants.',
    `Volet : ${voletWorks(item.voletMonoblocManoeuvre)}, ${CONTROL}.`,
  ];
};

const porteLines = (item) => {
  const id = String(item?.productId || '').toLowerCase();
  const sheet = String(item?.sheetName || '').toUpperCase();
  const isReno = id.includes('reno') || sheet.includes('RENO');
  const isNeuf = id.includes('neuf') || sheet.includes('NEUF');
  const first = isReno
    ? 'Pose en rénovation sur le dormant existant : fixation du bloc-porte, calfeutrement et étanchéité.'
    : isNeuf
      ? 'Pose du bloc-porte avec dormant neuf : fixation, calfeutrement et étanchéité.'
      : 'Pose et fixation du bloc-porte, calfeutrement et étanchéité.';
  return [first, `Réglage des paumelles et de la serrure, ${CONTROL}.`];
};

const voletLines = (item) => [
  'Pose et fixation du coffre et des coulisses, calfeutrement.',
  `${capitalize(voletWorks(standaloneVoletManoeuvre(item)))}, ${CONTROL}.`,
];

/**
 * Texte automatique de la pose (lignes séparées par un retour à la ligne).
 * `moduleCount` : nombre de châssis d'un ensemble composé (0 = non précisé).
 */
export const buildPoseDescription = (item, { moduleCount = 0 } = {}) => {
  switch (resolvePoseKind(item)) {
    case 'composite':
      return menuiserieLines(
        item,
        `de l'ensemble composé${moduleCount > 1 ? ` (${moduleCount} châssis)` : ''}`
      ).join('\n');
    case 'volet':
      return voletLines(item).join('\n');
    case 'box-domotique':
      return `Installation et paramétrage de la box domotique, appairage des volets, ${CONTROL}.`;
    case 'porte':
      return porteLines(item).join('\n');
    case 'custom':
      return "Dépose éventuelle, pose et raccordement d'étanchéité par nos équipes.";
    default:
      return menuiserieLines(item, 'de la menuiserie').join('\n');
  }
};

/**
 * Texte de pose saisi sur l'article : null = texte automatique ; chaîne
 * (même vide = pas de détail) nettoyée et bornée.
 */
export const normalizePoseDescription = (value) =>
  typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, POSE_DESCRIPTION_MAX_LENGTH)
    : null;

/** Texte de pose effectif : saisi s'il existe, sinon automatique. */
export const resolvePoseDescription = (item, options) =>
  normalizePoseDescription(item?.poseDescription) ?? buildPoseDescription(item, options);

/** Désignation complète de la sous-ligne : libellé en 1re ligne (en gras sur le PDF), détail dessous. */
export const buildPoseDesignation = (title, description) =>
  [String(title || '').trim(), String(description || '').trim()].filter(Boolean).join('\n');

/**
 * Lecture inverse du texte édité dans le récapitulatif : 1re ligne = libellé,
 * la suite = détail. Tout vide = retour aux textes automatiques.
 */
export const parsePoseDesignation = (text) => {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const label = (lines[0] || '').trim();
  const description = lines.slice(1).join('\n').trim();
  return { poseLabel: label, poseDescription: label || description ? description : null };
};
