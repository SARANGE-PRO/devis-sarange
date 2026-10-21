/**
 * pose-designation.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Désignation de la sous-ligne « Pose » de chaque poste du devis : sous le
 * libellé (« Pose fenêtre 1 vantail », renommable), UNE ligne courte qui dit
 * ce que la pose comprend (deux avec un volet roulant), parce qu'elle revient
 * sous chaque poste :
 *  - menuiserie (fenêtre, porte-fenêtre, coulissant) : fixation,
 *    calfeutrement et étanchéité, réglage des ouvrants, contrôle ;
 *  - avec volet roulant monobloc intégré : les deux posés en une seule
 *    intervention (rappel quand le volet est chiffré séparément), puis une
 *    ligne « Volet : … » selon la manœuvre. SARANGE ne fait pas
 *    d'électricité : le moteur est raccordé sur une alimentation 230 V en
 *    attente, l'électricité restant à la charge du client ;
 *  - volet roulant seul : coffre et coulisses, puis la manœuvre ;
 *  - porte d'entrée : sur dormant existant (rénovation) ou dormant neuf,
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

const CONTROL = 'contrôle du fonctionnement';
const ELECTRICITE = 'alimentation 230 V en attente (électricité à la charge du client)';

/** Mise en service d'un volet roulant selon sa manœuvre (sans majuscule initiale). */
export const VOLET_MANOEUVRE_WORKS = Object.freeze({
  manuel: 'réglage de la manœuvre',
  filaire: `raccordement sur ${ELECTRICITE}, réglages`,
  radio: `raccordement sur ${ELECTRICITE}, appairage de la télécommande, réglages`,
  solaire: 'mise en service solaire sans raccordement électrique, réglages',
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

const MENUISERIE_WORKS = 'fixation, calfeutrement et étanchéité, réglage des ouvrants';

/**
 * Lignes de pose d'une menuiserie ou d'un ensemble composé. `subject` : le
 * poste avec son article (« la menuiserie », « l'ensemble composé (3 châssis) »),
 * nommé seulement quand il faut dire que tout se pose en une seule fois.
 */
const menuiserieLines = (item, subject) => {
  if (!item?.voletMonobloc) {
    return [
      subject
        ? `${capitalize(subject)} posé en une seule intervention : ${MENUISERIE_WORKS}, ${CONTROL}.`
        : `${capitalize(MENUISERIE_WORKS)}, ${CONTROL}.`,
    ];
  }
  const what = subject || 'la menuiserie';
  const first = item.voletMonoblocSeparate
    ? `Pose unique de ${what} et du volet monobloc (deux lignes ci-dessus) : ${MENUISERIE_WORKS}.`
    : `${capitalize(what)} et le volet monobloc posés en une seule intervention : ${MENUISERIE_WORKS}.`;
  return [first, `Volet : ${voletWorks(item.voletMonoblocManoeuvre)}, ${CONTROL}.`];
};

const porteLines = (item) => {
  const id = String(item?.productId || '').toLowerCase();
  const sheet = String(item?.sheetName || '').toUpperCase();
  const works = `fixation, calfeutrement et étanchéité, réglage des paumelles et de la serrure, ${CONTROL}.`;
  if (id.includes('reno') || sheet.includes('RENO')) return [`Sur dormant existant : ${works}`];
  if (id.includes('neuf') || sheet.includes('NEUF')) return [`Dormant neuf : ${works}`];
  return [capitalize(works)];
};

const voletLines = (item) => [
  `Fixation du coffre et des coulisses, calfeutrement, ${voletWorks(standaloneVoletManoeuvre(item))}.`,
];

/**
 * Texte automatique de la pose (lignes séparées par un retour à la ligne).
 * `moduleCount` : nombre de châssis d'un ensemble composé (0 = non précisé).
 */
export const buildPoseDescription = (item, { moduleCount = 0 } = {}) => {
  switch (resolvePoseKind(item)) {
    case 'composite':
      return menuiserieLines(item, `l'ensemble composé${moduleCount > 1 ? ` (${moduleCount} châssis)` : ''}`).join('\n');
    case 'volet':
      return voletLines(item).join('\n');
    case 'box-domotique':
      return 'Installation, paramétrage et appairage des volets.';
    case 'porte':
      return porteLines(item).join('\n');
    case 'custom':
      return "Dépose éventuelle, pose et raccordement d'étanchéité.";
    default:
      return menuiserieLines(item, '').join('\n');
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
