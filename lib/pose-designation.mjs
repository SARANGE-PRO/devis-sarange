/**
 * pose-designation.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Sous-ligne « Pose » de chaque poste du devis : un LIBELLÉ adapté au produit
 * (« Pose fenêtre PVC 2 vantaux », « Pose coulissant aluminium 2 vantaux –
 * 2 rails », « Pose volet roulant motorisé radio »…) et une DESCRIPTION courte
 * (une ligne, deux avec un volet monobloc) de ce que la pose comprend. La
 * pose reste secondaire par rapport au produit : sur le PDF, libellé plus
 * petit que le titre de la menuiserie, description encore plus discrète.
 *
 * Électricité : SARANGE pose et branche les volets motorisés sur une
 * alimentation mise à disposition, mais ne crée ni ne modifie d'installation
 * électrique. La mention générale (arrivée 230 V à fournir par le client) est
 * portée UNE fois par le devis, dans ses conditions (voir
 * `quoteNeedsPowerSupply` et lib/cgv-templates.mjs), jamais répétée sous
 * chaque poste ; rien pour les volets solaires ou manuels.
 *
 * Libellé et description se modifient dans le récapitulatif (`poseLabel`,
 * `poseDescription` sur l'article ; vide / null = texte automatique). Module
 * pur (aucun import) : testable par le runner Node, importable par le PDF,
 * le récapitulatif et l'export Sage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Texte libre borné : il finit sur le devis, dans la base et dans Sage.
export const POSE_DESCRIPTION_MAX_LENGTH = 600;

const MATERIAL_WORDS = Object.freeze({ pvc: 'PVC', alu: 'aluminium' });

/** Matériau du poste : champ explicite, sinon jumeau alu (-alu / feuille ALU), sinon PVC. */
export const resolvePoseMaterial = (item) => {
  const material = String(item?.material || item?.compositeMaterial || '').toLowerCase();
  if (material === 'alu' || material === 'pvc') return material;
  const id = String(item?.productId || '');
  const sheet = String(item?.sheetName || '');
  return /-alu$/i.test(id) || /\bALU\b/i.test(sheet) ? 'alu' : 'pvc';
};

/** Manœuvre d'un volet seul, d'après son produit (volet-filaire, volet-radio…). */
const standaloneVoletManoeuvre = (item) => {
  const id = String(item?.productId || '').toLowerCase();
  const label = String(item?.productLabel || '').toLowerCase();
  for (const manoeuvre of ['solaire', 'radio', 'filaire', 'manuel']) {
    if (id.includes(manoeuvre) || label.includes(manoeuvre)) return manoeuvre;
  }
  return 'manuel';
};

const isMotorized = (manoeuvre) => manoeuvre === 'filaire' || manoeuvre === 'radio';

/** Nature du poste pour la pose. */
export const resolvePoseKind = (item) => {
  if (item?.isComposite) return 'composite';
  const id = String(item?.productId || '').toLowerCase();
  const sheet = String(item?.sheetName || '');
  const label = String(item?.productLabel || '');
  if (id === 'custom-product') return 'custom';
  if (id === 'volet-box-domotique' || /^Volet Box/i.test(sheet)) return 'box-domotique';
  if (id.startsWith('volet-') || /^Volet/i.test(sheet)) return 'volet';
  if (/^porte-(reno|neuf)/.test(id) || /^Porte Entr/i.test(sheet)) return 'porte';
  if (id.startsWith('fenetre-fixe') || /^Fenêtre Fixe/i.test(sheet) || /^Fen[êe]tre fixe$/i.test(label)) return 'fixe';
  if (id.startsWith('pf-') || /^Porte-Fen/i.test(sheet) || /^Porte-fen/i.test(label)) return 'porte-fenetre';
  if (id.startsWith('coulissant') || id.startsWith('galandage') || /^(Coulissant|Galandage)/i.test(sheet) || /^Coulissant/i.test(label)) {
    return 'coulissant';
  }
  return 'fenetre';
};

// ─── Libellé ─────────────────────────────────────────────────────────────────

const VOLET_LABELS = Object.freeze({
  manuel: 'Pose volet roulant manuel',
  filaire: 'Pose volet roulant motorisé filaire',
  radio: 'Pose volet roulant motorisé radio',
  solaire: 'Pose volet roulant solaire',
});

/**
 * Configuration lisible après le nom du produit (« 2 vantaux », « 2V + 1 fixe »,
 * « 2 vantaux – 2 rails »), sans le nom lui-même ni le matériau (les lignes
 * importées du site peuvent déjà le porter).
 */
