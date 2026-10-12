/**
 * glazing-tariff.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tarif d'achat des vitrages Riou Glass (tarif client 55253 du 24/07/2026) et
 * performances associées, pour les menuiseries PVC 28 mm et aluminium 24 mm.
 *
 * Chaque COMPOSITION est décrite une fois (verres, intercalaire par matériau,
 * prix Riou, Ug par matériau, Rw) puis déclinée en une option de vitrage par
 * matériau (`rg-vi01-pvc`, `rg-vi01-alu`), à la forme attendue par
 * lib/glazing.js et par tout ce qui lit `item.glazingOption` (libellé, Ug, g,
 * épaisseur). Les anciens vitrages (tarif précédent) sont conservés tels quels
 * sous `LEGACY_GLAZING_OPTIONS`, marqués `legacy`, pour que les devis
 * antérieurs se rouvrent et se recalculent exactement comme avant ; ils ne
 * sont plus proposés sur un nouvel article.
 *
 * Règles de prix (confirmées avec Riou) :
 *   - prix « composé » = verre + intercalaire alu + assemblage ; à défaut de
 *     composé, somme des deux faces du tarif « VI à la face » ;
 *   - warm-edge (+ 2,40 €/m² par lame) et argon (+ 0,60 €/m² par lame) sont
 *     toujours pris chez SARANGE : ils sont inclus dans `purchasePricePerM2`
 *     (deux lames sur un triple), le prix Riou brut reste dans `riouPricePerM2` ;
 *   - minimum de facturation 0,45 m² par volume, sur le verre seulement.
 *
 * Sources des performances (`ugSource`, `rwSource`, `gSource`) :
 *   'riou' publié par Riou Glass ; 'calc' Ug calculé EN 673 ; 'agc' Rw mesuré
 *   par AGC sur la composition équivalente ; 'est' interpolé, à confirmer.
 *   Le facteur solaire g n'est publié que pour trois compositions : les autres
 *   sont des ESTIMATIONS cohérentes avec l'ancien catalogue (ne servent qu'au
 *   Sw indicatif du devis).
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const GLAZING_TARIFF_DATE = '2026-07-24';
export const WARM_EDGE_PRICE_PER_M2_PER_LAME = 2.4;
export const ARGON_PRICE_PER_M2_PER_LAME = 0.6;
export const MIN_BILLED_GLASS_AREA_M2 = 0.45;
// Base de comparaison de l'ancien tarif (vitrage 4/20/4 à 37 €/m²) : conservée
// pour que le surcoût des anciens vitrages ne bouge pas sur les devis existants.
export const LEGACY_BASE_GLASS_PRICE_PER_M2 = 37;

export const GLAZING_MATERIALS = Object.freeze({ PVC: 'pvc', ALU: 'alu' });

const MATERIAL_SPECS = {
  pvc: { label: 'PVC', ugKey: 'pvc', spacerKey: 'pvc' },
  alu: { label: 'aluminium', ugKey: 'alu', spacerKey: 'alu' },
};

export const GLAZING_GROUP_LABELS = Object.freeze({
  standard: 'Standard',
  decoratif: 'Décoratif',
  solaire: 'Contrôle solaire',
  securite: 'Sécurité (feuilleté)',
  acoustique: 'Acoustique',
  triple: 'Triple vitrage',
  remplissage: 'Remplissage opaque',
  personnalise: 'Vitrages personnalisés',
  legacy: 'Anciens vitrages (devis antérieurs)',
});

const KIND_LABELS = {
  standard: 'Double vitrage isolant',
  decoratif: 'Double vitrage isolant décoratif',
  solaire: 'Double vitrage isolant contrôle solaire',
  securite: 'Double vitrage isolant feuilleté',
  acoustique: 'Double vitrage isolant acoustique',
  triple: 'Triple vitrage isolant',
};

// Verre : [libellé affiché, épaisseur mm]. Intercalaires en mm par matériau.
// Prix Riou HT/m² ; `basis` 'compose' ou 'face' (somme des deux faces).
export const RIOU_COMPOSITIONS = Object.freeze([
  {
    code: 'VI-01', category: 'standard', name: 'Clair',
    panes: [['4', 4], ['4 FE', 4]], spacer: { pvc: 20, alu: 16 },
    ref: '404', basis: 'compose', riouPricePerM2: 29,
    ug: { pvc: 1.1, alu: 1.1 }, ugSource: { pvc: 'calc', alu: 'riou' },
    g: 0.65, gSource: 'riou', tl: 0.82, rw: '30 (-1;-4)', rwDb: 30, rwSource: 'agc',
    note: 'rTherm N, couche en face 2. Ug 1,1 publié par Riou en 4/16/4 argon. Rw mesuré AGC en 4-16-4.',
  },
  {
    code: 'VI-03', category: 'decoratif', name: 'Granité G200',
    panes: [['4 G200', 4], ['4 FE', 4]], spacer: { pvc: 20, alu: 16 },
    ref: '40200', basis: 'compose', riouPricePerM2: 35,
    ug: { pvc: 1.1, alu: 1.1 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.62, gSource: 'est', rw: '≈ 30', rwDb: 30, rwSource: 'est',
    note: 'Même masse de verre que le clair : Rw identique à ± 1 dB.',
  },
  {
    code: 'VI-09', category: 'solaire', name: 'Contrôle solaire',
    panes: [['4 rSun', 4], ['4', 4]], spacer: { pvc: 20, alu: 16 },
    ref: '66489', basis: 'compose', riouPricePerM2: 38,
    ug: { pvc: 1.0, alu: 1.0 }, ugSource: { pvc: 'calc', alu: 'riou' },
    g: 0.38, gSource: 'riou', tl: 0.72, rw: '30 (-1;-4)', rwDb: 30, rwSource: 'agc',
    note: 'Couche rSun 72/38 en face 2, façades sud / ouest. Ug 1,0 publié Riou en 4/16/4.',
  },
  {
    code: 'VI-13', category: 'solaire', name: 'Contrôle solaire + feuilleté 44.2',
    panes: [['4 rSun', 4], ['44.2', 8.8]], spacer: { pvc: 15, alu: 11 },
    ref: '66494', basis: 'compose', riouPricePerM2: 61,
    ug: { pvc: 1.0, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.38, gSource: 'est', tl: 0.72, rw: '37 (-2;-6)', rwDb: 37, rwSource: 'agc',
    note: 'Rw mesuré AGC en 4-16-44.2. En alu, lame de 11 mm : Ug remonte à 1,3.',
  },
  {
    code: 'VI-10', category: 'securite', name: 'Feuilleté 33.2',
    panes: [['4 FE', 4], ['33.2', 6.4]], spacer: { pvc: 17.5, alu: 13.5 },
    ref: '44042', basis: 'compose', riouPricePerM2: 50,
    ug: { pvc: 1.1, alu: 1.2 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.6, gSource: 'est', rw: '≈ 34', rwDb: 34, rwSource: 'est',
    note: 'Classement 1B1 / P1A. Pas de mesure AGC en 4/33.2 : entre le 4/4 (30 dB) et le 4/44.2 (37 dB).',
  },
  {
    code: 'VI-11', category: 'securite', name: 'Feuilleté 44.2',
    panes: [['4 FE', 4], ['44.2', 8.8]], spacer: { pvc: 15, alu: 11 },
    ref: '44041', basis: 'compose', riouPricePerM2: 51,
    ug: { pvc: 1.1, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.58, gSource: 'est', rw: '37 (-2;-6)', rwDb: 37, rwSource: 'agc',
    note: 'Obligatoire sur les fixes toute hauteur / allèges basses. 1B1 (EN 12600) / P2A (EN 356).',
  },
  {
    code: 'VI-14', category: 'securite', name: 'Feuilleté 44.2 + G200',
    panes: [['44.2 FE', 8.8], ['4 G200', 4]], spacer: { pvc: 15, alu: 11 },
    ref: '66140', basis: 'compose', riouPricePerM2: 62,
    ug: { pvc: 1.1, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.55, gSource: 'est', rw: '≈ 37', rwDb: 37, rwSource: 'est',
  },
  {
    code: 'VI-17', category: 'securite', name: 'Feuilleté 33.2 + G200',
    panes: [['33.2 FE', 6.4], ['4 G200', 4]], spacer: { pvc: 17.5, alu: 13.5 },
    ref: '66180', basis: 'compose', riouPricePerM2: 62,
    ug: { pvc: 1.1, alu: 1.2 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.57, gSource: 'est', rw: '≈ 34', rwDb: 34, rwSource: 'est',
  },
  {
    code: 'VI-18', category: 'securite', name: 'Bi-feuilleté 33.2',
    panes: [['33.2 FE', 6.4], ['33.2', 6.4]], spacer: { pvc: 15, alu: 11 },
    ref: '66171', basis: 'compose', riouPricePerM2: 75,
    ug: { pvc: 1.1, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.57, gSource: 'est', rw: '≈ 37', rwDb: 37, rwSource: 'est',
    note: 'Deux verres de même épaisseur : moins bon qu’un 44.2/33.2 asymétrique (39 dB AGC).',
  },
  {
    code: 'VI-19', category: 'securite', name: 'Bi-feuilleté 44.2',
    panes: [['44.2 FE', 8.8], ['44.2', 8.8]], spacer: { pvc: 10, alu: 6 },
    ref: '4417', basis: 'compose', riouPricePerM2: 75,
    ug: { pvc: 1.4, alu: 2.0 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.55, gSource: 'est', rw: '≈ 38', rwDb: 38, rwSource: 'est',
    note: 'Portes, baies exposées, 1B1 / P2A sur les deux faces. En alu 24 mm, lame de 6 mm : Ug ≈ 2,0, à éviter si la thermique compte.',
  },
  {
    code: 'VI-02', category: 'acoustique', name: 'Acoustique',
    panes: [['6', 6], ['4 FE', 4]], spacer: { pvc: 18, alu: 14 },
    ref: '406', basis: 'compose', riouPricePerM2: 38,
    ug: { pvc: 1.1, alu: 1.1 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.62, gSource: 'est', rw: '36 (-1;-5)', rwDb: 36, rwSource: 'agc',
    note: 'Entrée de gamme acoustique : verre épais à l’extérieur, FE sur le 4 mm intérieur. Rw mesuré AGC en 6-15-4.',
  },
  {
    code: 'VI-20', category: 'acoustique', name: 'Acoustique',
    panes: [['8', 8], ['4 FE', 4]], spacer: { pvc: 16, alu: 12 },
    ref: '1008 + 2004', basis: 'face', riouPricePerM2: 63.71,
    ug: { pvc: 1.1, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.6, gSource: 'est', rw: '37 (-2;-5)', rwDb: 37, rwSource: 'agc',
    note: 'Hors VI composés : 8 rFloat 39,82 + 4 rTherm 23,89 à la face. Rw mesuré AGC en 8-16-4.',
  },
  {
    code: 'VI-21', category: 'acoustique', name: 'Acoustique',
    panes: [['10', 10], ['4 FE', 4]], spacer: { pvc: 14, alu: 10 },
    ref: '410', basis: 'compose', riouPricePerM2: 49,
    ug: { pvc: 1.1, alu: 1.4 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.58, gSource: 'est', rw: '≈ 38', rwDb: 38, rwSource: 'est',
    note: 'Le 10/14/4 classique, meilleur rapport acoustique/prix. En alu, lame de 10 mm : Ug 1,4.',
  },
  {
    code: 'VI-22', category: 'acoustique', name: 'Acoustique G200',
    panes: [['10 FE', 10], ['4 G200', 4]], spacer: { pvc: 14, alu: 10 },
    ref: '66319', basis: 'compose', riouPricePerM2: 62,
    ug: { pvc: 1.1, alu: 1.4 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.55, gSource: 'est', rw: '≈ 38', rwDb: 38, rwSource: 'est',
    note: 'Couche rTherm sur le 10 mm (composé Riou 10 rTherm + 4 Imprimé 200).',
  },
  {
    code: 'VI-23', category: 'acoustique', name: 'Acoustique',
    panes: [['10', 10], ['6 FE', 6]], spacer: { pvc: 12, alu: 8 },
    ref: '1010 + 2006', basis: 'face', riouPricePerM2: 87.84,
    ug: { pvc: 1.2, alu: 1.6 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.56, gSource: 'est', rw: '38 (-1;-4)', rwDb: 38, rwSource: 'agc',
    note: 'Hors VI composés : 10 rFloat 51,53 + 6 rTherm 36,31 à la face. Rw mesuré AGC en 10-15-6. En alu, lame de 8 mm : Ug 1,6.',
  },
  {
    code: 'VI-24', category: 'acoustique', name: 'Acoustique Silence',
    panes: [['6 FE', 6], ['44.2 rSonic', 8.8]], spacer: { pvc: 13, alu: 9 },
    ref: '2006 + 50023', basis: 'face', riouPricePerM2: 109.32,
    ug: { pvc: 1.2, alu: 1.5 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.55, gSource: 'est', rw: '39', rwDb: 39, rwSource: 'riou',
    note: 'Riou publie 6 / 12 / 44.2 rSonic : Rw 39 dB, Ra 38, Ra,tr 34 (fiche SO-RFG-15-01).',
  },
  {
    code: 'VI-25', category: 'acoustique', name: 'Acoustique Silence',
    panes: [['10', 10], ['44.2 rSonic FE', 8.8]], spacer: { pvc: 9 }, only: 'pvc',
    ref: '1010 + 63450', basis: 'face', riouPricePerM2: 127.42,
    ug: { pvc: 1.5 }, ugSource: { pvc: 'calc' },
    g: 0.52, gSource: 'est', rw: '≈ 43–44', rwDb: 43, rwSource: 'est',
    note: 'Haut de gamme acoustique, PVC 28 mm seulement. Ug 1,5 (lame de 9 mm TPS).',
  },
  {
    code: 'VI-12', category: 'acoustique', name: 'Feuilleté acoustique Silence',
    panes: [['4 FE', 4], ['44.2 rSonic', 8.8]], spacer: { pvc: 15, alu: 11 },
    ref: '903', basis: 'compose', riouPricePerM2: 67,
    ug: { pvc: 1.1, alu: 1.3 }, ugSource: { pvc: 'calc', alu: 'calc' },
    g: 0.58, gSource: 'est', rw: '39 (-2;-5)', rwDb: 39, rwSource: 'agc',
    note: 'Rw mesuré AGC en 4-15-44.2 Stratophone (même lame que le PVC 28).',
  },
  {
    code: 'TV-01', category: 'triple', name: 'Triple clair',
    panes: [['4 FE', 4], ['4', 4], ['4 FE', 4]], spacer: { pvc: 8 }, only: 'pvc',
    ref: '446', basis: 'compose', riouPricePerM2: 104.73,
    ug: { pvc: 1.0 }, ugSource: { pvc: 'calc' },
    g: 0.52, gSource: 'est', rw: '≈ 32', rwDb: 32, rwSource: 'est',
    note: 'Riou publie Ug 0,6 en 4/14/4/14/4 ; en lames de 8 mm le calcul EN 673 donne 0,97.',
  },
  {
    code: 'TV-02', category: 'triple', name: 'Triple G200',
    panes: [['4 FE', 4], ['4 G200', 4], ['4 FE', 4]], spacer: { pvc: 8 }, only: 'pvc',
    ref: '458', basis: 'compose', riouPricePerM2: 126.46,
    ug: { pvc: 1.0 }, ugSource: { pvc: 'calc' },
    g: 0.5, gSource: 'est', rw: '≈ 32', rwDb: 32, rwSource: 'est',
  },
  {
    code: 'TV-04', category: 'triple', name: 'Triple feuilleté 44.2',
    panes: [['4 FE', 4], ['4', 4], ['44.2 FE', 8.8]], spacer: { pvc: 6 }, only: 'pvc',
    ref: '447', basis: 'compose', riouPricePerM2: 118.56,
    ug: { pvc: 1.2 }, ugSource: { pvc: 'calc' },
    g: 0.48, gSource: 'est', rw: '≈ 35', rwDb: 35, rwSource: 'est',
    note: 'Lames de 6 mm à valider avec Riou (épaisseur réelle ≈ 28,8 mm) ; Ug 1,2, pas mieux qu’un double.',
  },
]);

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

export const buildRiouGlazingId = (code, material) =>
  `rg-${String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}-${material}`;

/** « 4/20/4 FE » ou « 4 FE/8/4/8/4 FE » pour le matériau donné. */
export const formatComposition = (composition, material) => {
  const spacer = composition.spacer?.[material];
  const parts = [];
  composition.panes.forEach((pane, index) => {
    if (index > 0) parts.push(String(spacer));
    parts.push(pane[0]);
  });
  return parts.join('/');
};

