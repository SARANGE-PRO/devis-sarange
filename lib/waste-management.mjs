/**
 * waste-management.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Poste « Évacuation et recyclage des menuiseries déposées » (ex. « Gestion
 * des déchets ») : intitulé, description et texte de ligne, partagés par le
 * catalogue, le panier, le récapitulatif, le PDF et l'export Sage. Sous
 * l'intitulé, deux lignes au plus : ce que comprend la prestation, puis, en
 * petit, le poids estimé (s'il est connu) et le centre de traitement. Les
 * devis enregistrés avec l'ancien intitulé l'affichent sous le nouveau ;
 * poids, quantités et prix ne changent pas. Module pur (aucun import).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const WASTE_MANAGEMENT_PRODUCT_ID = 'gestion-dechets';

export const WASTE_MANAGEMENT_LABEL = 'Évacuation et recyclage des menuiseries déposées';

export const WASTE_MANAGEMENT_DESCRIPTION = 'Enlèvement, transport, tri et traitement des déchets.';

/** Centre de traitement, cité en petit sur la ligne. */
export const WASTE_MANAGEMENT_CENTRE = 'BIG BENNES 77 – ZA Mont Saint-Sébastien, 77111 Soignolles-en-Brie';

const LEGACY_LABELS = Object.freeze(['Gestion des déchets', 'Gestion des dechets']);

/** Intitulé affiché : le nouveau, y compris pour une ligne enregistrée avec l'ancien. */
export const getWasteManagementLabel = (label) => {
  const text = String(label || '').trim();
  return !text || LEGACY_LABELS.includes(text) ? WASTE_MANAGEMENT_LABEL : text;
};

/** « Poids estimé : N kg », seulement quand un poids est connu. */
export const buildWasteWeightLine = (weightKg) => {
  const weight = Number(weightKg);
  return Number.isFinite(weight) && weight > 0 ? `Poids estimé : ${Math.round(weight)} kg` : '';
};

/** Ligne de détail, en petit : poids estimé (s'il existe) et centre de traitement. */
export const buildWasteDetailLine = (weightKg) =>
  `${[buildWasteWeightLine(weightKg), WASTE_MANAGEMENT_CENTRE].filter(Boolean).join(' · ')}.`;

/** Détail sous l'intitulé : description, puis poids et centre. */
export const buildWasteConfigurationText = ({ weightKg } = {}) =>
  [WASTE_MANAGEMENT_DESCRIPTION, buildWasteDetailLine(weightKg)].join('\n');

/** Désignation complète de la ligne : intitulé, description, poids et centre. */
export const buildWasteDesignation = ({ weightKg } = {}) =>
  [WASTE_MANAGEMENT_LABEL, buildWasteConfigurationText({ weightKg })].join('\n');