const configurationOf = (item) => {
  const label = String(item?.productLabel || '').trim();
  let rest = label
    .replace(/^(porte-fen[êe]tre|fen[êe]tre|coulissant à galandage|coulissant)\s*/i, '')
    .replace(/\b(pvc|alu|aluminium)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Coulissant « 2 vantaux 2 rails » → « 2 vantaux – 2 rails ».
  rest = rest.replace(/^(\d+\s+vantaux?)\s+(\d+\s+rails?)$/i, '$1 – $2');
  return rest;
};

/** Libellé automatique de la pose. `moduleCount` : nombre de châssis d'un composé (sans effet ici). */
export const buildPoseLabel = (item) => {
  const kind = resolvePoseKind(item);
  const material = MATERIAL_WORDS[resolvePoseMaterial(item)];
  const monobloc = item?.voletMonobloc ? ' et volet roulant monobloc' : '';
  switch (kind) {
    case 'composite':
      return `Pose châssis composé${monobloc}`;
    case 'fixe':
      return 'Pose châssis fixe';
    case 'porte':
      return "Pose porte d'entrée";
    case 'volet':
      return VOLET_LABELS[standaloneVoletManoeuvre(item)];
    case 'box-domotique':
      return 'Pose box domotique';
    case 'custom': {
      const label = String(item?.productLabel || item?.customLabel || '').trim();
      return label ? `Pose ${label}` : 'Pose';
    }
    case 'porte-fenetre':
    case 'coulissant':
    case 'fenetre':
    default: {
      const noun =
        kind === 'porte-fenetre'
          ? 'porte-fenêtre'
          : kind === 'coulissant'
            ? /galandage/i.test(String(item?.productLabel || '') + String(item?.productId || ''))
              ? 'coulissant à galandage'
              : 'coulissant'
            : 'fenêtre';
      const configuration = configurationOf(item);
      return `Pose ${noun} ${material}${configuration ? ` ${configuration}` : ''}${monobloc}`;
    }
  }
};

// ─── Description ─────────────────────────────────────────────────────────────

const DESCRIPTIONS = Object.freeze({
  fenetre: 'Installation, fixation, calfeutrement et étanchéité périphérique, réglages et contrôle du bon fonctionnement.',
  'porte-fenetre': 'Installation, fixation, calfeutrement et étanchéité, réglages des ouvrants et contrôle du fonctionnement.',
  porte: 'Installation, fixation, étanchéité, réglages des paumelles et de la serrure, contrôle du fonctionnement.',
  coulissant: 'Installation, fixation, étanchéité périphérique, réglages des vantaux et contrôle du coulissement.',
  fixe: 'Installation, fixation, calfeutrement et étanchéité périphérique, contrôle des finitions.',
  composite: 'Installation, fixation, calfeutrement et étanchéité périphérique, contrôle des finitions.',
  custom: "Dépose éventuelle, pose et raccordement d'étanchéité.",
  'box-domotique': 'Installation, paramétrage et appairage des volets.',
});

const VOLET_DESCRIPTIONS = Object.freeze({
  motorise:
    'Installation et fixation du volet roulant, branchement sur alimentation mise à disposition, réglages, programmation et essais de fonctionnement.',
  solaire: 'Installation et fixation du volet roulant, réglages, programmation et essais de fonctionnement.',
  manuel: 'Installation et fixation du volet roulant, réglages et vérification du bon fonctionnement.',
});

/** Deuxième ligne d'une pose avec volet monobloc, selon la manœuvre. */
const MONOBLOC_LINES = Object.freeze({
  motorise: 'Volet roulant monobloc : branchement sur alimentation mise à disposition, réglages, programmation et essais.',
  solaire: 'Volet roulant monobloc : réglages, programmation et essais.',
  manuel: 'Volet roulant monobloc : réglages et vérification du bon fonctionnement.',
});

const manoeuvreFamily = (manoeuvre) => (isMotorized(manoeuvre) ? 'motorise' : manoeuvre === 'solaire' ? 'solaire' : 'manuel');

/** Texte automatique de la pose (lignes séparées par un retour à la ligne). */
export const buildPoseDescription = (item) => {
  const kind = resolvePoseKind(item);
  if (kind === 'volet') return VOLET_DESCRIPTIONS[manoeuvreFamily(standaloneVoletManoeuvre(item))];
  const lines = [DESCRIPTIONS[kind] || DESCRIPTIONS.fenetre];
  if (item?.voletMonobloc && ['fenetre', 'porte-fenetre', 'coulissant', 'composite'].includes(kind)) {
    lines.push(MONOBLOC_LINES[manoeuvreFamily(item.voletMonoblocManoeuvre)]);
  }
  return lines.join('\n');
};

// ─── Alimentation électrique ─────────────────────────────────────────────────

/** Le poste comporte un volet roulant motorisé (filaire ou radio) à brancher sur du 230 V. */
export const itemNeedsPowerSupply = (item) => {
  if (item?.voletMonobloc && isMotorized(item.voletMonoblocManoeuvre)) return true;
  return resolvePoseKind(item) === 'volet' && isMotorized(standaloneVoletManoeuvre(item));
};

/** Le devis comporte au moins un volet roulant électrique : mention générale dans ses conditions. */
export const quoteNeedsPowerSupply = (items) => (Array.isArray(items) ? items : []).some(itemNeedsPowerSupply);

// ─── Textes saisis, désignation complète ─────────────────────────────────────

/**
 * Texte de pose saisi sur l'article : null = texte automatique ; chaîne
 * (même vide = pas de détail) nettoyée et bornée.
 */
export const normalizePoseDescription = (value) =>
  typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, POSE_DESCRIPTION_MAX_LENGTH)
    : null;

/** Texte de pose effectif : saisi s'il existe, sinon automatique. */
export const resolvePoseDescription = (item) => normalizePoseDescription(item?.poseDescription) ?? buildPoseDescription(item);

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