const computeThicknessMm = (composition, material) => {
  const spacer = Number(composition.spacer?.[material] || 0);
  const glass = composition.panes.reduce((sum, pane) => sum + Number(pane[1] || 0), 0);
  return Math.round(glass + spacer * (composition.panes.length - 1));
};

/**
 * Option de vitrage (forme de lib/glazing.js) pour une composition et un
 * matériau, ou null si la composition n'existe pas dans ce matériau.
 */
export const buildRiouGlazingOption = (composition, material) => {
  const spec = MATERIAL_SPECS[material];
  if (!spec) return null;
  if (composition.only && composition.only !== material) return null;
  const spacer = composition.spacer?.[material];
  if (!Number.isFinite(Number(spacer))) return null;

  const lames = composition.panes.length - 1;
  const text = formatComposition(composition, material);
  const thicknessMm = computeThicknessMm(composition, material);
  const purchasePricePerM2 = roundTo(
    Number(composition.riouPricePerM2) +
      (WARM_EDGE_PRICE_PER_M2_PER_LAME + ARGON_PRICE_PER_M2_PER_LAME) * lames,
    2
  );

  return {
    id: buildRiouGlazingId(composition.code, material),
    code: composition.code,
    material,
    label: `${KIND_LABELS[composition.category] || 'Double vitrage isolant'} ${text} ITR Argon WE (${thicknessMm} mm)`,
    shortLabel: `${composition.name} (${text})`,
    composition: text,
    lames,
    spacerMm: Number(spacer),
    purchasePricePerM2,
    riouPricePerM2: Number(composition.riouPricePerM2),
    riouRef: composition.ref,
    priceBasis: composition.basis,
    ug: composition.ug?.[spec.ugKey] ?? null,
    ugSource: composition.ugSource?.[spec.ugKey] || 'est',
    g: composition.g ?? null,
    gSource: composition.gSource || 'est',
    tl: composition.tl ?? null,
    rw: composition.rw || '',
    rwDb: composition.rwDb ?? null,
    rwSource: composition.rwSource || 'est',
    thicknessMm,
    category: composition.category,
    // Le clair FE est le vitrage inclus dans le prix de chaque menuiserie.
    isBaseIncluded: composition.code === 'VI-01',
    isOpaqueFilling: false,
    isThermalDataAvailable: true,
    note: composition.note || '',
    tariffDate: GLAZING_TARIFF_DATE,
    legacy: false,
  };
};

