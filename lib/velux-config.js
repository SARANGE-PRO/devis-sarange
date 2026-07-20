/**
 * velux-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Données statiques et logique métier du configurateur Velux (Hors catalogue).
 *
 * Standards de la marque Velux :
 *   • Type d'ouverture (rotation / projection) + finition (bois / polyuréthane)
 *     → préfixe technique de la référence (GGL / GGU / GPL / GPU).
 *   • Code dimensionnel (CK02 … UK08) → largeur × hauteur en cm.
 *   • Gamme (niveau d'équipement) : Standard / Confort / Tout Confort.
 *   • Stores et équipements optionnels.
 *
 * AUCUN PRIX ici : ce module ne produit que la configuration technique et la
 * référence commerciale exacte (ex. « Velux GGU MK04 (78x98) - Tout Confort
 * avec Store d'occultation intérieur »).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Type d'ouverture : définit le mouvement du battant et l'image d'aperçu. */
export const VELUX_OPENINGS = [
  {
    id: 'rotation',
    label: 'Rotation',
    description: 'Pivote sur un axe central.',
    details:
      "Le battant bascule autour d'un axe situé au milieu du cadre : idéal quand un meuble est placé sous la fenêtre, poignée en partie haute.",
    imageSrc: '/fenetre-de-toit-velux-rotation.webp',
  },
  {
    id: 'projection',
    label: 'Projection',
    description: "S'ouvre vers l'extérieur par le bas.",
    details:
      "Le battant se projette vers l'extérieur et dégage entièrement la vue : idéal pour les pentes faibles, barre de manœuvre en partie basse.",
    imageSrc: '/fenetre-de-toit-velux-projection.webp',
  },
];

/**
 * Finitions intérieures.
 * `material` pilote le préfixe technique : bois → GGL/GPL, poly → GGU/GPU.
 */
export const VELUX_FINISHES = [
  {
    id: 'bois-vernis',
    label: 'Bois vernis',
    commercialName: 'ClearFinish',
    material: 'bois',
    description: 'Pin massif verni, aspect chaleureux naturel.',
    maintenanceFree: false,
  },
  {
    id: 'bois-laque-blanc',
    label: 'Bois laqué blanc',
    commercialName: 'WhiteFinish',
    material: 'bois',
    description: 'Pin massif laqué blanc, lumineux et contemporain.',
    maintenanceFree: false,
  },
  {
    id: 'polyurethane-blanc',
    label: 'Polyuréthane blanc',
    commercialName: 'EverFinish / PVC',
    material: 'polyurethane',
    description:
      'Âme bois enrobée de polyuréthane blanc : idéal pièces humides (salle de bain, cuisine).',
    maintenanceFree: true,
  },
];

/**
 * Règle de génération du préfixe technique Velux :
 *   Rotation  + Bois          = GGL
 *   Rotation  + Polyuréthane  = GGU
 *   Projection + Bois         = GPL
 *   Projection + Polyuréthane = GPU
 */
const VELUX_PREFIXES = {
  rotation: { bois: 'GGL', polyurethane: 'GGU' },
  projection: { bois: 'GPL', polyurethane: 'GPU' },
};

/** Tailles standards Velux : code dimensionnel → largeur × hauteur (cm). */
export const VELUX_SIZES = [
  { code: 'CK02', widthCm: 55, heightCm: 78 },
  { code: 'CK04', widthCm: 55, heightCm: 98 },
  { code: 'MK04', widthCm: 78, heightCm: 98 },
  { code: 'MK06', widthCm: 78, heightCm: 118 },
  { code: 'MK08', widthCm: 78, heightCm: 140 },
  { code: 'SK06', widthCm: 114, heightCm: 118 },
  { code: 'UK04', widthCm: 134, heightCm: 98 },
  { code: 'UK08', widthCm: 134, heightCm: 140 },
];

/**
 * Raccords d'étanchéité (obligatoire) : définissent comment la fenêtre
 * s'intègre au matériau de couverture de la toiture.
 */
export const VELUX_FLASHINGS = [
  {
    id: 'edw',
    code: 'EDW',
    label: 'Tuiles',
    description:
      "Pour matériaux de couverture ondulés jusqu'à 120 mm de profil (tuiles classiques, bac acier).",
  },
  {
    id: 'eds',
    code: 'EDS',
    label: 'Ardoises',
    description:
      "Pour matériaux de couverture plats jusqu'à 8 mm d'épaisseur (ardoises, bardeaux).",
  },
  {
    id: 'edq',
    code: 'EDQ',
    label: 'Joint debout',
    description: 'Pour toitures métalliques à joint debout.',
  },
];

/** Gammes (niveau d'équipement du vitrage). */
export const VELUX_RANGES = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Double vitrage basique.',
  },
  {
    id: 'confort',
    label: 'Confort',
    description: 'Isolation thermique renforcée, vitrage feuilleté.',
  },
  {
    id: 'tout-confort',
    label: 'Tout Confort',
    description: 'Isolation thermique/acoustique, Anti-Bruit de Pluie.',
  },
];

/** Stores et équipements optionnels (un seul choix, « Aucun » par défaut). */
export const VELUX_ACCESSORIES = [
  {
    id: 'aucun',
    label: 'Aucun',
    description: 'Fenêtre seule, sans équipement complémentaire.',
    isDefault: true,
  },
  {
    id: 'store-occultation',
    label: "Store d'occultation intérieur",
    description: 'Bloque la lumière (idéal chambre).',
    isDefault: false,
  },
  {
    id: 'store-pare-soleil',
    label: 'Store extérieur pare-soleil',
    description: "Bloque la chaleur avant qu'elle n'entre.",
    isDefault: false,
  },
  {
    id: 'volet-roulant',
    label: 'Volet roulant extérieur',
    description: 'Protection thermique, phonique et sécurité.',
    isDefault: false,
  },
];

const findById = (list, id) => list.find((entry) => entry.id === id) || null;

export const getVeluxOpening = (openingId) => findById(VELUX_OPENINGS, openingId);
export const getVeluxFinish = (finishId) => findById(VELUX_FINISHES, finishId);
export const getVeluxSize = (sizeCode) =>
  VELUX_SIZES.find((entry) => entry.code === sizeCode) || null;
export const getVeluxRange = (rangeId) => findById(VELUX_RANGES, rangeId);
export const getVeluxAccessory = (accessoryId) => findById(VELUX_ACCESSORIES, accessoryId);
export const getVeluxFlashing = (flashingId) => findById(VELUX_FLASHINGS, flashingId);

/**
 * Préfixe technique Velux (GGL / GGU / GPL / GPU) à partir de l'ouverture et
 * de la finition. Renvoie null si la combinaison est incomplète ou inconnue.
 *
 * @param {string} openingId 'rotation' | 'projection'
 * @param {string} finishId  id d'une entrée de VELUX_FINISHES
 * @returns {string|null}
 */
export const getVeluxPrefix = (openingId, finishId) => {
  const finish = getVeluxFinish(finishId);
  if (!finish) return null;
  return VELUX_PREFIXES[openingId]?.[finish.material] || null;
};

/**
 * Désignation commerciale finale (raccord d'étanchéité obligatoire).
 * Ex. « Velux GGU MK04 (78x98) - Tout Confort avec Store d'occultation
 * intérieur + Raccord EDW (Tuiles) »
 *
 * @param {{opening: string, finish: string, sizeCode: string, range: string, flashing: string, accessory?: string}} selection
 * @returns {string|null} null tant que la sélection est incomplète
 */
export const buildVeluxDesignation = (selection = {}) => {
  const prefix = getVeluxPrefix(selection.opening, selection.finish);
  const size = getVeluxSize(selection.sizeCode);
  const range = getVeluxRange(selection.range);
  const flashing = getVeluxFlashing(selection.flashing);
  if (!prefix || !size || !range || !flashing) return null;

  const base = `Velux ${prefix} ${size.code} (${size.widthCm}x${size.heightCm}) - ${range.label}`;
  const accessory = getVeluxAccessory(selection.accessory || 'aucun');
  const withAccessory =
    accessory && accessory.id !== 'aucun' ? `${base} avec ${accessory.label}` : base;
  return `${withAccessory} + Raccord ${flashing.code} (${flashing.label})`;
};

/**
 * Objet retourné par le configurateur au clic « Valider cette configuration ».
 *
 * @typedef {Object} VeluxConfiguration
 * @property {'rotation'|'projection'} opening               Type d'ouverture
 * @property {'bois-vernis'|'bois-laque-blanc'|'polyurethane-blanc'} finish Finition intérieure
 * @property {string} sizeCode                                Code dimensionnel (ex. 'MK04')
 * @property {number} widthCm                                 Largeur en cm
 * @property {number} heightCm                                Hauteur en cm
 * @property {'standard'|'confort'|'tout-confort'} range      Gamme (niveau d'équipement)
 * @property {'edw'|'eds'|'edq'} flashing                     Raccord d'étanchéité (obligatoire)
 * @property {'EDW'|'EDS'|'EDQ'} flashingCode                 Code du raccord d'étanchéité
 * @property {'aucun'|'store-occultation'|'store-pare-soleil'|'volet-roulant'} accessory Équipement optionnel
 * @property {'GGL'|'GGU'|'GPL'|'GPU'} prefix                 Préfixe technique Velux
 * @property {string} designation                             Référence commerciale complète
 * @property {string} imageSrc                                Image d'aperçu correspondant à l'ouverture
 * @property {{opening: string, finish: string, finishCommercialName: string, size: string, range: string, flashing: string, accessory: string}} labels
 *   Libellés lisibles de chaque choix (pour affichage devis / récapitulatif)
 */

/**
 * Construit l'objet VeluxConfiguration complet à partir de la sélection.
 *
 * @param {{opening: string, finish: string, sizeCode: string, range: string, flashing: string, accessory?: string}} selection
 * @returns {VeluxConfiguration|null} null tant que la sélection est incomplète
 */
export const createVeluxConfiguration = (selection = {}) => {
  const opening = getVeluxOpening(selection.opening);
  const finish = getVeluxFinish(selection.finish);
  const size = getVeluxSize(selection.sizeCode);
  const range = getVeluxRange(selection.range);
  const flashing = getVeluxFlashing(selection.flashing);
  const accessory = getVeluxAccessory(selection.accessory || 'aucun');
  const prefix = getVeluxPrefix(selection.opening, selection.finish);
  const designation = buildVeluxDesignation(selection);

  if (!opening || !finish || !size || !range || !flashing || !accessory || !prefix || !designation) {
    return null;
  }

  return {
    opening: opening.id,
    finish: finish.id,
    sizeCode: size.code,
    widthCm: size.widthCm,
    heightCm: size.heightCm,
    range: range.id,
    flashing: flashing.id,
    flashingCode: flashing.code,
    accessory: accessory.id,
    prefix,
    designation,
    imageSrc: opening.imageSrc,
    labels: {
      opening: opening.label,
      finish: finish.label,
      finishCommercialName: finish.commercialName,
      size: `${size.code} (${size.widthCm} x ${size.heightCm} cm)`,
      range: range.label,
      flashing: `${flashing.code} (${flashing.label})`,
      accessory: accessory.label,
    },
  };
};