/** Toutes les options Riou, PVC puis aluminium, dans l'ordre du tarif. */
export const buildRiouGlazingOptions = () =>
  ['pvc', 'alu'].flatMap((material) =>
    RIOU_COMPOSITIONS.map((composition) => buildRiouGlazingOption(composition, material)).filter(
      Boolean
    )
  );

export const RIOU_PVC_DEFAULT_GLAZING_ID = buildRiouGlazingId('VI-01', 'pvc');
export const RIOU_ALU_DEFAULT_GLAZING_ID = buildRiouGlazingId('VI-01', 'alu');

/**
 * Anciens vitrages (tarif antérieur au 24/07/2026), inchangés : les devis qui
 * les référencent gardent leur libellé, leurs performances et leur surcoût
 * (base de comparaison 37 €/m²). Jamais proposés sur un nouvel article.
 */
const legacy = (option) => ({
  ...option,
  material: null,
  isOpaqueFilling: false,
  isThermalDataAvailable: true,
  legacy: true,
  extraBasePricePerM2: LEGACY_BASE_GLASS_PRICE_PER_M2,
});

export const LEGACY_GLAZING_OPTIONS = Object.freeze([
  legacy({
    id: 'dv_4_20_4_argon_we',
    label: 'Double vitrage isolant 4/20/4 ITR Argon WE (28 mm)',
    shortLabel: '4/20/4 Argon WE',
    purchasePricePerM2: 37, ug: 1.1, g: 0.63, thicknessMm: 28,
    category: 'standard', isBaseIncluded: true,
  }),
  legacy({
    id: 'dv_4_16_4_argon_we',
    label: 'Double vitrage isolant 4/16/4 ITR Argon WE (24 mm)',
    shortLabel: '4/16/4 Argon WE',
    purchasePricePerM2: 37, ug: 1.1, g: 0.63, thicknessMm: 24,
    category: 'standard', isBaseIncluded: true,
  }),
  legacy({
    id: 'dv_4_20_4_g200',
    label: 'Double vitrage isolant 4/20/4 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: '4/20/4 G200 Opaque',
    purchasePricePerM2: 42, ug: 1.1, g: 0.62, thicknessMm: 28,
    category: 'decoratif', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_33_2_18_4',
    label: 'Double vitrage isolant feuillete 33.2/18/4 ITR Argon WE (28 mm)',
    shortLabel: 'Feuillete 33.2',
    purchasePricePerM2: 67, ug: 1.1, g: 0.57, thicknessMm: 28,
    category: 'securite', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_33_2_18_4_g200',
    label: 'Double vitrage isolant feuillete 33.2/18/4 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: 'Feuillete 33.2 G200',
    purchasePricePerM2: 75, ug: 1.1, g: 0.55, thicknessMm: 28,
    category: 'securite_decoratif', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_44_2_10_44_2',
    label: 'Double vitrage isolant feuillete 44.2/10/44.2 ITR Argon WE (28 mm)',
    shortLabel: 'Feuillete 2 faces',
    purchasePricePerM2: 78, ug: 1.4, g: 0.6, thicknessMm: 28,
    category: 'securite_renforcee', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_44_2_10_44_2_g200',
    label: 'Double vitrage isolant feuillete 44.2/10/44.2 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: 'Feuillete 2 faces G200',
    purchasePricePerM2: 85, ug: 1.4, g: 0.58, thicknessMm: 28,
    category: 'securite_renforcee_decoratif', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_44_2_10_10_acoustique_we',
    label: 'Double vitrage isolant acoustique et securite 44.2-10-10 ITR Argon WE (28.8 mm)',
    shortLabel: 'Acoustique securite 44.2',
    purchasePricePerM2: 108.51, ug: 1.1, g: 0.54, thicknessMm: 29,
    category: 'securite_acoustique', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_10_14_4_acoustique_we',
    label: 'Double vitrage isolant acoustique 10-14-4 ITR Argon WE (28 mm)',
    shortLabel: 'Acoustique 10-14-4',
    purchasePricePerM2: 48.61, ug: 1.1, g: 0.57, thicknessMm: 28,
    category: 'acoustique', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_44_2_10_10_acoustique_we_g200',
    label: 'Double vitrage isolant acoustique et securite 44.2-10-10 ITR Argon WE Granite 200 (28.8 mm)',
    shortLabel: 'Acoustique securite 44.2 G200',
    purchasePricePerM2: 112.85, ug: 1.1, g: 0.51, thicknessMm: 29,
    category: 'securite_acoustique_decoratif', isBaseIncluded: false,
  }),
  legacy({
    id: 'dv_10_14_4_acoustique_we_g200',
    label: 'Double vitrage isolant acoustique 10-14-4 ITR Argon WE Granite 200 (28 mm)',
    shortLabel: 'Acoustique 10-14-4 G200',
    purchasePricePerM2: 54.25, ug: 1.1, g: 0.54, thicknessMm: 28,
    category: 'acoustique_decoratif', isBaseIncluded: false,
  }),
]);

export const isLegacyGlazing = (glazing) => glazing?.legacy === true;

/**
 * Options proposables pour un article : celles du matériau (ou sans matériau,
 * comme les vitrages personnalisés), jamais les anciens vitrages, SAUF celui
 * déjà retenu par l'article (devis antérieur), qui reste visible et sélectionné.
 */
export const filterGlazingOptionsForMaterial = (options, { material = 'pvc', selectedId = '' } = {}) =>
  (Array.isArray(options) ? options : []).filter((glazing) => {
    if (!glazing) return false;
    if (glazing.id === selectedId) return true;
    if (glazing.legacy) return false;
    return !glazing.material || glazing.material === material;
  });

/** Libellé de groupe d'une option, pour les listes regroupées. */
export const getGlazingGroupLabel = (glazing) => {
  if (!glazing) return '';
  if (glazing.legacy) return GLAZING_GROUP_LABELS.legacy;
  if (glazing.isOpaqueFilling) return GLAZING_GROUP_LABELS.remplissage;
  if (glazing.material) return GLAZING_GROUP_LABELS[glazing.category] || GLAZING_GROUP_LABELS.standard;
  return GLAZING_GROUP_LABELS.personnalise;
};
